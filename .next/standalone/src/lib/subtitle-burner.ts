/**
 * 💬 SUBTITLE BURNER (FITUR BARU!)
 * =====================================================================
 * Merender caption "burned-in" ke klip memakai FFmpeg `ass` filter
 * (libass). Konfigurasi & preset style ada di src/lib/subtitle-config.ts.
 *
 * Alur:
 *   transkrip Whisper (kata + timestamp) → ambil kata milik klip →
 *   kelompokkan per baris → tulis file .ass → ffmpeg -vf ass=... → klip.
 *
 * Aman: semua fungsi publik TIDAK melempar error. Kalau gagal, klip
 * asli dipakai apa adanya (sama seperti watermark/zoom).
 */
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import {
  STYLE_PRESETS,
  getSubtitleConfig,
  colorToAss,
  type SubtitleConfig,
  type SubtitleStyle,
  type TranscriptSegmentWithWords,
  type TranscriptWord,
} from "@/lib/subtitle-config";

const execFileAsync = promisify(execFile);
const TMP_DIR = process.env.TMP_DIR || "/tmp/autoclip";

/** Resolusi acuan ASS (lebar). Tinggi menyesuaikan rasio video. */
const PLAY_RES_X = 1080;
const REF_HEIGHT = 1920;

export interface SubtitleResult {
  applied: boolean;
  outputPath: string;
  reason?: string;
  wordCount?: number;
}

// =====================================================================
// 1. AMBIL KATA UNTUK SATU KLIP
// =====================================================================

/** Kalau Whisper tidak memberi timestamp per kata, bagi teks segmen secara proporsional. */
function synthesizeWords(seg: TranscriptSegmentWithWords): TranscriptWord[] {
  const tokens = seg.text.split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const total = tokens.reduce((s, t) => s + t.length + 1, 0);
  const span = Math.max(0.1, seg.end - seg.start);
  let cursor = seg.start;
  return tokens.map((t) => {
    const dur = (span * (t.length + 1)) / total;
    const w = { start: cursor, end: cursor + dur, text: t };
    cursor += dur;
    return w;
  });
}

/**
 * Ambil kata-kata yang jatuh di rentang klip [startTime, endTime] (detik pada
 * video sumber) dan geser timestamp-nya supaya relatif terhadap awal klip.
 */
export function getClipWords(
  transcript: TranscriptSegmentWithWords[] | undefined,
  startTime: number,
  endTime: number
): TranscriptWord[] {
  if (!transcript || !transcript.length) return [];
  const clipDur = Math.max(0, endTime - startTime);
  const out: TranscriptWord[] = [];

  for (const seg of transcript) {
    if (seg.end < startTime - 1 || seg.start > endTime + 1) continue;
    const words = seg.words && seg.words.length ? seg.words : synthesizeWords(seg);
    for (const w of words) {
      const mid = (w.start + w.end) / 2;
      if (mid < startTime || mid > endTime) continue;
      const text = (w.text || "").trim();
      if (!text) continue;
      const s = Math.max(0, w.start - startTime);
      const e = Math.min(clipDur, Math.max(w.end - startTime, s + 0.08));
      out.push({ start: s, end: e, text });
    }
  }

  out.sort((a, b) => a.start - b.start);
  // Hilangkan tumpang-tindih antar kata
  for (let i = 0; i < out.length - 1; i++) {
    if (out[i].end > out[i + 1].start) {
      out[i].end = Math.max(out[i].start + 0.05, out[i + 1].start);
    }
  }
  return out;
}

// =====================================================================
// 2. ASS BUILDER
// =====================================================================

