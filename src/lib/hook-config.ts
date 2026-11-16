/**
 * 🪝 AI HOOK OVERLAY — TEKS PEMBUKA (FITUR BARU!)
 * =====================================================================
 * Teks hook singkat yang muncul di 1-2 detik pertama klip — faktor utama
 * retention di Shorts. Teks hook DI-GENERATE oleh AI bersamaan dengan
 * analisis momen (lihat `src/lib/ai-analyzer.ts`, ditambahkan ke prompt
 * GPT/Gemini yang sudah ada), lalu dirender lewat FFmpeg `drawtext` dengan
 * `enable='between(t,0,HOOK_DURATION)'` (lihat `src/lib/hook-overlay.ts`).
 *
 * Kalau AI tidak memberi hook / FFmpeg gagal, klip tetap diproses normal
 * tanpa hook — proses TIDAK PERNAH gagal gara-gara fitur ini.
 *
 * Contoh hook yang dihasilkan AI:
 *   "Kamu gak akan percaya apa yang terjadi selanjutnya..."
 *   "99% orang salah soal ini!"
 *   "Ini rahasia yang CEO gak mau kamu tahu"
 *
 * =====================================================================
 * CARA MENGATUR (Railway → Variables)
 * =====================================================================
 * HOOK_ENABLED=true             ← nyalakan/matikan (default: true)
 * HOOK_DURATION=2               ← lama hook tampil, detik (0.5 - 5, default 2)
 * HOOK_STYLE=bold-center        ← bold-center | top-bar | split
 * HOOK_FONT_SIZE=56             ← ukuran font (px, basis lebar 1080, default 56)
 * HOOK_COLOR=white              ← warna teks (nama warna / #RRGGBB)
 * HOOK_BG_COLOR=#FF0000         ← warna latar/bar (nama warna / #RRGGBB)
 *
 * Opsional (punya default aman):
 * HOOK_FONT=Montserrat          ← nama font fontconfig (fallback otomatis ke DejaVu Sans)
 * HOOK_FONT_FILE=               ← path file .ttf/.otf (kalau diisi, menggantikan HOOK_FONT)
 * HOOK_BG_OPACITY=0.92          ← transparansi latar 0-1
 * HOOK_MAX_CHARS=70             ← batas panjang teks hook (karakter)
 * HOOK_UPPERCASE=false          ← true = paksa HURUF BESAR
 * HOOK_FALLBACK=true            ← true = bikin hook sederhana dari judul klip
 *                                  kalau AI tidak memberi hook
 *
 * =====================================================================
 * MODE STYLE
 * =====================================================================
 * bold-center → teks besar di tengah layar dalam kotak berwarna
 * top-bar     → bar penuh selebar layar di bagian atas
 * split       → hook dipecah dua: separuh pertama di bar atas (warna
 *               HOOK_BG_COLOR), separuh kedua di bar bawah (gelap)
 *
 * 👉 Mau menambah/mengubah style? Edit `HOOK_STYLE_PRESETS` di bawah dan
 *    tambahkan nama style ke `HOOK_STYLES` — dashboard & renderer otomatis
 *    mengikuti.
 */

export const HOOK_STYLES = ["bold-center", "top-bar", "split"] as const;
export type HookStyle = (typeof HOOK_STYLES)[number];

export interface HookStylePreset {
  label: string;
  description: string;
  /** Posisi vertikal blok teks (0 = atas, 1 = bawah) untuk bagian pertama. */
  yRatio: number;
  /** Posisi vertikal bagian kedua (khusus style yang memecah teks jadi 2). */
  secondYRatio?: number;
  /** Bar selebar layar (true) atau kotak mengikuti teks (false). */
  fullWidthBar: boolean;
  /** Pecah hook jadi dua bagian di dua posisi. */
  splitInTwo: boolean;
  /** Lebar maksimum teks relatif terhadap lebar video. */
  maxWidthRatio: number;
}

/** ✏️ Edit di sini untuk menyetel tampilan tiap style. */
export const HOOK_STYLE_PRESETS: Record<HookStyle, HookStylePreset> = {
  "bold-center": {
    label: "Bold Center",
    description: "Teks besar di tengah layar dalam kotak berwarna",
    yRatio: 0.5,
    fullWidthBar: false,
    splitInTwo: false,
    maxWidthRatio: 0.82,
  },
  "top-bar": {
    label: "Top Bar",
    description: "Bar penuh di bagian atas layar",
    yRatio: 0.12,
    fullWidthBar: true,
    splitInTwo: false,
    maxWidthRatio: 0.88,
  },
  split: {
    label: "Split",
    description: "Hook dipecah: separuh di bar atas, separuh di bar bawah",
    yRatio: 0.14,
    secondYRatio: 0.68,
    fullWidthBar: true,
    splitInTwo: true,
    maxWidthRatio: 0.88,
  },
};

