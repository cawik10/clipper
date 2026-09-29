/**
 * VIDEO CONFIGURATION
 * ===================
 * Semua konfigurasi video dikontrol via environment variables.
 * Mudah diubah dari Railway Dashboard → Variables tanpa perlu redeploy kode.
 *
 * =====================================================================
 * ASPECT RATIO MODE
 * =====================================================================
 * ASPECT_RATIO_MODE=blur     ← REKOMENDASI: background blur, tidak bolong
 * ASPECT_RATIO_MODE=crop     ← Crop tengah, full layar
 * ASPECT_RATIO_MODE=pad      ← Black bars (letterbox)
 * ASPECT_RATIO_MODE=stretch  ← Stretch paksa
 * ASPECT_RATIO_MODE=none     ← Tidak konversi, keep original
 *
 * =====================================================================
 * THUMBNAIL AUTO-GENERATION
 * =====================================================================
 * THUMBNAIL_ENABLED=true          ← Aktifkan thumbnail (default: true)
 * THUMBNAIL_MODE=middle           ← middle | best | start | custom
 * THUMBNAIL_OFFSET_SECONDS=5      ← Offset untuk mode custom
 * THUMBNAIL_QUALITY=5             ← 1-31 (makin kecil makin bagus)
 * THUMBNAIL_WIDTH=1280            ← Lebar output
 * THUMBNAIL_HEIGHT=720            ← Tinggi output (0=auto)
 *
 * =====================================================================
 * WATERMARK CONFIGURATION (BARU!)
 * =====================================================================
 * WATERMARK_ENABLED=true          ← Aktifkan watermark (default: true)
 * WATERMARK_TEXT=@YourChannel     ← Teks watermark
 * WATERMARK_POSITION=bottomright ← topleft | topright | bottomleft | bottomright | center
 * WATERMARK_FONT_SIZE=32          ← Ukuran font (default: 32)
 * WATERMARK_COLOR=white           ← Warna teks (default: white)
 * WATERMARK_OPACITY=0.85          ← Transparansi 0.0-1.0 (default: 0.85)
 * WATERMARK_BOX=true              ← Tambah kotak background (default: true)
 * WATERMARK_BOX_COLOR=black@0.4   ← Warna kotak (default: black@0.4)
 * WATERMARK_IMAGE_PATH=           ← Path ke file gambar watermark (opsional)
 * WATERMARK_IMAGE_SCALE=0.15      ← Skala gambar watermark (default: 0.15)
 *
 * =====================================================================
 * INTRO / OUTRO CONFIGURATION (BARU!)
 * =====================================================================
 * INTRO_ENABLED=false             ← Aktifkan intro (default: false)
 * INTRO_VIDEO_PATH=               ← Path ke file video intro
 * INTRO_DURATION=3                ← Durasi intro dalam detik (jika generate otomatis)
 * INTRO_TEXT=AutoClip Bot         ← Teks pada intro otomatis
 * INTRO_COLOR=#000000             ← Warna background intro (default: hitam)
 * OUTRO_ENABLED=false             ← Aktifkan outro (default: false)
 * OUTRO_VIDEO_PATH=               ← Path ke file video outro
 * OUTRO_DURATION=3                ← Durasi outro dalam detik
 * OUTRO_TEXT=Subscribe! 🔔        ← Teks pada outro otomatis
 * OUTRO_COLOR=#000000             ← Warna background outro
 *
 * =====================================================================
 * ZOOM EFFECT ON HIGHLIGHT (BARU!)
 * =====================================================================
 * ZOOM_EFFECT_ENABLED=true        ← Aktifkan zoom effect (default: true)
 * ZOOM_EFFECT_MODE=auto           ← auto | always | never
 * ZOOM_EFFECT_INTENSITY=1.05      ← Skala zoom 1.0-1.3 (default: 1.05 = subtle)
 * ZOOM_EFFECT_DURATION=2.0        ← Durasi zoom dalam detik (default: 2.0)
 * ZOOM_EFFECT_MIN_SCORE=7         ← Viral score minimum untuk auto zoom (default: 7)
 * ZOOM_EFFECT_TYPE=in             ← in | out | in-out | pulse (default: in)
 */

export type AspectRatioMode = "blur" | "crop" | "pad" | "stretch" | "none";
export type ThumbnailMode = "middle" | "best" | "start" | "custom";
export type WatermarkPosition =
  | "topleft"
  | "topright"
  | "bottomleft"
  | "bottomright"
  | "center";
export type ZoomEffectMode = "auto" | "always" | "never";
export type ZoomEffectType = "in" | "out" | "in-out" | "pulse";

// ===== ASPECT RATIO =====

