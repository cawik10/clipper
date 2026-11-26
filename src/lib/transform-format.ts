/**
 * 🎞️ FORMAT TRANSFORMATIF — RENDERER (FITUR BARU!)
 * =====================================================================
 * Dua langkah FFmpeg yang dipanggil dari `processSingleClip`
 * (src/lib/video-processor.ts):
 *
 *   1. applySplitScreen()       → klip + visual loop (atas/bawah). Dipanggil
 *                                 SEBELUM subtitle/hook/watermark supaya
 *                                 semuanya ter-render di kanvas final.
 *   2. applyTransformOverlays() → bingkai + label ("REAKSI"/"RANGKUMAN") +
 *                                 kartu komentar AI. Dipanggil SETELAH hook,
 *                                 sebelum watermark & intro/outro.
 *
 * Konfigurasi (env var TRANSFORM_*) & penjelasan: src/lib/transform-config.ts
 *
 * Tidak pernah melempar error — kalau gagal, klip sebelumnya dipakai apa
 * adanya (proses klip tidak boleh gagal gara-gara fitur ini).
 */
import { execFile } from "child_process";
import { promisify } from "util";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import {
  getTransformConfig,
  getSplitGeometry,
  getFrameLabel,
  getCommentaryHeader,
  resolveCommentaryStart,
  transformColorToFfmpeg,
  transformColorToRgb,
  type TransformConfig,
} from "@/lib/transform-config";
import { sanitizeHookText } from "@/lib/hook-config";

const execFileAsync = promisify(execFile);
const TMP_DIR = process.env.TMP_DIR || "/tmp/autoclip";
const VISUAL_CACHE_DIR = path.join(TMP_DIR, "transform_visuals");
const MAX_VISUAL_BYTES = 500 * 1024 * 1024;

export interface TransformStepResult {
  applied: boolean;
  outputPath: string;
  reason?: string;
  /** Komponen yang benar-benar dirender (untuk log). */
  parts?: string[];
}

const DEJAVU_BOLD_CANDIDATES = [
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
];

// ─── Helper umum ──────────────────────────────────────────────────────────
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** FFmpeg drawtext tidak bisa merender emoji (jadi kotak kosong) — buang. */
function stripUnrenderable(text: string): string {
  return text
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(" ").filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= maxCharsPerLine) cur += " " + w;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Escape nilai di dalam tanda kutip tunggal untuk filtergraph FFmpeg. */
function escFilterValue(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/:/g, "\\:");
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message.split("\n").slice(-4).join(" ") : String(err);
}

interface MediaInfo {
  width: number;
  height: number;
  /** Detik; 0 kalau tidak diketahui. */
  duration: number;
}

async function probeMedia(inputPath: string): Promise<MediaInfo> {
  const info: MediaInfo = { width: 1080, height: 1920, duration: 0 };
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height:format=duration",
        "-of", "json",
        inputPath,
      ],
      { timeout: 30000 }
    );
    const data = JSON.parse(stdout);
    const s = data?.streams?.[0];
    if (s?.width > 0 && s?.height > 0) {
      info.width = Number(s.width);
      info.height = Number(s.height);
    }
    const d = parseFloat(data?.format?.duration);
    if (d > 0) info.duration = d;
  } catch {
    /* pakai default 9:16 */
  }
  return info;
}

async function runFfmpeg(args: string[]): Promise<void> {
  await execFileAsync("ffmpeg", args, { timeout: 600000, maxBuffer: 20 * 1024 * 1024 });
}

const ENCODE_ARGS = [
  "-c:v", "libx264",
  "-crf", "23",
  "-preset", "fast",
  "-pix_fmt", "yuv420p",
  "-threads", "2",
  "-movflags", "+faststart",
];

function outputOk(p: string): boolean {
  return fs.existsSync(p) && fs.statSync(p).size > 0;
}

