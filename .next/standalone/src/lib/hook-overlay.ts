/**
 * 🪝 AI HOOK OVERLAY RENDERER (FITUR BARU!)
 * =====================================================================
 * Merender teks hook (hasil AI) ke 1-2 detik pertama klip lewat FFmpeg
 * `drawtext` + `drawbox` dengan `enable='between(t,0,HOOK_DURATION)'`.
 *
 * Konfigurasi (env var HOOK_*) & penjelasan style: src/lib/hook-config.ts
 * Hook di-generate AI bersamaan dengan analisis momen: src/lib/ai-analyzer.ts
 *
 * Tidak pernah melempar error — kalau gagal, klip asli dipakai apa adanya.
 */
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import {
  getHookConfig,
  HOOK_STYLE_PRESETS,
  hookColorToFfmpeg,
  sanitizeHookText,
  type HookConfig,
} from "@/lib/hook-config";

const execFileAsync = promisify(execFile);
const TMP_DIR = process.env.TMP_DIR || "/tmp/autoclip";

export interface HookOverlayResult {
  applied: boolean;
  outputPath: string;
  reason?: string;
}

const DEJAVU_BOLD_CANDIDATES = [
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
];

// ─── Helper teks ──────────────────────────────────────────────────────────
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

/** Pecah teks jadi dua bagian dengan panjang kira-kira sama (di batas kata). */
function splitInHalf(text: string): [string, string] {
  const words = text.split(" ").filter(Boolean);
  if (words.length < 2) return [text, ""];
  const half = text.length / 2;
  let acc = 0;
  let idx = 1;
  for (let i = 0; i < words.length; i++) {
    acc += words[i].length + 1;
    if (acc >= half) {
      idx = Math.min(words.length - 1, Math.max(1, i + 1));
      // pilih batas terdekat dengan tengah
      const before = acc - words[i].length - 1;
      if (Math.abs(before - half) < Math.abs(acc - half) && i >= 1) idx = i;
      break;
    }
  }
  return [words.slice(0, idx).join(" "), words.slice(idx).join(" ")];
}

/** Escape nilai di dalam tanda kutip tunggal untuk filtergraph FFmpeg. */
function escFilterValue(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/:/g, "\\:");
}

async function probeSize(inputPath: string): Promise<{ width: number; height: number }> {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height",
        "-of", "csv=p=0:s=x",
        inputPath,
      ],
      { timeout: 30000 }
    );
    const [w, h] = stdout.trim().split("x").map((n) => parseInt(n, 10));
    if (w > 0 && h > 0) return { width: w, height: h };
  } catch {
    /* pakai default 9:16 */
  }
  return { width: 1080, height: 1920 };
}

// ─── Filter builder ───────────────────────────────────────────────────────
interface FontAttempt {
  label: string;
  /** Potongan opsi drawtext, mis. `font='Montserrat:bold'` atau `fontfile='...'`. */
  option: string;
}

