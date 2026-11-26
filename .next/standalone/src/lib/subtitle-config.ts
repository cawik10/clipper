/**
 * 💬 SUBTITLE / CAPTION BURN-IN (FITUR BARU!)
 * =====================================================================
 * Semua konfigurasi dikontrol via environment variables (Railway →
 * Variables), sama seperti fitur lain (watermark, zoom, auto-reframe).
 * File ini murni tambahan — tidak mengubah konfigurasi fitur yang ada.
 *
 * Apa fiturnya?
 * -------------
 * Setelah klip dipotong, kata-kata hasil transkripsi Whisper (dengan
 * timestamp PER KATA) di-"burn" langsung ke video lewat FFmpeg `ass`
 * filter (libass), sehingga klip punya caption ala Shorts/Reels viral.
 * Kalau transkripsi tidak tersedia / FFmpeg gagal, klip tetap diproses
 * normal tanpa subtitle — proses TIDAK PERNAH gagal gara-gara fitur ini.
 *
 * =====================================================================
 * CARA MENGATUR (Railway Variables)
 * =====================================================================
 * SUBTITLE_ENABLED=true                 ← nyalakan/matikan (default: true)
 * SUBTITLE_STYLE=karaoke                ← karaoke | word-highlight | simple | alex-hormozi
 * SUBTITLE_FONT_SIZE=48                 ← ukuran dasar (px, basis lebar 1080). Tiap style
 *                                          punya pengali sendiri (lihat STYLE_PRESETS)
 * SUBTITLE_COLOR=white                  ← warna teks (nama warna / #RRGGBB)
 * SUBTITLE_HIGHLIGHT_COLOR=yellow       ← warna kata aktif (nama warna / #RRGGBB)
 * SUBTITLE_POSITION=bottom-center       ← bottom-center | center | top-center
 * SUBTITLE_MAX_WORDS_PER_LINE=4         ← 1-8 kata per baris caption
 * SUBTITLE_ANIMATION=pop                ← pop | fade | none
 *
 * Opsional (punya default aman):
 * SUBTITLE_FONT=Montserrat              ← nama font (harus terinstall di server / SUBTITLE_FONTS_DIR)
 * SUBTITLE_FONTS_DIR=                   ← folder font custom (.ttf/.otf), opsional
 * SUBTITLE_OUTLINE_COLOR=black          ← warna outline teks
 * SUBTITLE_MARGIN_V=                    ← jarak dari tepi atas/bawah (px, basis tinggi 1920).
 *                                          Kosong = otomatis (aman dari UI Shorts)
 *
 * =====================================================================
 * MODE STYLE
 * =====================================================================
 * karaoke        → highlight "menyapu" (sweep) mengikuti kata yang diucapkan
 * word-highlight → hanya kata yang sedang diucapkan berubah warna
 * simple         → teks putih biasa di bawah, tanpa highlight (konten serius)
 * alex-hormozi   → HURUF BESAR, tebal, 1-3 kata, kata aktif berwarna + pop
 *
 * 👉 Mau menambah/mengubah style? Cukup edit objek STYLE_PRESETS di bawah
 *    (dan tambah nama style ke SUBTITLE_STYLES). Bot Telegram (/subtitle),
 *    dashboard, dan renderer otomatis mengikuti.
 */

export const SUBTITLE_STYLES = ["karaoke", "word-highlight", "simple", "alex-hormozi"] as const;
export type SubtitleStyle = (typeof SUBTITLE_STYLES)[number];

export const SUBTITLE_POSITIONS = ["bottom-center", "center", "top-center"] as const;
export type SubtitlePosition = (typeof SUBTITLE_POSITIONS)[number];

export const SUBTITLE_ANIMATIONS = ["pop", "fade", "none"] as const;
export type SubtitleAnimation = (typeof SUBTITLE_ANIMATIONS)[number];

/** Cara highlight dirender: plain = tanpa highlight, sweep = \kf karaoke, word = kata aktif saja. */
export type SubtitleHighlightMode = "plain" | "sweep" | "word";

export interface SubtitleStylePreset {
  label: string;
  description: string;
  highlightMode: SubtitleHighlightMode;
  /** Pengali terhadap SUBTITLE_FONT_SIZE. */
  fontScale: number;
  bold: boolean;
  uppercase: boolean;
  stripPunctuation: boolean;
  /** Tebal outline (px, basis lebar 1080). */
  outline: number;
  shadow: number;
  /** Batas atas kata per baris untuk style ini (dibatasi lagi oleh SUBTITLE_MAX_WORDS_PER_LINE). */
  maxWordsCap: number;
}