// =====================================================================
// 1) SPLIT-SCREEN
// =====================================================================
/** Warna gelap dari warna aksen (untuk gradient bawaan). */
function dimRgb(rgb: string, factor: number): string {
  const n = parseInt(rgb, 16);
  const r = Math.round(((n >> 16) & 255) * factor);
  const g = Math.round(((n >> 8) & 255) * factor);
  const b = Math.round((n & 255) * factor);
  return [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();
}

const inFlightDownloads = new Map<string, Promise<string | null>>();

/** Sumber loop → file lokal. Path lokal dipakai langsung; URL diunduh sekali & di-cache. */
async function resolveVisualFile(source: string): Promise<string | null> {
  try {
    if (!/^https?:\/\//i.test(source)) {
      const p = path.resolve(source);
      if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
      console.warn(`[transform] Sumber visual tidak ditemukan: ${source}`);
      return null;
    }
    const key = crypto.createHash("sha1").update(source).digest("hex").slice(0, 16);
    const out = path.join(VISUAL_CACHE_DIR, `${key}.mp4`);
    if (outputOk(out)) return out;
    let pending = inFlightDownloads.get(key);
    if (!pending) {
      pending = downloadVisual(source, out).finally(() => inFlightDownloads.delete(key));
      inFlightDownloads.set(key, pending);
    }
    return await pending;
  } catch (err) {
    console.warn(`[transform] Gagal menyiapkan sumber visual ${source}: ${errMsg(err).slice(0, 200)}`);
    return null;
  }
}

async function downloadVisual(url: string, out: string): Promise<string | null> {
  fs.mkdirSync(VISUAL_CACHE_DIR, { recursive: true });
  const tmpOut = `${out}.part`;
  try {
    if (/youtube\.com|youtu\.be|tiktok\.com|instagram\.com|facebook\.com|fb\.watch/i.test(url)) {
      // Platform video → yt-dlp (720p cukup untuk setengah layar).
      console.log(`[transform] Mengunduh visual loop via yt-dlp: ${url}`);
      const args = [
        "--no-playlist",
        "--merge-output-format", "mp4",
        "-f", "bestvideo[ext=mp4][height<=720]/best[ext=mp4][height<=720]/best[height<=720]/best",
        "--extractor-args", "youtube:player_client=web_safari,web_embedded,-tv_downgraded",
        "-o", tmpOut + ".%(ext)s",
      ];
      if (fs.existsSync("cookies.txt")) args.push("--cookies", "cookies.txt");
      args.push(url);
      await execFileAsync("yt-dlp", args, { timeout: 600000 });
      const produced = fs.readdirSync(VISUAL_CACHE_DIR).find((f) => f.startsWith(path.basename(tmpOut) + "."));
      if (!produced) return null;
      fs.renameSync(path.join(VISUAL_CACHE_DIR, produced), out);
    } else {
      console.log(`[transform] Mengunduh visual loop: ${url}`);
      const axios = (await import("axios")).default;
      const res = await axios.get(url, {
        responseType: "stream",
        timeout: 180000,
        maxContentLength: MAX_VISUAL_BYTES,
        maxBodyLength: MAX_VISUAL_BYTES,
      });
      await new Promise<void>((resolve, reject) => {
        const ws = fs.createWriteStream(tmpOut);
        res.data.pipe(ws);
        res.data.on("error", reject);
        ws.on("finish", () => resolve());
        ws.on("error", reject);
      });
      fs.renameSync(tmpOut, out);
    }
    return outputOk(out) ? out : null;
  } catch (err) {
    console.warn(`[transform] Gagal mengunduh visual loop: ${errMsg(err).slice(0, 200)}`);
    return null;
  } finally {
    try { if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut); } catch { /* ignore */ }
  }
}

interface VisualAttempt {
  label: string;
  /** Argumen input untuk visual (kosong = mode blur, tanpa input kedua). */
  inputArgs: string[];
  blur: boolean;
}

async function buildVisualAttempts(
  cfg: TransformConfig,
  width: number,
  visualH: number,
  duration: number,
  clipIndex: number
): Promise<VisualAttempt[]> {
  const attempts: VisualAttempt[] = [];
  const v = cfg.split.visual;
  const dur = (duration > 0 ? duration : 90) + 1;

  if (v.kind === "sources") {
    // Rotasi per klip; kalau satu sumber gagal, coba sumber berikutnya.
    for (let k = 0; k < v.sources.length; k++) {
      const src = v.sources[(clipIndex + k) % v.sources.length];
      const file = await resolveVisualFile(src);
      if (file) {
        attempts.push({ label: `loop ${path.basename(file)}`, inputArgs: ["-stream_loop", "-1", "-i", file], blur: false });
        break;
      }
    }
  } else if (v.kind === "blur") {
    attempts.push({ label: "blur", inputArgs: [], blur: true });
  }

  const accent = transformColorToRgb(cfg.accentColor) || "FFC107";
  const c1 = dimRgb(accent, 0.5);
  const c2 = dimRgb(accent, 0.22);
  attempts.push({
    label: "gradient",
    inputArgs: [
      "-f", "lavfi",
      "-i", `gradients=size=${width}x${visualH}:rate=30:duration=${dur}:speed=0.03:nb_colors=3:c0=0x0B0B1A:c1=0x${c1}:c2=0x${c2}`,
    ],
    blur: false,
  });
  attempts.push({
    label: "warna polos",
    inputArgs: ["-f", "lavfi", "-i", `color=c=0x${dimRgb(accent, 0.15)}:size=${width}x${visualH}:rate=30:duration=${dur}`],
    blur: false,
  });
  return attempts;
}

