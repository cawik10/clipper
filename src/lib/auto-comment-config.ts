/**
 * 💬 AUTO-FIRST COMMENT (Pancingan Algoritma YouTube) — KONFIGURASI (FITUR BARU!)
 * =====================================================================
 * Algoritma YouTube Shorts menyukai kolom komentar yang ramai. Fitur ini:
 *
 *  1. Saat AI menganalisis klip (src/lib/ai-analyzer.ts), AI diminta membuat
 *     1 kalimat komentar pancingan/kontroversial yang relevan dengan isi klip.
 *     (Ditambahkan ke prompt yang sama — TANPA panggilan AI tambahan.)
 *  2. Setelah klip terupload lewat YouTube Data API, bot otomatis memposting
 *     komentar itu ke video tersebut memakai `commentThreads.insert`
 *     (lihat src/lib/auto-comment.ts).
 *
 * Kalau AI tidak memberi komentar / posting gagal, upload TIDAK PERNAH ikut
 * gagal — klip tetap sukses terupload, bot hanya memberi tahu di Telegram.
 *
 * ⚠️ CATATAN PIN: YouTube Data API v3 TIDAK menyediakan endpoint untuk
 *    mem-pin (menyematkan) komentar. Bot memposting komentar sebagai
 *    pemilik channel, lalu mengirim link langsung ke komentar tersebut di
 *    Telegram — tinggal tap → ⋮ → "Pin" (1 detik). Matikan link ini dengan
 *    YOUTUBE_AUTO_COMMENT_PIN_LINK=false.
 *
 * =====================================================================
 * CARA MENGATUR (Railway → Variables, tanpa menyentuh kode)
 * =====================================================================
 * YOUTUBE_AUTO_COMMENT_ENABLED=true       ← SAKLAR UTAMA (default: false / mati)
 * YOUTUBE_AUTO_COMMENT_STYLE=mixed        ← question | controversial | cta | mixed
 * YOUTUBE_AUTO_COMMENT_SUFFIX="Full video ada di channel @namakamu"
 *                                         ← opsional: kalimat tambahan di akhir komentar
 * YOUTUBE_AUTO_COMMENT_PROMPT="..."       ← opsional: arahan tambahan untuk AI
 * YOUTUBE_AUTO_COMMENT_MAX_CHARS=150      ← batas panjang kalimat dari AI (30-500)
 * YOUTUBE_AUTO_COMMENT_FALLBACK=true      ← true = pakai komentar cadangan (FALLBACK_COMMENTS)
 *                                           kalau AI tidak memberi komentar
 * YOUTUBE_AUTO_COMMENT_PRIVACY=public,unlisted,private
 *                                         ← komentar hanya diposting ke video berstatus ini
 * YOUTUBE_AUTO_COMMENT_DELAY_SECONDS=5    ← jeda setelah upload sebelum komentar (0-120)
 * YOUTUBE_AUTO_COMMENT_RETRIES=3          ← maks percobaan per klip (1-8)
 * YOUTUBE_AUTO_COMMENT_RETRY_DELAY_SECONDS=15 ← jeda antar percobaan (1-300, makin lama tiap ulang)
 * YOUTUBE_AUTO_COMMENT_PIN_LINK=true      ← kirim link komentar untuk di-pin manual
 * YOUTUBE_AUTO_COMMENT_REQUEST_SCOPE=true ← minta izin komentar (youtube.force-ssl) saat /connect
 *
 * 🔑 PENTING: `commentThreads.insert` butuh izin `youtube.force-ssl`, sedangkan
 *    izin lama hanya `youtube.upload`. Setelah fitur dinyalakan, kirim
 *    /connect SEKALI LAGI di Telegram untuk memberi izin baru.
 *
 * Gaya (STYLE), prompt AI, dan komentar cadangan bisa diubah di konstanta
 * paling bawah file ini.
 */

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return !/^(false|0|off|no|nonaktif)$/i.test(raw.trim());
}

function envInt(name: string, fallback: number, min: number, max: number): number {
  const n = parseInt(process.env[name] || "", 10);
  if (!isNaN(n) && n >= min && n <= max) return n;
  return fallback;
}

// ─── FLAG ────────────────────────────────────────────────────────────────