function buildFontAttempts(cfg: HookConfig): FontAttempt[] {
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

function buildFilter(
  cfg: HookConfig,
  text: string,
  width: number,
  height: number,
  fontOption: string,
  textFiles: string[],
  runId: string
): string {
  const preset = HOOK_STYLE_PRESETS[cfg.style];
  const scale = width / 1080;
  const fs_ = Math.max(16, Math.round(cfg.fontSize * scale));
  const pitch = Math.round(fs_ * 1.3);
  const pad = Math.round(fs_ * 0.45);
  const enable = `enable='between(t,0,${cfg.duration})'`;
  const fontColor = hookColorToFfmpeg(cfg.color, "FFFFFF");
  const bgColor = hookColorToFfmpeg(cfg.bgColor, "FF0000", cfg.bgOpacity);
  const darkColor = `0x000000@${Math.min(0.88, Math.max(cfg.bgOpacity, 0.6)).toFixed(2)}`;

  // Perkiraan karakter per baris (huruf kapital & font bold lebih lebar).
  const charW = fs_ * (cfg.uppercase ? 0.72 : 0.62);
  const maxChars = Math.max(8, Math.floor((width * preset.maxWidthRatio) / charW));

  const parts: { lines: string[]; yRatio: number; color: string }[] = [];
  if (preset.splitInTwo) {
    const [a, b] = splitInHalf(text);
    parts.push({ lines: wrapText(a, maxChars), yRatio: preset.yRatio, color: bgColor });
    if (b) {
      parts.push({
        lines: wrapText(b, maxChars),
        yRatio: preset.secondYRatio ?? 0.68,
        color: darkColor,
      });
    }
  } else {
    parts.push({ lines: wrapText(text, maxChars), yRatio: preset.yRatio, color: bgColor });
  }

  const filters: string[] = [];
  let fileCounter = 0;

  const addLine = (line: string, y: number, withBox: boolean, boxBw: number) => {
    const file = path.join(TMP_DIR, `hook_${runId}_${fileCounter++}.txt`);
    fs.writeFileSync(file, line, "utf8");
    textFiles.push(file);
    let f =
      `drawtext=textfile='${escFilterValue(file)}':expansion=none:${fontOption}` +
      `:fontsize=${fs_}:fontcolor=${fontColor}:x=(w-text_w)/2:y=${y}` +
      `:borderw=${Math.max(1, Math.round(fs_ * 0.04))}:bordercolor=0x000000@0.35`;
    if (withBox) f += `:box=1:boxcolor=${bgColor}:boxborderw=${boxBw}`;
    f += `:${enable}`;
    filters.push(f);
  };

  for (const part of parts) {
    const n = part.lines.length;
    if (preset.fullWidthBar) {
      // Bar selebar layar + teks terpusat per baris.
      const barH = n * pitch + 2 * pad;
      const barY = Math.round(height * part.yRatio);
      filters.push(`drawbox=x=0:y=${barY}:w=iw:h=${barH}:color=${part.color}:t=fill:${enable}`);
      part.lines.forEach((line, i) => addLine(line, barY + pad + i * pitch, false, 0));
    } else {
      // Kotak mengikuti panjang tiap baris (box per baris), blok terpusat vertikal.
      const bw = Math.round(fs_ * 0.28);
      const boxPitch = Math.round(fs_ * 1.17) + 2 * bw;
      const totalH = n * boxPitch;
      const top = Math.round(height * part.yRatio - totalH / 2) + bw;
      part.lines.forEach((line, i) => addLine(line, top + i * boxPitch, true, bw));
    }
  }

  return filters.join(",");
}

// ─── Render ───────────────────────────────────────────────────────────────
export async function applyHookOverlay(
  inputPath: string,
  outputPath: string,
  hook: string | undefined | null,
  config?: HookConfig
): Promise<HookOverlayResult> {
  const cfg = config || getHookConfig();
  const skip = (reason: string): HookOverlayResult => ({ applied: false, outputPath: inputPath, reason });

  if (!cfg.enabled) return skip("HOOK_ENABLED=false");
  if (!fs.existsSync(inputPath)) return skip("input tidak ditemukan");

  let text = sanitizeHookText(stripUnrenderable(typeof hook === "string" ? hook : ""), cfg.maxChars);
  if (cfg.uppercase) text = text.toUpperCase();
  if (!text) return skip("klip tidak punya teks hook");

  const { width, height } = await probeSize(inputPath);
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const textFiles: string[] = [];
  const attempts = buildFontAttempts(cfg);
  let lastError = "";

  try {
    for (const attempt of attempts) {
      try {
        const filter = buildFilter(cfg, text, width, height, attempt.option, textFiles, runId);
        console.log(
          `[hook] Rendering hook (${cfg.style}, ${cfg.duration}s, font ${attempt.label}): "${text}"`
        );
        await execFileAsync(
          "ffmpeg",
          [
            "-y",
            "-i", inputPath,
            "-vf", filter,
            "-c:v", "libx264",
            "-crf", "23",
            "-preset", "fast",
            "-pix_fmt", "yuv420p",
            "-threads", "2",
            "-c:a", "copy",
            "-movflags", "+faststart",
            outputPath,
          ],
          { timeout: 600000, maxBuffer: 20 * 1024 * 1024 }
        );
        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
          return { applied: true, outputPath };
        }
        lastError = "output kosong";
      } catch (err) {
        lastError = err instanceof Error ? err.message.split("\n").slice(-4).join(" ") : String(err);
        console.warn(`[hook] ⚠️ Gagal dengan font "${attempt.label}": ${lastError.slice(0, 300)}`);
        try { fs.unlinkSync(outputPath); } catch { /* ignore */ }
      }
    }
    console.error("[hook] ❌ Hook overlay gagal, klip dipakai tanpa hook:", lastError.slice(0, 300));
    return skip(`FFmpeg gagal: ${lastError.slice(0, 120)}`);
  } finally {
    for (const f of textFiles) {
      try { fs.unlinkSync(f); } catch { /* ignore */ }
    }
  }
}