export async function applySplitScreen(
  inputPath: string,
  outputPath: string,
  clipIndex: number,
  config?: TransformConfig
): Promise<TransformStepResult> {
  const cfg = config || getTransformConfig();
  const skip = (reason: string): TransformStepResult => ({ applied: false, outputPath: inputPath, reason });
  if (!cfg.splitActive) return skip("split-screen tidak aktif");
  if (!fs.existsSync(inputPath)) return skip("input tidak ditemukan");

  try {
    fs.mkdirSync(TMP_DIR, { recursive: true });
    const info = await probeMedia(inputPath);
    const W = even(info.width);
    const { clipH, visualH, clipTop, seamY } = getSplitGeometry(info.height, cfg);
    const total = clipH + visualH;
    const attempts = await buildVisualAttempts(cfg, W, visualH, info.duration, clipIndex);
    const accent = transformColorToFfmpeg(cfg.accentColor, "FFC107");
    const d = Math.round(cfg.split.divider * (W / 1080));

    const clipChain =
      `scale=${W}:${clipH}:force_original_aspect_ratio=increase,` +
      `crop=${W}:${clipH}:0:(ih-${clipH})*${cfg.split.focusY},setsar=1,fps=30`;
    const visChain =
      `scale=${W}:${visualH}:force_original_aspect_ratio=increase,crop=${W}:${visualH},setsar=1,fps=30`;
    const tail =
      (d > 0 ? `,drawbox=x=0:y=${Math.round(seamY - d / 2)}:w=iw:h=${d}:color=${accent}:t=fill` : "") +
      `,format=yuv420p`;

    let lastError = "";
    for (const attempt of attempts) {
      let graph: string;
      if (attempt.blur) {
        const stack = clipTop ? "[clip][vis]" : "[vis][clip]";
        graph =
          `[0:v]split=2[a][b];[a]${clipChain}[clip];` +
          `[b]scale=${W}:${visualH}:force_original_aspect_ratio=increase,crop=${W}:${visualH},` +
          `boxblur=28:4,eq=brightness=-0.18:saturation=1.2,setsar=1,fps=30[vis];` +
          `${stack}vstack=inputs=2:shortest=1${tail}[v]`;
      } else {
        const stack = clipTop ? "[clip][vis]" : "[vis][clip]";
        graph =
          `[0:v]${clipChain}[clip];[1:v]${visChain}[vis];` +
          `${stack}vstack=inputs=2:shortest=1${tail}[v]`;
      }

      const args = ["-y", "-i", inputPath, ...attempt.inputArgs, "-filter_complex", graph, "-map", "[v]", "-map", "0:a?"];
      if (info.duration > 0) args.push("-t", info.duration.toFixed(2));
      args.push(...ENCODE_ARGS, "-c:a", "copy", outputPath);

      try {
        console.log(`[transform] Split-screen ${W}x${total} (${Math.round(cfg.split.ratio * 100)}% klip ${cfg.split.clipPosition}, visual: ${attempt.label})`);
        await runFfmpeg(args);
        if (outputOk(outputPath)) {
          return { applied: true, outputPath, parts: [`split-screen:${attempt.label}`] };
        }
        lastError = "output kosong";
      } catch (err) {
        lastError = errMsg(err);
        console.warn(`[transform] ⚠️ Split-screen gagal (visual ${attempt.label}): ${lastError.slice(0, 300)}`);
        try { fs.unlinkSync(outputPath); } catch { /* ignore */ }
      }
    }
    console.error("[transform] ❌ Split-screen gagal, klip dipakai tanpa split:", lastError.slice(0, 300));
    return skip(`FFmpeg gagal: ${lastError.slice(0, 120)}`);
  } catch (err) {
    return skip(`error: ${errMsg(err).slice(0, 120)}`);
  }
}

// =====================================================================
// 2) FRAME / LABEL + KARTU KOMENTAR
// =====================================================================
interface FontAttempt {
  label: string;
  option: string;
}