/** Saklar utama. Default MATI (opt-in) karena memposting komentar publik di channel user. */
export function isAutoCommentEnabled(): boolean {
  const raw = process.env.YOUTUBE_AUTO_COMMENT_ENABLED;
  if (raw === undefined || raw === "") return false;
  return /^(true|1|on|yes|ya|aktif)$/i.test(raw.trim());
}

/** Minta scope `youtube.force-ssl` saat /connect (hanya kalau fitur menyala). */
export function shouldRequestCommentScope(): boolean {
  return isAutoCommentEnabled() && envBool("YOUTUBE_AUTO_COMMENT_REQUEST_SCOPE", true);
}

export function isCommentPinLinkEnabled(): boolean {
  return envBool("YOUTUBE_AUTO_COMMENT_PIN_LINK", true);
}

export function isCommentFallbackEnabled(): boolean {
  return envBool("YOUTUBE_AUTO_COMMENT_FALLBACK", true);
}

// ─── STYLE ───────────────────────────────────────────────────────────────

export const AUTO_COMMENT_STYLES = ["question", "controversial", "cta", "mixed"] as const;
export type AutoCommentStyle = (typeof AUTO_COMMENT_STYLES)[number];

export function getAutoCommentStyle(): AutoCommentStyle {
  const raw = (process.env.YOUTUBE_AUTO_COMMENT_STYLE || "mixed").trim().toLowerCase();
  return (AUTO_COMMENT_STYLES as readonly string[]).includes(raw) ? (raw as AutoCommentStyle) : "mixed";
}

/** ✏️ Edit di sini untuk menyetel arahan tiap gaya komentar ke AI. */
export const AUTO_COMMENT_STYLE_PRESETS: Record<AutoCommentStyle, { label: string; description: string; guide: string }> = {
  question: {
    label: "Pertanyaan",
    description: "Pertanyaan terbuka yang mengajak penonton menjawab",
    guide: 'pertanyaan terbuka yang gampang dijawab satu kata/kalimat. Contoh: "Menurut kamu, siapa yang salah di sini? Komen ya!"',
  },
  controversial: {
    label: "Kontroversial",
    description: "Pernyataan/pertanyaan yang memancing pro-kontra (tetap sopan)",
    guide:
      'pertanyaan/pernyataan yang memancing pro-kontra supaya orang ingin berdebat di kolom komentar (tetap sopan, tanpa SARA/hinaan). Contoh: "Setuju gak sama pendapat dia di detik terakhir? Coba komen!"',
  },
  cta: {
    label: "Ajakan (CTA)",
    description: "Ajakan komen + arahkan ke video penuh/channel",
    guide:
      'ajakan berkomentar yang singkat, boleh mengajak menonton video penuh. Contoh: "Kamu tim mana? Tulis di komentar, full videonya ada di channel kami!"',
  },
  mixed: {
    label: "Campuran",
    description: "AI memilih gaya terbaik per klip (pertanyaan / kontroversial / ajakan)",
    guide:
      "pilih gaya paling cocok untuk klip itu: pertanyaan terbuka, pernyataan kontroversial yang memancing pro-kontra, atau ajakan berkomentar. Variasikan antar klip",
  },
};

export function getAutoCommentStyleLabel(style: AutoCommentStyle = getAutoCommentStyle()): string {
  return AUTO_COMMENT_STYLE_PRESETS[style].label;
}

// ─── TEKS ────────────────────────────────────────────────────────────────

export function getAutoCommentMaxChars(): number {
  return envInt("YOUTUBE_AUTO_COMMENT_MAX_CHARS", 150, 30, 500);
}

/** Kalimat tambahan di akhir komentar (mis. "Full video ada di channel @nama"). */
export function getAutoCommentSuffix(): string {
  return (process.env.YOUTUBE_AUTO_COMMENT_SUFFIX || "").replace(/\s+/g, " ").trim().slice(0, 300);
}

export function getAutoCommentExtraPrompt(): string {
  return (process.env.YOUTUBE_AUTO_COMMENT_PROMPT || "").replace(/\s+/g, " ").trim().slice(0, 300);
}

// ─── POSTING ─────────────────────────────────────────────────────────────

export function getAutoCommentDelaySeconds(): number {
  return envInt("YOUTUBE_AUTO_COMMENT_DELAY_SECONDS", 5, 0, 120);
}

export function getAutoCommentRetries(): number {
  return envInt("YOUTUBE_AUTO_COMMENT_RETRIES", 3, 1, 8);
}

