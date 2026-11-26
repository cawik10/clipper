/**
 * 🎞️ FORMAT TRANSFORMATIF — SPLIT-SCREEN / COMMENTARY / FRAME (FITUR BARU!)
 * =====================================================================
 * Klip yang HANYA dipotong dari video channel lain berisiko kena "reused
 * content" saat monetisasi. Fitur ini menambahkan lapisan transformatif
 * (nilai tambah orisinal) ke setiap klip. Ada 3 komponen, bisa dipakai
 * sendiri-sendiri atau digabung:
 *
 *   1. split-screen → klip di bagian atas, visual loop (gameplay / satisfying /
 *                     gradient animasi) di bagian bawah.
 *   2. commentary   → kartu konteks/komentar singkat buatan AI yang muncul di
 *                     tengah klip. AI menulisnya dalam prompt analisis yang
 *                     SAMA (tanpa panggilan AI tambahan), seperti Hook Overlay.
 *   3. frame        → bingkai + label judul "REAKSI" / "RANGKUMAN" / dll.
 *
 * Teks komentar juga (opsional) ditambahkan ke deskripsi video — teks orisinal
 * di deskripsi ikut memperkuat sinyal "bukan sekadar re-upload".
 *
 * Semua gagal-aman: kalau AI tidak memberi komentar / FFmpeg gagal / sumber
 * visual tidak bisa diunduh, klip tetap diproses normal — proses TIDAK PERNAH
 * gagal gara-gara fitur ini. Default MATI (TRANSFORM_ENABLED=false) sehingga
 * hasil klip yang sekarang tidak berubah sampai kamu menyalakannya.
 *
 * ⚠️ Catatan jujur: ini membantu, tapi bukan jaminan monetisasi. Keputusan
 * akhir ada di YouTube; pastikan tambahan kamu benar-benar bernilai (komentar
 * yang informatif, bukan sekadar mengulang isi klip).
 *
 * =====================================================================
 * CARA MENGATUR (Railway → Variables) — cukup ubah nilai lalu redeploy
 * =====================================================================
 * TRANSFORM_ENABLED=true        ← saklar utama (default: false)
 * TRANSFORM_MODE=split-screen,commentary,frame
 *                               ← pilih komponen, pisah koma
 *                                 (default: commentary,frame; "all" = semuanya)
 *
 * ── Split-screen ──
 * TRANSFORM_SPLIT_VISUAL=gradient
 *      gradient  → animasi gradient bawaan FFmpeg (tanpa file, selalu jalan) [default]
 *      blur      → salinan klip yang di-blur & di-zoom
 *      <URL/path>→ video loop milik kamu (mp4). Boleh banyak, pisah koma, dirotasi
 *                  per klip. URL langsung (.mp4) diunduh sekali lalu di-cache;
 *                  link YouTube diunduh via yt-dlp. Contoh:
 *                  https://cdn.contoh.com/minecraft-parkour.mp4
 * TRANSFORM_SPLIT_RATIO=0.55    ← porsi tinggi layar untuk klip (0.4 - 0.7)
 * TRANSFORM_SPLIT_CLIP_POSITION=top   ← top | bottom (posisi klip sumber)
 * TRANSFORM_SPLIT_FOCUS_Y=0.4   ← bagian vertikal klip yang dipertahankan saat
 *                                 di-crop (0 = atas, 0.5 = tengah, 1 = bawah)
 * TRANSFORM_SPLIT_DIVIDER=6     ← tebal garis pemisah px (0 = tanpa garis)
 *
 * ── Commentary (kartu komentar AI) ──
 * TRANSFORM_COMMENTARY_STYLE=context  ← context | reaction | summary | insight
 * TRANSFORM_COMMENTARY_MAX_CHARS=130  ← batas panjang teks (60 - 220)
 * TRANSFORM_COMMENTARY_POSITION=auto  ← auto | top | middle | lower
 * TRANSFORM_COMMENTARY_START=auto     ← detik mulai tampil (auto = setelah hook)
 * TRANSFORM_COMMENTARY_DURATION=5     ← lama tampil, detik (2 - 15)
 * TRANSFORM_COMMENTARY_HEADER=        ← judul kartu (kosong = ikut style)
 * TRANSFORM_COMMENTARY_PROMPT=        ← arahan tambahan untuk AI (opsional)
 * TRANSFORM_COMMENTARY_FALLBACK=true  ← true = pakai "alasan viral" AI kalau
 *                                       komentar kosong
 * TRANSFORM_DESCRIPTION=true          ← true = tambahkan komentar ke deskripsi
 *
 * ── Frame / label ──
 * TRANSFORM_FRAME_LABEL=auto    ← auto (ikut style) | reaksi | rangkuman |
 *                                 teks bebas, mis. "REACTION" / "BREAKING"
 * TRANSFORM_FRAME_STYLE=badge   ← badge | bar
 * TRANSFORM_FRAME_POSITION=top  ← top | bottom | seam (seam = di garis
 *                                 pemisah split-screen; tanpa split → top)
 * TRANSFORM_FRAME_BORDER=10     ← tebal bingkai px (0 = tanpa bingkai)
 *
 * ── Tampilan umum ──
 * TRANSFORM_ACCENT_COLOR=#FFC107   ← warna aksen (bingkai/label/garis)
 * TRANSFORM_TEXT_COLOR=white
 * TRANSFORM_CARD_BG=#000000        ← latar kartu komentar
 * TRANSFORM_CARD_OPACITY=0.8       ← 0 - 1
 * TRANSFORM_FONT_SIZE=40           ← ukuran font teks kartu (basis lebar 1080)
 * TRANSFORM_FONT=Montserrat        ← fallback otomatis ke DejaVu Sans
 * TRANSFORM_FONT_FILE=             ← path .ttf/.otf (menggantikan TRANSFORM_FONT)
 *
 * 👉 Mau mengubah teks/arahan AI, label, atau menambah style? Edit
 *    `COMMENTARY_STYLE_PRESETS` di bawah — dashboard, prompt AI, Telegram, dan
 *    renderer otomatis mengikuti. Renderer: src/lib/transform-format.ts
 */