export interface HookConfig {
  enabled: boolean;
  /** Detik hook tampil (mulai dari detik 0 klip). */
  duration: number;
  style: HookStyle;
  fontSize: number;
  color: string;
  bgColor: string;
  bgOpacity: number;
  font: string;
  fontFile: string;
  maxChars: number;
  uppercase: boolean;
  fallbackFromTitle: boolean;
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

function parseStyle(raw: string | undefined, fallback: HookStyle): HookStyle {
  if (!raw || raw.trim() === "") return fallback;
  const v = raw.toLowerCase().trim().replace(/[_\s]/g, "-");
  if ((HOOK_STYLES as readonly string[]).includes(v)) return v as HookStyle;
  if (v === "center" || v === "bold") return "bold-center";
  if (v === "top" || v === "bar" || v === "topbar") return "top-bar";
  console.warn(
    `[hook-config] HOOK_STYLE="${raw}" tidak valid (pilihan: ${HOOK_STYLES.join(", ")}). Menggunakan "${fallback}".`
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
  red: "FF0000",
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

/** Nama warna / #RGB / #RRGGBB → "RRGGBB" (huruf besar). Null kalau tidak valid. */
export function hookColorToRgb(input: string): string | null {
  const v = input.trim().toLowerCase();
  if (NAMED_COLORS[v]) return NAMED_COLORS[v];
  const m = v.replace(/^#/, "").replace(/^0x/, "");
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

/** "#RRGGBB" untuk CSS (dashboard). */
export function hookColorToHex(input: string, fallback = "#FFFFFF"): string {
  const rgb = hookColorToRgb(input);
  return rgb ? `#${rgb}` : fallback;
}

/** "0xRRGGBB" (+ "@alpha") untuk argumen warna FFmpeg. */
export function hookColorToFfmpeg(input: string, fallbackRgb: string, opacity?: number): string {
  const rgb = hookColorToRgb(input) || fallbackRgb;
  const base = `0x${rgb}`;
  return opacity !== undefined && opacity < 1 ? `${base}@${opacity.toFixed(2)}` : base;
}

function parseColorEnv(name: string, raw: string | undefined, fallback: string): string {
  if (!raw || raw.trim() === "") return fallback;
  if (hookColorToRgb(raw)) return raw.trim();
  console.warn(`[hook-config] ${name}="${raw}" bukan warna valid. Menggunakan "${fallback}".`);
  return fallback;
}

// ─── Config utama ─────────────────────────────────────────────────────────
/** Satu-satunya tempat membaca env var HOOK_* — mudah diganti/diaudit. */
export function getHookConfig(): HookConfig {
  return {
    enabled: parseBool(process.env.HOOK_ENABLED, true),
    duration: Math.round(parseNumber(process.env.HOOK_DURATION, 2, 0.5, 5) * 10) / 10,
    style: parseStyle(process.env.HOOK_STYLE, "bold-center"),
    fontSize: Math.round(parseNumber(process.env.HOOK_FONT_SIZE, 56, 20, 140)),
    color: parseColorEnv("HOOK_COLOR", process.env.HOOK_COLOR, "white"),
    bgColor: parseColorEnv("HOOK_BG_COLOR", process.env.HOOK_BG_COLOR, "#FF0000"),
    bgOpacity: parseNumber(process.env.HOOK_BG_OPACITY, 0.92, 0, 1),
    font: (process.env.HOOK_FONT || "Montserrat").trim(),
    fontFile: (process.env.HOOK_FONT_FILE || "").trim(),
    maxChars: Math.round(parseNumber(process.env.HOOK_MAX_CHARS, 70, 20, 140)),
    uppercase: parseBool(process.env.HOOK_UPPERCASE, false),
    fallbackFromTitle: parseBool(process.env.HOOK_FALLBACK, true),
  };
}

export function isValidHookStyle(value: string): value is HookStyle {
  return (HOOK_STYLES as readonly string[]).includes(value);
}

export function getHookStyleLabel(style: HookStyle): string {
  const p = HOOK_STYLE_PRESETS[style];
  return `${p.label} — ${p.description}`;
}

// ─── Pembersihan teks hook ────────────────────────────────────────────────
/**
 * Rapikan teks hook dari AI: buang kutipan/hashtag/baris baru, batasi panjang.
 * Return string kosong kalau tidak ada yang tersisa.
 */
export function sanitizeHookText(raw: unknown, maxChars: number = getHookConfig().maxChars): string {
  if (typeof raw !== "string") return "";
  let t = raw
    .replace(/[\r\n\t]+/g, " ")
    .replace(/#\w+/g, "")
    .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length > maxChars) {
    const cut = t.slice(0, maxChars);
    const lastSpace = cut.lastIndexOf(" ");
    t = (lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,;:\-–]+$/, "").trim();
    if (!/[.!?…]$/.test(t)) t += "...";
  }
  return t;
}

/** Hook cadangan sederhana dari judul klip (dipakai kalau AI tidak memberi hook). */
export function buildFallbackHook(title: string, index: number): string {
  const cleaned = sanitizeHookText(title.replace(/#shorts/gi, ""), 48);
  const templates = [
    (t: string) => (t ? `${t}` : "Tonton sampai habis!"),
    (t: string) => (t ? `Jangan skip! ${t}` : "Jangan skip video ini!"),
    (t: string) => (t ? `Kamu wajib tahu: ${t}` : "Kamu wajib tahu ini!"),
  ];
  return sanitizeHookText(templates[index % templates.length](cleaned));
}