/** ✏️ Edit di sini untuk menyetel tampilan tiap style. */
export const STYLE_PRESETS: Record<SubtitleStyle, SubtitleStylePreset> = {
  karaoke: {
    label: "Karaoke",
    description: "Highlight menyapu mengikuti kata yang diucapkan",
    highlightMode: "sweep",
    fontScale: 1.2,
    bold: true,
    uppercase: false,
    stripPunctuation: false,
    outline: 4,
    shadow: 1,
    maxWordsCap: 8,
  },
  "word-highlight": {
    label: "Word Highlight",
    description: "Hanya kata yang sedang diucapkan berubah warna",
    highlightMode: "word",
    fontScale: 1.2,
    bold: true,
    uppercase: false,
    stripPunctuation: false,
    outline: 4,
    shadow: 1,
    maxWordsCap: 8,
  },
  simple: {
    label: "Simple",
    description: "Teks putih biasa di bawah — cocok untuk konten serius",
    highlightMode: "plain",
    fontScale: 1.0,
    bold: false,
    uppercase: false,
    stripPunctuation: false,
    outline: 3,
    shadow: 0,
    maxWordsCap: 8,
  },
  "alex-hormozi": {
    label: "Alex Hormozi",
    description: "HURUF BESAR tebal, 1-3 kata, kata aktif berwarna + pop",
    highlightMode: "word",
    fontScale: 1.5,
    bold: true,
    uppercase: true,
    stripPunctuation: true,
    outline: 7,
    shadow: 2,
    maxWordsCap: 3,
  },
};

export interface SubtitleConfig {
  enabled: boolean;
  style: SubtitleStyle;
  fontSize: number;
  font: string;
  fontsDir: string;
  color: string;
  highlightColor: string;
  outlineColor: string;
  position: SubtitlePosition;
  maxWordsPerLine: number;
  animation: SubtitleAnimation;
  /** null = otomatis berdasarkan posisi. */
  marginV: number | null;
}

// ─── Transkrip dengan timestamp per kata ──────────────────────────────────
export interface TranscriptWord {
  start: number;
  end: number;
  text: string;
}

/** Segmen transkrip biasa + (opsional) kata-kata berikut timestamp-nya. */
export interface TranscriptSegmentWithWords {
  start: number;
  end: number;
  text: string;
  words?: TranscriptWord[];
}

// ─── Parser helper ────────────────────────────────────────────────────────
function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw.trim() === "") return fallback;
  return raw.toLowerCase().trim() === "true";
}