import {
  hookColorToRgb,
  hookColorToHex,
  hookColorToFfmpeg,
  sanitizeHookText,
  getHookConfig,
} from "@/lib/hook-config";

// ─── Komponen / mode ──────────────────────────────────────────────────────
export const TRANSFORM_MODES = ["split-screen", "commentary", "frame"] as const;
export type TransformMode = (typeof TRANSFORM_MODES)[number];

export const TRANSFORM_MODE_INFO: Record<TransformMode, { label: string; description: string }> = {
  "split-screen": {
    label: "Split-Screen",
    description: "Klip di atas, visual loop (gameplay / satisfying / gradient) di bawah",
  },
  commentary: {
    label: "AI Commentary",
    description: "Kartu konteks / komentar singkat AI yang menambah nilai",
  },
  frame: {
    label: "Frame / Label",
    description: "Bingkai + judul \"Reaksi\" / \"Rangkuman\" di klip",
  },
};

// ─── Style komentar AI (✏️ edit di sini) ──────────────────────────────────
export const COMMENTARY_STYLES = ["context", "reaction", "summary", "insight"] as const;
export type CommentaryStyle = (typeof COMMENTARY_STYLES)[number];

export interface CommentaryStylePreset {
  label: string;
  description: string;
  /** Judul kecil di kartu komentar (bisa ditimpa TRANSFORM_COMMENTARY_HEADER). */
  header: string;
  /** Label bingkai saat TRANSFORM_FRAME_LABEL=auto. */
  frameLabel: string;
  /** Arahan untuk AI — apa yang harus ditulis. */
  prompt: string;
  /** Contoh (dipakai di dashboard & Telegram). */
  example: string;
}

