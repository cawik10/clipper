/**
 * 💬 AUTO-FIRST COMMENT — LOGIKA POSTING (FITUR BARU!)
 * =====================================================================
 * Setelah klip terupload ke YouTube (src/lib/job-processor.ts → publishJobClips),
 * fungsi `postAutoCommentsForClips` memposting komentar pancingan hasil AI
 * (field `clip.firstComment`) memakai YouTube Data API `commentThreads.insert`.
 *
 * Prinsip: fitur ini TIDAK PERNAH melempar error ke pemanggil. Gagal / dimatikan
 * / izin kurang → klip tetap sukses terupload; hasilnya dicatat di field klip
 * (`firstCommentStatus`) dan diberitahukan lewat Telegram.
 *
 * Konfigurasi & prompt: src/lib/auto-comment-config.ts
 */
import { google } from "googleapis";
import type { ClipResult } from "@/db/schema";
import {
  AUTO_COMMENT_REQUIRED_SCOPES,
  buildFallbackComment,
  composeFinalComment,
  getAutoCommentAllowedPrivacy,
  getAutoCommentDelaySeconds,
  getAutoCommentRetries,
  getAutoCommentRetryDelaySeconds,
  isAutoCommentEnabled,
  isCommentFallbackEnabled,
  isCommentPinLinkEnabled,
} from "@/lib/auto-comment-config";

type ErrorKind = "permission" | "quota" | "disabled" | "retryable" | "other";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** null = scope tidak diketahui (token lama tanpa catatan scope) → coba saja. */
export function hasCommentScope(scope: string | null | undefined): boolean | null {
  if (!scope || !scope.trim()) return null;
  const granted = scope.split(/[\s,]+/);
  return AUTO_COMMENT_REQUIRED_SCOPES.some((s) => granted.includes(s));
}

function classifyError(err: unknown): { kind: ErrorKind; message: string } {
  const e = err as {
    code?: number | string;
    errors?: Array<{ reason?: string }>;
    response?: { status?: number; data?: { error?: { errors?: Array<{ reason?: string }> } } };
  };
  const reasons = [...(e?.errors || []), ...(e?.response?.data?.error?.errors || [])]
    .map((r) => r.reason || "")
    .join(" ");
  const message = err instanceof Error ? err.message : String(err);
  const text = `${message} ${reasons}`;
  const status = Number(e?.code ?? e?.response?.status);

  if (/commentsDisabled/i.test(text)) return { kind: "disabled", message };
  if (/quota|rateLimit/i.test(text)) return { kind: "quota", message };
  if (/insufficient|forbidden|scope|permission|invalid_grant|unauthorized/i.test(text) || status === 401) {
    return { kind: "permission", message };
  }
  // Video yang baru diupload kadang belum siap menerima komentar (videoNotFound / processing / 5xx).
  if (/videoNotFound|processing|backendError|internalError|timeout|ECONNRESET|ETIMEDOUT/i.test(text) || status >= 500 || status === 404) {
    return { kind: "retryable", message };
  }
  if (status === 403) return { kind: "permission", message };
  return { kind: "other", message };
}

/** Komentar final untuk satu klip (komentar AI → cadangan → kosong), sudah + suffix. */
export function resolveCommentForClip(clip: Pick<ClipResult, "firstComment" | "index">): string {
  const base = (clip.firstComment || "").trim() || (isCommentFallbackEnabled() ? buildFallbackComment(clip.index) : "");
  return base ? composeFinalComment(base) : "";
}

export interface AutoCommentArgs {
  clips: ClipResult[];
  accessToken: string;
  refreshToken: string;
  scope?: string | null;
  /** Status privasi video yang baru diupload (private | unlisted | public). */
  privacy: string;
  userId: string;
  /** Callback progres singkat (teks polos, tanpa Markdown) — opsional. */
  onProgress?: (message: string, percent?: number) => Promise<void>;
}

/**
 * Posting komentar pertama ke semua klip yang berhasil diupload.
 * Mengembalikan daftar klip yang sama (urutan tetap) dengan field komentar terisi.
 */