export function getAspectRatioMode(): AspectRatioMode {
  const mode = (process.env.ASPECT_RATIO_MODE || "blur").toLowerCase().trim();
  const valid: AspectRatioMode[] = ["blur", "crop", "pad", "stretch", "none"];
  if (valid.includes(mode as AspectRatioMode)) return mode as AspectRatioMode;
  console.warn(`[video-config] ASPECT_RATIO_MODE="${mode}" tidak valid. Menggunakan "blur".`);
  return "blur";
}

export const TARGET_WIDTH = 1080;
export const TARGET_HEIGHT = 1920;

export function buildFFmpegFilterArgs(mode: AspectRatioMode): {
  useFilterComplex: boolean;
  filterValue: string;
} {
  if (mode === "blur") {
    const filterComplex = [
      `[0:v]split=2[main][bg]`,
      `[bg]scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=increase,crop=${TARGET_WIDTH}:${TARGET_HEIGHT},boxblur=20:5[blurred]`,
      `[main]scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=decrease,pad=${TARGET_WIDTH}:${TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black@0[fg]`,
      `[blurred][fg]overlay=(W-w)/2:(H-h)/2,setsar=1[out]`,
    ].join(";");
    return { useFilterComplex: true, filterValue: filterComplex };
  }
  let vf = "";
  switch (mode) {
    case "crop":
      vf = `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=increase,crop=${TARGET_WIDTH}:${TARGET_HEIGHT},setsar=1`;
      break;
    case "pad":
      vf = `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=decrease,pad=${TARGET_WIDTH}:${TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`;
      break;
    case "stretch":
      vf = `scale=${TARGET_WIDTH}:${TARGET_HEIGHT},setsar=1`;
      break;
    case "none":
      vf = `scale=trunc(iw/2)*2:trunc(ih/2)*2`;
      break;
    default:
      vf = `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=increase,crop=${TARGET_WIDTH}:${TARGET_HEIGHT},setsar=1`;
  }
  return { useFilterComplex: false, filterValue: vf };
}

export function getModeLabel(mode: AspectRatioMode): string {
  const labels: Record<AspectRatioMode, string> = {
    blur: "Blur Background (9:16 Full)",
    crop: "Center Crop (9:16 Full)",
    pad: "Black Bars (Letterbox)",
    stretch: "Stretch to Fill",
    none: "Original Ratio",
  };
  return labels[mode] || mode;
}

// ===== THUMBNAIL CONFIG =====

export interface ThumbnailConfig {
  enabled: boolean;
  mode: ThumbnailMode;
  offsetSeconds: number;
  quality: number;
  width: number;
  height: number;
}

export function getThumbnailConfig(): ThumbnailConfig {
  const enabled =
    (process.env.THUMBNAIL_ENABLED || "true").toLowerCase().trim() !== "false";
  const rawMode = (process.env.THUMBNAIL_MODE || "middle").toLowerCase().trim();
  const validModes: ThumbnailMode[] = ["middle", "best", "start", "custom"];
  const mode: ThumbnailMode = validModes.includes(rawMode as ThumbnailMode)
    ? (rawMode as ThumbnailMode)
    : "middle";
  const offsetSeconds = Math.max(0, parseFloat(process.env.THUMBNAIL_OFFSET_SECONDS || "5") || 5);
  const quality = Math.min(31, Math.max(1, parseInt(process.env.THUMBNAIL_QUALITY || "5") || 5));
  const width = Math.max(64, parseInt(process.env.THUMBNAIL_WIDTH || "1280") || 1280);
  const height = Math.max(0, parseInt(process.env.THUMBNAIL_HEIGHT || "720") || 720);
  return { enabled, mode, offsetSeconds, quality, width, height };
}

export function getThumbnailModeLabel(mode: ThumbnailMode): string {
  const labels: Record<ThumbnailMode, string> = {
    middle: "Tengah Klip (Middle Frame)",
    best: "Frame Terbaik (Best Frame Scan)",
    start: "Awal Klip (Start Frame)",
    custom: "Custom Offset (detik ke-N)",
  };
  return labels[mode] || mode;
}

// ===== WATERMARK CONFIG (BARU!) =====

export interface WatermarkConfig {
  enabled: boolean;
  text: string;
  position: WatermarkPosition;
  fontSize: number;
  color: string;
  opacity: number;
  box: boolean;
  boxColor: string;
  imagePath: string;
  imageScale: number;
}