function assTime(t: number): string {
  const cs = Math.max(0, Math.round(t * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
}

function escapeAss(text: string): string {
  return text
    .replace(/\\/g, "")
    .replace(/\{/g, "(")
    .replace(/\}/g, ")")
    .replace(/[\r\n]+/g, " ");
}

/** Kata siap-render + teks asli (sebelum tanda baca dibuang) untuk deteksi akhir kalimat. */
type RenderWord = TranscriptWord & { raw: string };

function chunkWords(words: RenderWord[], maxWords: number, maxChars: number): RenderWord[][] {
  const chunks: RenderWord[][] = [];
  let cur: RenderWord[] = [];
  let curChars = 0;

  for (const w of words) {
    if (cur.length) {
      const prev = cur[cur.length - 1];
      const gap = w.start - prev.end;
      const sentenceEnd = /[.!?…]["')\]]?$/.test(prev.raw);
      if (
        cur.length >= maxWords ||
        gap > 0.7 ||
        sentenceEnd ||
        curChars + 1 + w.text.length > maxChars
      ) {
        chunks.push(cur);
        cur = [];
        curChars = 0;
      }
    }
    cur.push(w);
    curChars += (cur.length > 1 ? 1 : 0) + w.text.length;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

export function buildAss(
  inputWords: TranscriptWord[],
  cfg: SubtitleConfig,
  dims: { width: number; height: number } = { width: 1080, height: 1920 }
): string {
  const preset = STYLE_PRESETS[cfg.style];
  const playResY = Math.round((PLAY_RES_X * dims.height) / dims.width);
  const vScale = playResY / REF_HEIGHT;

  const fontPx = Math.round(cfg.fontSize * preset.fontScale);
  const maxWords = Math.max(1, Math.min(cfg.maxWordsPerLine, preset.maxWordsCap));
  const charW = fontPx * (preset.uppercase ? 0.72 : 0.6);
  const maxChars = Math.max(8, Math.floor((PLAY_RES_X - 120) * 0.92 / charW));

  // Siapkan teks tiap kata (uppercase / buang tanda baca sesuai preset)
  const words: RenderWord[] = [];
  for (const w of inputWords) {
    let t = w.text;
    if (preset.stripPunctuation) t = t.replace(/[.,;:!?…"“”'‘’()]+/g, "");
    if (preset.uppercase) t = t.toUpperCase();
    t = escapeAss(t.trim());
    if (!t) continue;
    words.push({ start: w.start, end: w.end, text: t, raw: w.text });
  }

  const alignment = cfg.position === "top-center" ? 8 : cfg.position === "center" ? 5 : 2;
  const baseMargin = cfg.marginV ?? (cfg.position === "center" ? 0 : 260);
  const marginV = cfg.position === "center" ? 0 : Math.round(baseMargin * vScale);

  const base = colorToAss(cfg.color);
  const hl = colorToAss(cfg.highlightColor, "FFE500");
  const outlineClr = colorToAss(cfg.outlineColor, "000000");
  // \kf: teks mulai dari SecondaryColour lalu "terisi" ke PrimaryColour.
  const primary = preset.highlightMode === "sweep" ? hl : base;
  const secondary = base;

  const lines: string[] = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${PLAY_RES_X}`,
    `PlayResY: ${playResY}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Default,${cfg.font},${fontPx},${primary},${secondary},${outlineClr},&H96000000,${preset.bold ? -1 : 0},0,0,0,100,100,0,0,1,${preset.outline},${preset.shadow},${alignment},60,60,${marginV},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  const chunks = chunkWords(words, maxWords, maxChars);
  const dialogue = (s: number, e: number, text: string) =>
    lines.push(`Dialogue: 0,${assTime(s)},${assTime(e)},Default,,0,0,0,,${text}`);

  chunks.forEach((chunk, ci) => {
    const nextStart = chunks[ci + 1]?.[0].start ?? Infinity;
    const chunkStart = chunk[0].start;
    const lastEnd = chunk[chunk.length - 1].end;
    const chunkEnd = Math.max(chunkStart + 0.2, Math.min(lastEnd + 0.15, nextStart));

    if (preset.highlightMode === "word") {
      // Satu event per kata aktif — kata aktif diberi warna highlight.
      chunk.forEach((active, i) => {
        const s = active.start;
        const e = i < chunk.length - 1 ? chunk[i + 1].start : chunkEnd;
        if (e - s < 0.04) return;

        const fadeIn = i === 0;
        const fadeOut = i === chunk.length - 1;
        let prefix = "";
        if (cfg.animation === "fade") {
          prefix = `{\\fad(${fadeIn ? 120 : 0},${fadeOut ? 100 : 0})}`;
        }
        const pop =
          cfg.animation === "pop" ? "\\fscx120\\fscy120\\t(0,110,\\fscx100\\fscy100)" : "";

        const text = chunk
          .map((w, j) => (j === i ? `{\\c${hl}${pop}}${w.text}{\\r}` : w.text))
          .join(" ");
        dialogue(s, e, prefix + text);
      });
      return;
    }

    // plain / sweep: satu event per baris
    let prefix = "";
    if (cfg.animation === "pop") prefix = "{\\fscx85\\fscy85\\t(0,130,\\fscx100\\fscy100)}";
    else if (cfg.animation === "fade") prefix = "{\\fad(120,100)}";

    let text: string;
    if (preset.highlightMode === "sweep") {
      text = chunk
        .map((w, i) => {
          const wEnd = i < chunk.length - 1 ? chunk[i + 1].start : w.end;
          const cs = Math.max(1, Math.round((wEnd - w.start) * 100));
          return `{\\kf${cs}}${w.text}${i < chunk.length - 1 ? " " : ""}`;
        })
        .join("");
    } else {
      text = chunk.map((w) => w.text).join(" ");
    }
    dialogue(chunkStart, chunkEnd, prefix + text);
  });

  return lines.join("\n") + "\n";
}

// =====================================================================
// 3. FFMPEG
// =====================================================================

function escapeFilterValue(v: string): string {
  return v.replace(/([\\':,\[\];])/g, "\\$1");
}

function buildAssFilter(assPath: string, cfg: SubtitleConfig): string {
  let f = `ass=filename=${escapeFilterValue(assPath)}`;
  if (cfg.fontsDir && fs.existsSync(cfg.fontsDir)) {
    f += `:fontsdir=${escapeFilterValue(cfg.fontsDir)}`;
  }
  return f;
}

async function probeDimensions(file: string): Promise<{ width: number; height: number }> {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height",
        "-of", "csv=p=0:s=x",
        file,
      ],
      { timeout: 15000 }
    );
    const [w, h] = stdout.trim().split("x").map((n) => parseInt(n, 10));
    if (w > 0 && h > 0) return { width: w, height: h };
  } catch {
    /* fallback di bawah */
  }
  return { width: 1080, height: 1920 };
}

function safeUnlink(p: string) {
  try {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {
    /* ignore */
  }
}

/**
 * Burn subtitle ke `inputPath` → `outputPath`.
 * `words` = hasil `getClipWords()` (timestamp relatif awal klip).
 */
export async function applySubtitles(
  inputPath: string,
  outputPath: string,
  words: TranscriptWord[],
  config?: SubtitleConfig
): Promise<SubtitleResult> {
  const cfg = config || getSubtitleConfig();
  const skip = (reason: string): SubtitleResult => ({ applied: false, outputPath: inputPath, reason });

  if (!cfg.enabled) return skip("SUBTITLE_ENABLED=false");
  if (!words.length) return skip("tidak ada transkrip/kata untuk klip ini");
  if (!fs.existsSync(inputPath)) return skip("input file tidak ditemukan");

  const assPath = outputPath.replace(/\.[^.]+$/, "") + ".ass";
  try {
    const dims = await probeDimensions(inputPath);
    fs.writeFileSync(assPath, buildAss(words, cfg, dims), "utf8");

    console.log(
      `[subtitle] Burning ${words.length} kata (style=${cfg.style}, anim=${cfg.animation}, pos=${cfg.position})`
    );
    await execFileAsync(
      "ffmpeg",
      [
        "-y",
        "-i", inputPath,
        "-vf", buildAssFilter(assPath, cfg),
        "-c:v", "libx264",
        "-crf", "23",
        "-preset", "fast",
        "-pix_fmt", "yuv420p",
        "-c:a", "copy",
        "-threads", "2",
        outputPath,
      ],
      { timeout: 600000, maxBuffer: 20 * 1024 * 1024 }
    );

    if (!fs.existsSync(outputPath)) throw new Error("output subtitle tidak terbuat");
    return { applied: true, outputPath, wordCount: words.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[subtitle] ❌ Gagal burn subtitle, klip dipakai tanpa subtitle:", msg.slice(0, 500));
    safeUnlink(outputPath);
    return skip(`ffmpeg gagal: ${msg.slice(0, 120)}`);
  } finally {
    safeUnlink(assPath);
  }
}

// =====================================================================
// 4. PREVIEW (untuk Telegram /subtitle)
// =====================================================================

const PREVIEW_SENTENCE =
  "Ini contoh subtitle yang bikin video kamu terlihat profesional dan viral banget!";

/**
 * Render video pendek (±4 dtk, 540x960) berisi contoh caption dengan style
 * yang diminta. Mengembalikan path mp4 — pemanggil wajib menghapusnya.
 * Melempar error kalau FFmpeg tidak tersedia/gagal (pemanggil yang menangani).
 */
export async function renderSubtitlePreview(
  style: SubtitleStyle,
  overrides: Partial<SubtitleConfig> = {}
): Promise<string> {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
  const cfg: SubtitleConfig = { ...getSubtitleConfig(), ...overrides, enabled: true, style };

  const tokens = PREVIEW_SENTENCE.split(" ");
  const step = 0.36;
  const words: TranscriptWord[] = tokens.map((t, i) => ({
    start: 0.3 + i * step,
    end: 0.3 + (i + 1) * step - 0.02,
    text: t,
  }));
  const duration = Math.ceil((0.3 + tokens.length * step + 0.6) * 10) / 10;

  const stamp = `${style}_${Date.now()}`;
  const assPath = path.join(TMP_DIR, `subtitle_preview_${stamp}.ass`);
  const outPath = path.join(TMP_DIR, `subtitle_preview_${stamp}.mp4`);
  try {
    fs.writeFileSync(assPath, buildAss(words, cfg, { width: 1080, height: 1920 }), "utf8");
    const vf = `drawbox=x=0:y=ih*0.30:w=iw:h=ih*0.40:color=0x3b4a63:t=fill,${buildAssFilter(assPath, cfg)}`;
    await execFileAsync(
      "ffmpeg",
      [
        "-y",
        "-f", "lavfi",
        "-i", `color=c=0x1b2233:s=540x960:r=30:d=${duration}`,
        "-vf", vf,
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "26",
        "-pix_fmt", "yuv420p",
        "-an",
        outPath,
      ],
      { timeout: 60000, maxBuffer: 10 * 1024 * 1024 }
    );
    if (!fs.existsSync(outPath)) throw new Error("preview tidak terbuat");
    return outPath;
  } catch (err) {
    safeUnlink(outPath);
    throw err;
  } finally {
    safeUnlink(assPath);
  }
}