export function getAutoCommentRetryDelaySeconds(): number {
  return envInt("YOUTUBE_AUTO_COMMENT_RETRY_DELAY_SECONDS", 15, 1, 300);
}

/** Status privasi video yang boleh diberi komentar otomatis. */
export function getAutoCommentAllowedPrivacy(): string[] {
  const list = (process.env.YOUTUBE_AUTO_COMMENT_PRIVACY || "public,unlisted,private")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s === "public" || s === "unlisted" || s === "private");
  return list.length ? list : ["public", "unlisted", "private"];
}

// ─── KONSTANTA (ubah di sini kalau perlu) ────────────────────────────────

/** Batas komentar YouTube yang dipakai bot (karakter; batas resmi lebih besar). */
export const AUTO_COMMENT_HARD_LIMIT = 500;

/** Scope Google untuk `commentThreads.insert`. */
export const AUTO_COMMENT_SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl";
/** Scope yang dianggap cukup untuk memposting komentar. */
export const AUTO_COMMENT_REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/youtube.force-ssl",
  "https://www.googleapis.com/auth/youtube",
];

/** Komentar cadangan kalau AI tidak memberi komentar (dipilih bergantian per klip). */
export const FALLBACK_COMMENTS = [
  "Setuju gak sama bagian ini? Coba tulis pendapatmu di komentar!",
  "Menurut kamu gimana? Komen di bawah ya!",
  "Kamu tim setuju atau tim enggak? Ayo komen!",
  "Ada yang pernah ngalamin hal kayak gini? Cerita di komentar!",
];

/** Contoh komentar (dipakai dashboard & perintah /autocomment). */
export const AUTO_COMMENT_EXAMPLES = [
  "Setuju gak sama pendapat dia di detik terakhir? Coba komen!",
  "Menurut kamu siapa yang salah di sini? Tulis di komentar!",
  "Full videonya ada di channel @namakamu — kamu tim mana?",
];

/** Instruksi yang ditambahkan ke prompt analisis AI (ai-analyzer.ts). Ubah gaya/aturan di sini. */
export function buildAutoCommentPromptInstruction(style: AutoCommentStyle, maxChars: number, extra: string): string {
  return `
KOMENTAR PERTAMA (akan diposting otomatis sebagai komentar pertama di video untuk memancing algoritma):
- Untuk SETIAP klip, buat satu kalimat "firstComment" berupa ${AUTO_COMMENT_STYLE_PRESETS[style].guide}
- Maksimal ${maxChars} karakter, 1 kalimat, bahasa santai sesuai bahasa video (Indonesia: pakai "kamu/gak", bukan bahasa baku)
- Harus relevan dengan isi klip tersebut (mis. merujuk pendapat/momen di klip) — jangan mengarang fakta yang tidak ada di klip
- Tanpa hashtag, tanpa tanda kutip, maksimal 1 emoji; harus diakhiri ajakan untuk berkomentar${extra ? `\n- Arahan tambahan: ${extra}` : ""}
`;
}

// ─── SANITASI ────────────────────────────────────────────────────────────

/** Bersihkan komentar dari AI: buang kutip/hashtag/baris baru, potong rapi di batas kata. */
export function sanitizeCommentText(raw: unknown, maxChars: number = getAutoCommentMaxChars()): string {
  if (typeof raw !== "string") return "";
  let text = raw
    .replace(/[\r\n]+/g, " ")
    .replace(/#[\p{L}\p{N}_]+/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, "")
    .trim();
  if (text.length > maxChars) {
    const cut = text.slice(0, maxChars);
    const lastSpace = cut.lastIndexOf(" ");
    text = (lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trim().replace(/[,;:\-–—]+$/, "");
  }
  return text;
}

/** Komentar cadangan (kalau FALLBACK aktif). */
export function buildFallbackComment(index: number): string {
  return FALLBACK_COMMENTS[Math.abs(index) % FALLBACK_COMMENTS.length];
}

/** Gabungkan komentar + suffix, dijaga di bawah batas komentar. */
export function composeFinalComment(comment: string): string {
  const suffix = getAutoCommentSuffix();
  const full = suffix ? `${comment} ${suffix}`.trim() : comment;
  return full.length > AUTO_COMMENT_HARD_LIMIT ? full.slice(0, AUTO_COMMENT_HARD_LIMIT).trim() : full;
}