function buildFontAttempts(cfg: TransformConfig): FontAttempt[] {
  const attempts: FontAttempt[] = [];
  if (cfg.fontFile && fs.existsSync(cfg.fontFile)) {
    attempts.push({ label: `file ${cfg.fontFile}`, option: `fontfile='${escFilterValue(cfg.fontFile)}'` });
  } else {
    const pattern = cfg.font.includes(":") ? cfg.font : `${cfg.font}:bold`;
    attempts.push({ label: cfg.font, option: `font='${escFilterValue(pattern)}'` });
  }
  attempts.push({ label: "DejaVu Sans", option: `font='DejaVu Sans\\:bold'` });
  const dejavu = DEJAVU_BOLD_CANDIDATES.find((p) => fs.existsSync(p));
  if (dejavu) attempts.push({ label: `file ${dejavu}`, option: `fontfile='${escFilterValue(dejavu)}'` });
  return attempts;
}

/** Warna teks yang kontras di atas warna latar (hitam / putih). */
function contrastText(bgRgb: string | null): string {
  const n = parseInt(bgRgb || "FFC107", 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? "0x111111" : "0xFFFFFF";
}

interface OverlayPlan {
  filters: string[];
  parts: string[];
}

function buildOverlayFilters(
  cfg: TransformConfig,
  info: MediaInfo,
  commentary: string | undefined,
  fontOption: string,
  textFiles: string[],
  runId: string
): OverlayPlan {
  const { width: w, height: h } = info;
  const scale = w / 1080;
  const filters: string[] = [];
  const parts: string[] = [];
  let fileCounter = 0;

  const accentRgb = transformColorToRgb(cfg.accentColor);
  const accent = transformColorToFfmpeg(cfg.accentColor, "FFC107");
  const textColor = transformColorToFfmpeg(cfg.textColor, "FFFFFF");
  const cardColor = transformColorToFfmpeg(cfg.cardBg, "000000", cfg.cardOpacity);
  const geo = getSplitGeometry(h, cfg);

  const drawText = (
    text: string,
    x: string | number,
    y: string | number,
    size: number,
    color: string,
    extra = ""
  ) => {
    const file = path.join(TMP_DIR, `transform_${runId}_${fileCounter++}.txt`);
    fs.writeFileSync(file, text, "utf8");
    textFiles.push(file);
    filters.push(
      `drawtext=textfile='${escFilterValue(file)}':expansion=none:${fontOption}` +
        `:fontsize=${size}:fontcolor=${color}:x=${x}:y=${y}${extra}`
    );
  };

  // ── Frame: bingkai ──
  if (cfg.frameActive && cfg.frame.border > 0) {
    const b = Math.max(2, Math.round(cfg.frame.border * scale));
    filters.push(`drawbox=x=0:y=0:w=iw:h=ih:color=${accent}:t=${b}`);
    parts.push("bingkai");
  }

  // ── Frame: label ──
  const label = cfg.frameActive ? stripUnrenderable(getFrameLabel(cfg)) : "";
  if (label) {
    const fs_ = Math.max(18, Math.round(cfg.fontSize * 0.85 * scale));
    const pad = Math.round(fs_ * 0.4);
    const labelColor = contrastText(accentRgb);
    const useSeam = cfg.frame.position === "seam" && cfg.splitActive;
    const pos = cfg.frame.position === "seam" && !cfg.splitActive ? "top" : cfg.frame.position;
    const border = cfg.frameActive ? Math.round(cfg.frame.border * scale) : 0;

    if (cfg.frame.style === "bar") {
      const barH = Math.round(fs_ * 1.2) + 2 * pad;
      const barY = useSeam
        ? Math.round(geo.seamY - barH / 2)
        : pos === "bottom"
          ? Math.round(h * 0.86)
          : Math.round(h * 0.055);
      filters.push(`drawbox=x=0:y=${barY}:w=iw:h=${barH}:color=${accent}:t=fill`);
      drawText(label, "(w-text_w)/2", barY + pad, fs_, labelColor);
    } else {
      const y = useSeam
        ? `${geo.seamY}-text_h/2`
        : pos === "bottom"
          ? `${Math.round(h * 0.86)}`
          : `${Math.round(h * 0.06 + border)}`;
      drawText(label, "(w-text_w)/2", y, fs_, labelColor, `:box=1:boxcolor=${accent}:boxborderw=${pad}`);
    }
    parts.push(`label "${label}"`);
  }

  // ── Kartu komentar ──
  const text = commentary ? stripUnrenderable(commentary) : "";
  if (cfg.commentaryActive && text) {
    const fs_ = Math.max(18, Math.round(cfg.fontSize * scale));
    const headFs = Math.max(14, Math.round(fs_ * 0.62));
    const pitch = Math.round(fs_ * 1.32);
    const pad = Math.round(fs_ * 0.55);
    const stripe = Math.max(4, Math.round(fs_ * 0.18));
    const marginX = Math.round(w * 0.06);
    const cardW = w - 2 * marginX;
    const textX = marginX + stripe + pad;
    const charW = fs_ * 0.64; // perkiraan lebar rata-rata font bold
    const maxPerLine = Math.max(8, Math.floor((cardW - stripe - 2 * pad) / charW));

    let lines = wrapText(text, maxPerLine);
    if (lines.length > 4) {
      lines = lines.slice(0, 4);
      lines[3] = lines[3].replace(/[.,;:!?…\s]+$/, "") + "...";
    }
    const header = stripUnrenderable(getCommentaryHeader(cfg)).toUpperCase();
    const headH = header ? Math.round(headFs * 1.5) : 0;
    const cardH = pad + headH + lines.length * pitch + pad - Math.round((pitch - fs_ * 1.17) / 2);

    // Posisi vertikal.
    let y: number;
    const p = cfg.commentary.position;
    if (p === "top") y = Math.round(h * 0.17);
    else if (p === "middle") y = Math.round((h - cardH) / 2);
    else if (p === "lower") y = Math.round(h * 0.64);
    else y = cfg.splitActive ? Math.round(geo.seamY + h * 0.035) : Math.round(h * 0.64);
    y = Math.max(Math.round(h * 0.08), Math.min(y, Math.round(h * 0.84) - cardH));

    // Waktu tampil.
    let start = resolveCommentaryStart(cfg);
    let end = start + cfg.commentary.duration;
    if (info.duration > 0) {
      end = Math.min(end, info.duration - 0.3);
      if (end - start < 2 && info.duration > 4) start = Math.max(0.5, end - 2);
    }
    if (end - start >= 1.5) {
      const enable = `:enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'`;
      filters.push(`drawbox=x=${marginX}:y=${y}:w=${cardW}:h=${cardH}:color=${cardColor}:t=fill${enable}`);
      filters.push(`drawbox=x=${marginX}:y=${y}:w=${stripe}:h=${cardH}:color=${accent}:t=fill${enable}`);
      let ty = y + pad;
      if (header) {
        drawText(header, textX, ty, headFs, accent, enable);
        ty += headH;
      }
      lines.forEach((line, i) => drawText(line, textX, ty + i * pitch, fs_, textColor, enable));
      parts.push(`kartu komentar (${start.toFixed(1)}s-${end.toFixed(1)}s)`);
    }
  }

  return { filters, parts };
}

export async function applyTransformOverlays(
  inputPath: string,
  outputPath: string,
  commentary: string | undefined | null,
  config?: TransformConfig
): Promise<TransformStepResult> {
  const cfg = config || getTransformConfig();
  const skip = (reason: string): TransformStepResult => ({ applied: false, outputPath: inputPath, reason });
  if (!cfg.frameActive && !cfg.commentaryActive) return skip("frame/commentary tidak aktif");
  if (!fs.existsSync(inputPath)) return skip("input tidak ditemukan");

  const text = sanitizeHookText(typeof commentary === "string" ? commentary : "", cfg.commentary.maxChars);

  const info = await probeMedia(inputPath);
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const textFiles: string[] = [];
  let lastError = "";

  try {
    for (const attempt of buildFontAttempts(cfg)) {
      try {
        const plan = buildOverlayFilters(cfg, info, text || undefined, attempt.option, textFiles, runId);
        if (!plan.filters.length) return skip("tidak ada elemen untuk dirender (klip tanpa komentar & frame mati)");
        console.log(`[transform] Overlay (font ${attempt.label}): ${plan.parts.join(", ")}`);
        await runFfmpeg([
          "-y",
          "-i", inputPath,
          "-vf", plan.filters.join(","),
          ...ENCODE_ARGS,
          "-c:a", "copy",
          outputPath,
        ]);
        if (outputOk(outputPath)) return { applied: true, outputPath, parts: plan.parts };
        lastError = "output kosong";
      } catch (err) {
        lastError = errMsg(err);
        console.warn(`[transform] ⚠️ Overlay gagal dengan font "${attempt.label}": ${lastError.slice(0, 300)}`);
        try { fs.unlinkSync(outputPath); } catch { /* ignore */ }
      }
    }
    console.error("[transform] ❌ Overlay gagal, klip dipakai tanpa overlay:", lastError.slice(0, 300));
    return skip(`FFmpeg gagal: ${lastError.slice(0, 120)}`);
  } finally {
    for (const f of textFiles) {
      try { fs.unlinkSync(f); } catch { /* ignore */ }
    }
  }
}