export const COMMENTARY_STYLE_PRESETS: Record<CommentaryStyle, CommentaryStylePreset> = {
  context: {
    label: "Konteks",
    description: "Latar belakang yang membantu penonton memahami klip",
    header: "KONTEKS",
    frameLabel: "SOROTAN",
    prompt:
      "Tulis KONTEKS singkat: latar belakang, siapa/apa yang terlibat, atau kenapa momen ini penting — hal yang membantu penonton memahami klip tetapi tidak dijelaskan jelas di dalam klip.",
    example: "Ini terjadi sehari sebelum final, dan inilah alasan pernyataan ini bikin heboh.",
  },
  reaction: {
    label: "Reaksi",
    description: "Opini / reaksi singkat dari sudut pandang channel kita",
    header: "KOMENTAR KAMI",
    frameLabel: "REAKSI",
    prompt:
      "Tulis REAKSI/OPINI singkat orang pertama seolah channel kita sedang bereaksi terhadap klip — punya sudut pandang sendiri (setuju/ragu/kaget + alasannya), BUKAN sekadar mengulang isi klip.",
    example: "Jujur, poin terakhirnya yang paling bikin mikir — kebanyakan orang gak sadar ini.",
  },
  summary: {
    label: "Rangkuman",
    description: "Poin utama / takeaway dalam 1-2 kalimat",
    header: "POIN UTAMA",
    frameLabel: "RANGKUMAN",
    prompt:
      "Tulis RANGKUMAN 1-2 kalimat berisi poin utama atau takeaway yang bisa langsung dipakai penonton, dengan kata-kata sendiri (jangan menyalin kalimat di transkrip).",
    example: "Intinya: konsisten kecil tiap hari mengalahkan usaha besar sekali-sekali.",
  },
  insight: {
    label: "Wawasan",
    description: "Fakta / insight tambahan yang relevan",
    header: "TAHUKAH KAMU?",
    frameLabel: "WAWASAN",
    prompt:
      "Tulis WAWASAN tambahan: satu fakta, data, atau sudut pandang relevan yang memperkaya klip. HANYA tulis fakta yang kamu yakin benar; kalau ragu, ubah jadi pertanyaan atau opini ringan.",
    example: "Teknik ini sebenarnya dipakai sejak puluhan tahun lalu — bukan hal baru.",
  },
};

/** Preset label bingkai untuk nilai singkat di TRANSFORM_FRAME_LABEL (✏️ boleh ditambah). */
export const FRAME_LABEL_PRESETS: Record<string, string> = {
  reaksi: "REAKSI",
  reaction: "REAKSI",
  rangkuman: "RANGKUMAN",
  summary: "RANGKUMAN",
  konteks: "KONTEKS",
  sorotan: "SOROTAN",
  wawasan: "WAWASAN",
};

export const FRAME_STYLES = ["badge", "bar"] as const;
export type FrameStyle = (typeof FRAME_STYLES)[number];
export const FRAME_POSITIONS = ["top", "bottom", "seam"] as const;
export type FramePosition = (typeof FRAME_POSITIONS)[number];
export const COMMENTARY_POSITIONS = ["auto", "top", "middle", "lower"] as const;
export type CommentaryPosition = (typeof COMMENTARY_POSITIONS)[number];

/** Sumber visual bawah split-screen: bawaan atau daftar file/URL. */
export type SplitVisual =
  | { kind: "gradient" }
  | { kind: "blur" }
  | { kind: "sources"; sources: string[] };

export interface TransformConfig {
  enabled: boolean;
  modes: TransformMode[];
  /** Turunan dari `enabled` + `modes` — pakai ini di pipeline. */
  splitActive: boolean;
  commentaryActive: boolean;
  frameActive: boolean;

  split: {
    visual: SplitVisual;
    ratio: number;
    clipPosition: "top" | "bottom";
    focusY: number;
    divider: number;
  };

  commentary: {
    style: CommentaryStyle;
    maxChars: number;
    position: CommentaryPosition;
    /** null = otomatis (setelah hook selesai). */
    start: number | null;
    duration: number;
    header: string;
    extraPrompt: string;
    fallbackFromReason: boolean;
    appendToDescription: boolean;
  };

  frame: {
    label: string;
    style: FrameStyle;
    position: FramePosition;
    border: number;
  };

  accentColor: string;
  textColor: string;
  cardBg: string;
  cardOpacity: number;
  fontSize: number;
  font: string;
  fontFile: string;
}

// ─── Parser helper ────────────────────────────────────────────────────────
function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw.trim() === "") return fallback;
  return raw.toLowerCase().trim() === "true";
}