function parseNumber(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (!raw || raw.trim() === "") return fallback;
  const parsed = parseFloat(raw.trim());
  if (isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function parseEnum<T extends string>(
  name: string,
  raw: string | undefined,
  valid: readonly T[],
  fallback: T
): T {
  if (!raw || raw.trim() === "") return fallback;
  const v = raw.toLowerCase().trim().replace(/_/g, "-");
  if ((valid as readonly string[]).includes(v)) return v as T;
  // alias ramah: "hormozi", "highlight", "bottom", "middle", "top"
  if (name === "SUBTITLE_STYLE" && v === "hormozi") return "alex-hormozi" as T;
  if (name === "SUBTITLE_STYLE" && v === "highlight") return "word-highlight" as T;
  if (name === "SUBTITLE_POSITION") {
    if (v === "bottom") return "bottom-center" as T;
    if (v === "middle" || v === "center-center") return "center" as T;
    if (v === "top") return "top-center" as T;
  }
  console.warn(
    `[subtitle-config] ${name}="${raw}" tidak valid (pilihan: ${valid.join(", ")}). Menggunakan "${fallback}".`
  );
  return fallback;
}

// ─── Warna ────────────────────────────────────────────────────────────────
const NAMED_COLORS: Record<string, string> = {
  white: "FFFFFF",
  black: "000000",
  yellow: "FFE500",
  gold: "FFC107",
  orange: "FF8A00",
  red: "FF2D2D",
  pink: "FF4FA3",
  magenta: "FF00FF",
  purple: "A855F7",
  blue: "2D7BFF",
  cyan: "00E5FF",
  green: "00D26A",
  lime: "A8FF00",
  gray: "AAAAAA",
  grey: "AAAAAA",
};

/** Ubah nama warna / #RGB / #RRGGBB ke "RRGGBB" (huruf besar). Null kalau tidak valid. */
export function parseColorToRgb(input: string): string | null {
  const v = input.trim().toLowerCase();
  if (NAMED_COLORS[v]) return NAMED_COLORS[v];
  const m = v.replace(/^#/, "");
  if (/^[0-9a-f]{6}$/.test(m)) return m.toUpperCase();
  if (/^[0-9a-f]{3}$/.test(m)) {
    return m
      .split("")
      .map((c) => c + c)
      .join("")
      .toUpperCase();
  }
  return null;
}

/** "#RRGGBB" untuk dipakai di CSS (dashboard). */
export function colorToHex(input: string, fallback = "#FFFFFF"): string {
  const rgb = parseColorToRgb(input);
  return rgb ? `#${rgb}` : fallback;
}

/** "&H00BBGGRR" format warna ASS. */
export function colorToAss(input: string, fallback = "FFFFFF"): string {
  const rgb = parseColorToRgb(input) || fallback;
  const r = rgb.slice(0, 2);
  const g = rgb.slice(2, 4);
  const b = rgb.slice(4, 6);
  return `&H00${b}${g}${r}`.toUpperCase();
}

function parseColorEnv(name: string, raw: string | undefined, fallback: string): string {
  if (!raw || raw.trim() === "") return fallback;
  if (parseColorToRgb(raw)) return raw.trim();
  console.warn(`[subtitle-config] ${name}="${raw}" bukan warna valid. Menggunakan "${fallback}".`);
  return fallback;
}

// ─── Config utama ─────────────────────────────────────────────────────────
/** Satu-satunya tempat membaca env var untuk fitur ini — mudah diganti/diaudit. */
export function getSubtitleConfig(): SubtitleConfig {
  const marginRaw = process.env.SUBTITLE_MARGIN_V;
  return {
    enabled: parseBool(process.env.SUBTITLE_ENABLED, true),
    style: parseEnum("SUBTITLE_STYLE", process.env.SUBTITLE_STYLE, SUBTITLE_STYLES, "karaoke"),
    fontSize: Math.round(parseNumber(process.env.SUBTITLE_FONT_SIZE, 48, 16, 160)),
    font: (process.env.SUBTITLE_FONT || "Montserrat").trim(),
    fontsDir: (process.env.SUBTITLE_FONTS_DIR || "").trim(),
    color: parseColorEnv("SUBTITLE_COLOR", process.env.SUBTITLE_COLOR, "white"),
    highlightColor: parseColorEnv("SUBTITLE_HIGHLIGHT_COLOR", process.env.SUBTITLE_HIGHLIGHT_COLOR, "yellow"),
    outlineColor: parseColorEnv("SUBTITLE_OUTLINE_COLOR", process.env.SUBTITLE_OUTLINE_COLOR, "black"),
    position: parseEnum("SUBTITLE_POSITION", process.env.SUBTITLE_POSITION, SUBTITLE_POSITIONS, "bottom-center"),
    maxWordsPerLine: Math.round(parseNumber(process.env.SUBTITLE_MAX_WORDS_PER_LINE, 4, 1, 8)),
    animation: parseEnum("SUBTITLE_ANIMATION", process.env.SUBTITLE_ANIMATION, SUBTITLE_ANIMATIONS, "pop"),
    marginV:
      marginRaw && marginRaw.trim() !== "" ? Math.round(parseNumber(marginRaw, 260, 0, 900)) : null,
  };
}

export function isValidSubtitleStyle(value: string): value is SubtitleStyle {
  return (SUBTITLE_STYLES as readonly string[]).includes(value);
}

export function isValidSubtitleAnimation(value: string): value is SubtitleAnimation {
  return (SUBTITLE_ANIMATIONS as readonly string[]).includes(value);
}

export function getSubtitleStyleLabel(style: SubtitleStyle): string {
  const p = STYLE_PRESETS[style];
  return `${p.label} — ${p.description}`;
}

export function getSubtitlePositionLabel(position: SubtitlePosition): string {
  const labels: Record<SubtitlePosition, string> = {
    "bottom-center": "Bawah tengah",
    center: "Tengah layar",
    "top-center": "Atas tengah",
  };
  return labels[position] || position;
}