export function getWatermarkConfig(): WatermarkConfig {
  const enabled =
    (process.env.WATERMARK_ENABLED || "true").toLowerCase().trim() !== "false";
  const text = process.env.WATERMARK_TEXT || "@AutoClipBot";
  const rawPos = (process.env.WATERMARK_POSITION || "bottomright").toLowerCase().trim();
  const validPositions: WatermarkPosition[] = [
    "topleft", "topright", "bottomleft", "bottomright", "center",
  ];
  const position: WatermarkPosition = validPositions.includes(rawPos as WatermarkPosition)
    ? (rawPos as WatermarkPosition)
    : "bottomright";
  const fontSize = Math.max(8, Math.min(200, parseInt(process.env.WATERMARK_FONT_SIZE || "32") || 32));
  const color = process.env.WATERMARK_COLOR || "white";
  const opacity = Math.max(0, Math.min(1, parseFloat(process.env.WATERMARK_OPACITY || "0.85") || 0.85));
  const box = (process.env.WATERMARK_BOX || "true").toLowerCase().trim() !== "false";
  const boxColor = process.env.WATERMARK_BOX_COLOR || "black@0.4";
  const imagePath = process.env.WATERMARK_IMAGE_PATH || "";
  const imageScale = Math.max(0.01, Math.min(1, parseFloat(process.env.WATERMARK_IMAGE_SCALE || "0.15") || 0.15));
  return { enabled, text, position, fontSize, color, opacity, box, boxColor, imagePath, imageScale };
}

export function getWatermarkPositionLabel(pos: WatermarkPosition): string {
  const labels: Record<WatermarkPosition, string> = {
    topleft: "Kiri Atas",
    topright: "Kanan Atas",
    bottomleft: "Kiri Bawah",
    bottomright: "Kanan Bawah (Default)",
    center: "Tengah",
  };
  return labels[pos] || pos;
}

// ===== INTRO / OUTRO CONFIG (BARU!) =====

export interface IntroOutroConfig {
  introEnabled: boolean;
  introVideoPath: string;
  introDuration: number;
  introText: string;
  introColor: string;
  outroEnabled: boolean;
  outroVideoPath: string;
  outroDuration: number;
  outroText: string;
  outroColor: string;
}

export function getIntroOutroConfig(): IntroOutroConfig {
  const introEnabled =
    (process.env.INTRO_ENABLED || "false").toLowerCase().trim() === "true";
  const introVideoPath = process.env.INTRO_VIDEO_PATH || "";
  const introDuration = Math.max(1, Math.min(30, parseFloat(process.env.INTRO_DURATION || "3") || 3));
  const introText = process.env.INTRO_TEXT || "AutoClip Bot";
  const introColor = process.env.INTRO_COLOR || "#000000";
  const outroEnabled =
    (process.env.OUTRO_ENABLED || "false").toLowerCase().trim() === "true";
  const outroVideoPath = process.env.OUTRO_VIDEO_PATH || "";
  const outroDuration = Math.max(1, Math.min(30, parseFloat(process.env.OUTRO_DURATION || "3") || 3));
  const outroText = process.env.OUTRO_TEXT || "Subscribe! 🔔";
  const outroColor = process.env.OUTRO_COLOR || "#000000";
  return {
    introEnabled, introVideoPath, introDuration, introText, introColor,
    outroEnabled, outroVideoPath, outroDuration, outroText, outroColor,
  };
}

// ===== ZOOM EFFECT CONFIG (BARU!) =====

export interface ZoomEffectConfig {
  enabled: boolean;
  mode: ZoomEffectMode;
  intensity: number;
  duration: number;
  minScore: number;
  type: ZoomEffectType;
}

export function getZoomEffectConfig(): ZoomEffectConfig {
  const enabled =
    (process.env.ZOOM_EFFECT_ENABLED || "true").toLowerCase().trim() !== "false";
  const rawMode = (process.env.ZOOM_EFFECT_MODE || "auto").toLowerCase().trim();
  const validModes: ZoomEffectMode[] = ["auto", "always", "never"];
  const mode: ZoomEffectMode = validModes.includes(rawMode as ZoomEffectMode)
    ? (rawMode as ZoomEffectMode)
    : "auto";
  const intensity = Math.max(1.0, Math.min(1.5, parseFloat(process.env.ZOOM_EFFECT_INTENSITY || "1.05") || 1.05));
  const duration = Math.max(0.5, Math.min(10, parseFloat(process.env.ZOOM_EFFECT_DURATION || "2.0") || 2.0));
  const minScore = Math.max(1, Math.min(10, parseInt(process.env.ZOOM_EFFECT_MIN_SCORE || "7") || 7));
  const rawType = (process.env.ZOOM_EFFECT_TYPE || "in").toLowerCase().trim();
  const validTypes: ZoomEffectType[] = ["in", "out", "in-out", "pulse"];
  const type: ZoomEffectType = validTypes.includes(rawType as ZoomEffectType)
    ? (rawType as ZoomEffectType)
    : "in";
  return { enabled, mode, intensity, duration, minScore, type };
}

export function getZoomEffectLabel(type: ZoomEffectType): string {
  const labels: Record<ZoomEffectType, string> = {
    in: "Zoom In (Mendekati)",
    out: "Zoom Out (Menjauh)",
    "in-out": "Zoom In then Out",
    pulse: "Pulse / Denyut",
  };
  return labels[type] || type;
}