function parseNumber(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (!raw || raw.trim() === "") return fallback;
  const parsed = parseFloat(raw.trim().replace(",", "."));
  if (isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function parseEnum<T extends string>(
  name: string,
  raw: string | undefined,
  allowed: readonly T[],
  fallback: T,
  aliases: Record<string, T> = {}
): T {
  if (!raw || raw.trim() === "") return fallback;
  const v = raw.toLowerCase().trim().replace(/[_\s]/g, "-");
  if ((allowed as readonly string[]).includes(v)) return v as T;
  if (aliases[v]) return aliases[v];
  console.warn(`[transform-config] ${name}="${raw}" tidak valid (pilihan: ${allowed.join(", ")}). Menggunakan "${fallback}".`);
  return fallback;
}

function parseColorEnv(name: string, raw: string | undefined, fallback: string): string {
  if (!raw || raw.trim() === "") return fallback;
  if (hookColorToRgb(raw)) return raw.trim();
  console.warn(`[transform-config] ${name}="${raw}" bukan warna valid. Menggunakan "${fallback}".`);
  return fallback;
}

const MODE_ALIASES: Record<string, TransformMode> = {
  split: "split-screen",
  splitscreen: "split-screen",
  "split-layout": "split-screen",
  komentar: "commentary",
  comment: "commentary",
  caption: "commentary",
  card: "commentary",
  label: "frame",
  reaksi: "frame",
  reaction: "frame",
  rangkuman: "frame",
  bingkai: "frame",
};

function parseModes(raw: string | undefined): TransformMode[] {
  const fallback: TransformMode[] = ["commentary", "frame"];
  if (!raw || raw.trim() === "") return fallback;
  const out = new Set<TransformMode>();
  for (const part of raw.split(/[,\s|+]+/)) {
    const v = part.toLowerCase().trim().replace(/_/g, "-");
    if (!v) continue;
    if (v === "all" || v === "semua") {
      TRANSFORM_MODES.forEach((m) => out.add(m));
    } else if ((TRANSFORM_MODES as readonly string[]).includes(v)) {
      out.add(v as TransformMode);
    } else if (MODE_ALIASES[v]) {
      out.add(MODE_ALIASES[v]);
    } else if (v !== "none" && v !== "off") {
      console.warn(`[transform-config] TRANSFORM_MODE: "${part}" tidak dikenal (pilihan: ${TRANSFORM_MODES.join(", ")}, all). Diabaikan.`);
    }
  }
  return out.size ? TRANSFORM_MODES.filter((m) => out.has(m)) : fallback;
}

function parseSplitVisual(raw: string | undefined): SplitVisual {
  const v = (raw || "").trim();
  if (!v || /^(gradient|generated|auto|default)$/i.test(v)) return { kind: "gradient" };
  if (/^blur(red)?$/i.test(v)) return { kind: "blur" };
  const sources = v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return sources.length ? { kind: "sources", sources } : { kind: "gradient" };
}

// ─── Config utama ─────────────────────────────────────────────────────────
/** Satu-satunya tempat membaca env var TRANSFORM_* — mudah diganti/diaudit. */
export function getTransformConfig(): TransformConfig {
  const enabled = parseBool(process.env.TRANSFORM_ENABLED, false);
  const modes = parseModes(process.env.TRANSFORM_MODE);
  const style = parseEnum("TRANSFORM_COMMENTARY_STYLE", process.env.TRANSFORM_COMMENTARY_STYLE, COMMENTARY_STYLES, "context", {
    konteks: "context",
    reaksi: "reaction",
    rangkuman: "summary",
    wawasan: "insight",
    opinion: "reaction",
  });
  const startRaw = (process.env.TRANSFORM_COMMENTARY_START || "").trim().toLowerCase();

  return {
    enabled,
    modes,
    splitActive: enabled && modes.includes("split-screen"),
    commentaryActive: enabled && modes.includes("commentary"),
    frameActive: enabled && modes.includes("frame"),

    split: {
      visual: parseSplitVisual(process.env.TRANSFORM_SPLIT_VISUAL),
      ratio: Math.round(parseNumber(process.env.TRANSFORM_SPLIT_RATIO, 0.55, 0.4, 0.7) * 100) / 100,
      clipPosition: parseEnum("TRANSFORM_SPLIT_CLIP_POSITION", process.env.TRANSFORM_SPLIT_CLIP_POSITION, ["top", "bottom"] as const, "top", {
        atas: "top",
        bawah: "bottom",
      }),
      focusY: parseNumber(process.env.TRANSFORM_SPLIT_FOCUS_Y, 0.4, 0, 1),
      divider: Math.round(parseNumber(process.env.TRANSFORM_SPLIT_DIVIDER, 6, 0, 30)),
    },

    commentary: {
      style,
      maxChars: Math.round(parseNumber(process.env.TRANSFORM_COMMENTARY_MAX_CHARS, 130, 60, 220)),
      position: parseEnum("TRANSFORM_COMMENTARY_POSITION", process.env.TRANSFORM_COMMENTARY_POSITION, COMMENTARY_POSITIONS, "auto", {
        bottom: "lower",
        bawah: "lower",
        atas: "top",
        tengah: "middle",
        center: "middle",
      }),
      start: startRaw === "" || startRaw === "auto" ? null : parseNumber(startRaw, 2.5, 0, 30),
      duration: Math.round(parseNumber(process.env.TRANSFORM_COMMENTARY_DURATION, 5, 2, 15) * 10) / 10,
      header: (process.env.TRANSFORM_COMMENTARY_HEADER || "").trim().slice(0, 30),
      extraPrompt: (process.env.TRANSFORM_COMMENTARY_PROMPT || "").trim().slice(0, 400),
      fallbackFromReason: parseBool(process.env.TRANSFORM_COMMENTARY_FALLBACK, true),
      appendToDescription: parseBool(process.env.TRANSFORM_DESCRIPTION, true),
    },

    frame: {
      label: (process.env.TRANSFORM_FRAME_LABEL || "auto").trim().slice(0, 24) || "auto",
      style: parseEnum("TRANSFORM_FRAME_STYLE", process.env.TRANSFORM_FRAME_STYLE, FRAME_STYLES, "badge"),
      position: parseEnum("TRANSFORM_FRAME_POSITION", process.env.TRANSFORM_FRAME_POSITION, FRAME_POSITIONS, "top", {
        atas: "top",
        bawah: "bottom",
        garis: "seam",
        divider: "seam",
      }),
      border: Math.round(parseNumber(process.env.TRANSFORM_FRAME_BORDER, 10, 0, 40)),
    },

    accentColor: parseColorEnv("TRANSFORM_ACCENT_COLOR", process.env.TRANSFORM_ACCENT_COLOR, "#FFC107"),
    textColor: parseColorEnv("TRANSFORM_TEXT_COLOR", process.env.TRANSFORM_TEXT_COLOR, "white"),
    cardBg: parseColorEnv("TRANSFORM_CARD_BG", process.env.TRANSFORM_CARD_BG, "#000000"),
    cardOpacity: parseNumber(process.env.TRANSFORM_CARD_OPACITY, 0.8, 0, 1),
    fontSize: Math.round(parseNumber(process.env.TRANSFORM_FONT_SIZE, 40, 20, 90)),
    font: (process.env.TRANSFORM_FONT || process.env.HOOK_FONT || "Montserrat").trim(),
    fontFile: (process.env.TRANSFORM_FONT_FILE || process.env.HOOK_FONT_FILE || "").trim(),
  };
}

// ─── Helper tampilan ──────────────────────────────────────────────────────
export function transformColorToHex(input: string, fallback = "#FFFFFF"): string {
  return hookColorToHex(input, fallback);
}

export function transformColorToFfmpeg(input: string, fallbackRgb: string, opacity?: number): string {
  return hookColorToFfmpeg(input, fallbackRgb, opacity);
}

export function transformColorToRgb(input: string): string | null {
  return hookColorToRgb(input);
}

/** Judul kartu komentar (env menimpa preset). */
export function getCommentaryHeader(cfg: TransformConfig = getTransformConfig()): string {
  return cfg.commentary.header || COMMENTARY_STYLE_PRESETS[cfg.commentary.style].header;
}

/** Label bingkai: auto → ikut style; preset singkat → teks preset; selain itu teks bebas. */
export function getFrameLabel(cfg: TransformConfig = getTransformConfig()): string {
  const raw = cfg.frame.label.trim();
  if (!raw || raw.toLowerCase() === "auto") return COMMENTARY_STYLE_PRESETS[cfg.commentary.style].frameLabel;
  return FRAME_LABEL_PRESETS[raw.toLowerCase()] || raw.toUpperCase();
}

/** Ringkasan sumber visual untuk dashboard/Telegram. */
export function describeSplitVisual(v: SplitVisual): string {
  if (v.kind === "gradient") return "Gradient animasi bawaan";
  if (v.kind === "blur") return "Salinan klip di-blur";
  return `${v.sources.length} sumber loop (file/URL)`;
}

/** Geometri split-screen (dipakai renderer split & overlay agar posisinya konsisten). */
export function getSplitGeometry(height: number, cfg: TransformConfig = getTransformConfig()) {
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  const clipH = even(height * cfg.split.ratio);
  const visualH = even(height - clipH);
  const clipTop = cfg.split.clipPosition === "top";
  /** y garis pemisah (batas antara dua area). */
  const seamY = clipTop ? clipH : visualH;
  return { clipH, visualH, clipTop, seamY };
}

/** Detik mulai kartu komentar: manual, atau otomatis setelah hook selesai. */
export function resolveCommentaryStart(cfg: TransformConfig = getTransformConfig()): number {
  if (cfg.commentary.start !== null) return cfg.commentary.start;
  const hook = getHookConfig();
  return hook.enabled ? Math.round((hook.duration + 0.5) * 10) / 10 : 1;
}

// ─── Prompt AI & pembersihan komentar ─────────────────────────────────────
/** Instruksi tambahan untuk prompt analisis (kosong kalau commentary tidak aktif). */
export function buildCommentaryPromptInstruction(cfg: TransformConfig = getTransformConfig()): string {
  if (!cfg.commentaryActive) return "";
  const preset = COMMENTARY_STYLE_PRESETS[cfg.commentary.style];
  return `
KOMENTAR AI (kartu teks orisinal yang ditampilkan di tengah klip sebagai nilai tambah):
- Untuk SETIAP klip, buat satu teks "commentary" maksimal ${cfg.commentary.maxChars} karakter (1-2 kalimat)
- ${preset.prompt}
- Tulis dengan kata-kata SENDIRI, jangan menyalin kalimat dari transkrip, harus menambah nilai (bukan mengulang isi klip)
- JANGAN mengarang fakta, angka, atau nama; kalau tidak yakin, tulis sebagai opini atau pertanyaan
- Bahasa sama dengan bahasa video, gaya santai (Indonesia: pakai "kamu/gak", bukan bahasa baku)
- Tanpa emoji, tanpa hashtag, tanpa tanda kutip
- Contoh gaya: "${preset.example}"${cfg.commentary.extraPrompt ? `\n- Arahan tambahan: ${cfg.commentary.extraPrompt}` : ""}
`;
}

/** Potongan field JSON untuk contoh output di prompt (kosong kalau tidak aktif). */
export function buildCommentaryJsonField(cfg: TransformConfig = getTransformConfig()): string {
  return cfg.commentaryActive
    ? `,\n    "commentary": "<komentar AI orisinal, max ${cfg.commentary.maxChars} karakter>"`
    : "";
}

/**
 * Komentar dari AI (dibersihkan). Kosong & TRANSFORM_COMMENTARY_FALLBACK=true →
 * pakai "alasan viral" dari AI (bila ada). Return undefined kalau fitur mati.
 */
export function resolveCommentary(raw: unknown, reason?: unknown, cfg: TransformConfig = getTransformConfig()): string | undefined {
  if (!cfg.commentaryActive) return undefined;
  const cleaned = sanitizeHookText(raw, cfg.commentary.maxChars);
  if (cleaned) return cleaned;
  if (cfg.commentary.fallbackFromReason && typeof reason === "string") {
    const r = sanitizeHookText(reason, cfg.commentary.maxChars);
    // Alasan bawaan sistem (bukan buatan AI) tidak layak ditampilkan ke penonton.
    if (r && !/^(AI-selected moment|Dipilih berdasarkan)/i.test(r)) return r;
  }
  return undefined;
}

/** Tambahkan komentar ke deskripsi klip (idempoten). Dipanggil sebelum upload. */
export function appendCommentaryToDescription(
  clips: Array<{ description: string; commentary?: string }>,
  cfg: TransformConfig = getTransformConfig()
): number {
  if (!cfg.commentaryActive || !cfg.commentary.appendToDescription) return 0;
  const header = getCommentaryHeader(cfg);
  const title = header.charAt(0) + header.slice(1).toLowerCase();
  let n = 0;
  for (const clip of clips) {
    const text = clip.commentary?.trim();
    if (!text || (clip.description || "").includes(text)) continue;
    clip.description = `${(clip.description || "").trim()}\n\n💬 ${title}: ${text}`.trim();
    n++;
  }
  return n;
}

export function isValidCommentaryStyle(value: string): value is CommentaryStyle {
  return (COMMENTARY_STYLES as readonly string[]).includes(value);
}