export async function postAutoCommentsForClips(args: AutoCommentArgs): Promise<ClipResult[]> {
  const { clips, accessToken, refreshToken, scope, privacy, userId, onProgress } = args;
  if (!isAutoCommentEnabled()) return clips;

  const targets = clips.filter((c) => c.youtubeVideoId && !c.firstCommentId);
  if (!targets.length) return clips;

  try {
    if (!getAutoCommentAllowedPrivacy().includes(privacy)) {
      console.log(`[auto-comment] dilewati: privasi video "${privacy}" tidak ada di YOUTUBE_AUTO_COMMENT_PRIVACY`);
      return clips;
    }

    if (hasCommentScope(scope) === false) {
      const msg = "Izin komentar YouTube belum diberikan. Kirim /connect sekali lagi lalu setujui izin baru.";
      await onProgress?.(`⚠️ Komentar otomatis dilewati: ${msg}`);
      await notifyTelegram(
        userId,
        `💬 <b>Auto-Comment dilewati</b>\n⚠️ ${escapeHtml(msg)}\n<i>(YouTube Data API butuh izin youtube.force-ssl untuk memposting komentar.)</i>`
      );
      return clips.map((c) => (targets.includes(c) ? { ...c, firstCommentStatus: "failed" as const } : c));
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    oauth2Client.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });

    const maxAttempts = getAutoCommentRetries();
    const baseRetryDelay = getAutoCommentRetryDelaySeconds() * 1000;
    const initialDelay = getAutoCommentDelaySeconds() * 1000;

    await onProgress?.("💬 Memposting komentar pertama (pancingan algoritma)...", 0);
    if (initialDelay > 0) await sleep(initialDelay);

    const updated = new Map<ClipResult, ClipResult>();
    const lines: string[] = [];
    let okCount = 0;
    let fatal: string | null = null;

    for (let t = 0; t < targets.length; t++) {
      const clip = targets[t];
      const label = `Klip ${clip.index + 1}`;

      if (fatal) {
        updated.set(clip, { ...clip, firstCommentStatus: "failed" });
        continue;
      }

      const text = resolveCommentForClip(clip);
      if (!text) {
        updated.set(clip, { ...clip, firstCommentStatus: "skipped" });
        lines.push(`⏭ ${label}: tidak ada teks komentar`);
        continue;
      }

      let posted: { id: string } | null = null;
      let lastError = "";
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const res = await youtube.commentThreads.insert({
            part: ["snippet"],
            requestBody: {
              snippet: {
                videoId: clip.youtubeVideoId!,
                topLevelComment: { snippet: { textOriginal: text } },
              },
            },
          });
          posted = { id: res.data.id || "" };
          break;
        } catch (err) {
          const c = classifyError(err);
          lastError = c.message;
          console.warn(`[auto-comment] ${label} percobaan ${attempt}/${maxAttempts} gagal (${c.kind}): ${c.message}`);
          if (c.kind === "permission" || c.kind === "quota") {
            fatal = c.kind === "quota" ? "Kuota YouTube API habis hari ini." : "Izin komentar kurang — kirim /connect sekali lagi.";
            break;
          }
          if (c.kind === "disabled") {
            lastError = "komentar dinonaktifkan di video";
            break;
          }
          if (attempt < maxAttempts) await sleep(baseRetryDelay * attempt);
        }
      }

      if (posted) {
        okCount++;
        const commentUrl = posted.id ? `https://www.youtube.com/watch?v=${clip.youtubeVideoId}&lc=${posted.id}` : undefined;
        updated.set(clip, {
          ...clip,
          firstComment: text,
          firstCommentId: posted.id || undefined,
          firstCommentUrl: commentUrl,
          firstCommentStatus: "posted",
        });
        lines.push(
          `✅ ${label}: <i>${escapeHtml(text.slice(0, 120))}</i>` +
            (isCommentPinLinkEnabled() && commentUrl ? `\n   📌 <a href="${commentUrl}">Buka komentar → ⋮ → Pin</a>` : "")
        );
      } else {
        updated.set(clip, { ...clip, firstComment: text, firstCommentStatus: "failed" });
        lines.push(`❌ ${label}: ${escapeHtml((fatal || lastError || "gagal").slice(0, 150))}`);
      }

      await onProgress?.(
        `💬 Komentar pertama ${t + 1}/${targets.length} diproses`,
        Math.round(((t + 1) / targets.length) * 100)
      );
      if (t < targets.length - 1) await sleep(1500);
    }

    await onProgress?.(`💬 Komentar pertama terpasang di ${okCount}/${targets.length} klip`, 100);

    await notifyTelegram(
      userId,
      `💬 <b>Auto-Comment</b> — ${okCount}/${targets.length} komentar terpasang\n\n${lines.join("\n")}` +
        (okCount > 0 && isCommentPinLinkEnabled()
          ? `\n\n<i>ℹ️ YouTube API tidak bisa mem-pin komentar otomatis. Tap link di atas lalu pilih ⋮ → Pin.</i>`
          : "")
    );

    return clips.map((c) => updated.get(c) || c);
  } catch (err) {
    console.error("[auto-comment] error tak terduga (diabaikan, upload tetap sukses):", err);
    return clips;
  }
}

async function notifyTelegram(userId: string, html: string): Promise<void> {
  try {
    const { resolveChatId } = await import("@/lib/analytics-store");
    const chatId = await resolveChatId(userId);
    const { bot } = await import("@/lib/telegram-bot");
    await bot.api.sendMessage(chatId, html.slice(0, 4000), {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
  } catch (err) {
    console.warn("[auto-comment] notifikasi Telegram gagal:", err instanceof Error ? err.message : err);
  }
}
