/**
 * VIDEO ASPECT RATIO CONFIGURATION
 * =================================
 * Kontrol mode konversi 9:16 melalui environment variable:
 *
 * ASPECT_RATIO_MODE=blur     ← REKOMENDASI: background blur, tidak bolong
 * ASPECT_RATIO_MODE=crop     ← Crop tengah, full layar, bisa terpotong sisi
 * ASPECT_RATIO_MODE=pad      ← Black bars (letterbox)
 * ASPECT_RATIO_MODE=stretch  ← Stretch paksa, bisa distorsi
 * ASPECT_RATIO_MODE=none     ← Tidak konversi, keep original
 *
 * Set di Railway: Settings → Variables → ASPECT_RATIO_MODE=blur
 *
 * =====================================================================
 * THUMBNAIL AUTO-GENERATION CONFIGURATION
 * =====================================================================
 * Aktifkan/matikan thumbnail generation via:
 *
 * THUMBNAIL_ENABLED=true     ← Generate thumbnail otomatis (default: true)
 * THUMBNAIL_ENABLED=false    ← Matikan thumbnail generation
 *
 * Mode thumbnail (cara frame diambil):
 * THUMBNAIL_MODE=middle      ← Frame di tengah klip (default, stabil)
 * THUMBNAIL_MODE=best        ← Frame terbaik berdasarkan skor (lebih lambat)
 * THUMBNAIL_MODE=start       ← Frame di awal klip (hook)
 * THUMBNAIL_MODE=custom      ← Gunakan THUMBNAIL_OFFSET_SECONDS
 *
 * Offset kustom (hanya untuk THUMBNAIL_MODE=custom):
 * THUMBNAIL_OFFSET_SECONDS=5 ← Ambil frame di detik ke-5 dari awal klip
 *
 * Kualitas thumbnail (1-31, makin kecil makin bagus):
 * THUMBNAIL_QUALITY=2        ← Kualitas sangat tinggi
 * THUMBNAIL_QUALITY=5        ← Kualitas tinggi (default)
 * THUMBNAIL_QUALITY=10       ← Kualitas sedang, file lebih kecil
 *
 * Resolusi thumbnail:
 * THUMBNAIL_WIDTH=1280       ← Lebar (default: 1280)
 * THUMBNAIL_HEIGHT=720       ← Tinggi (default: 720, akan di-auto jika 0)
 *
 * Set di Railway: Settings → Variables
 */

export type AspectRatioMode = "blur" | "crop" | "pad" | "stretch" | "none";
export type ThumbnailMode = "middle" | "best" | "start" | "custom";

// ===== ASPECT RATIO =====

/**
 * Dapatkan mode dari environment variable.
 * Default: "blur" (paling bagus untuk Shorts — tidak bolong, tidak crop).
 */
export function getAspectRatioMode(): AspectRatioMode {
  const mode = (process.env.ASPECT_RATIO_MODE || "blur").toLowerCase().trim();
  const valid: AspectRatioMode[] = ["blur", "crop", "pad", "stretch", "none"];
  if (valid.includes(mode as AspectRatioMode)) {
    return mode as AspectRatioMode;
  }
  console.warn(
    `[video-config] ASPECT_RATIO_MODE="${mode}" tidak valid. Menggunakan "blur".`
  );
  return "blur";
}

/** Target resolusi 9:16 untuk YouTube Shorts */
export const TARGET_WIDTH = 1080;
export const TARGET_HEIGHT = 1920;

export function buildVideoFilter(mode: AspectRatioMode): string {
  switch (mode) {
    case "blur":
      return [
        `split=2[main][bg]`,
        `[bg]scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=increase`,
        `crop=${TARGET_WIDTH}:${TARGET_HEIGHT}`,
        `boxblur=20:5[blurred]`,
        `[main]scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=decrease`,
        `pad=${TARGET_WIDTH}:${TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black@0[overlay]`,
        `[blurred][overlay]overlay=(W-w)/2:(H-h)/2`,
        `setsar=1`,
      ].join(",");

    case "crop":
      return [
        `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=increase`,
        `crop=${TARGET_WIDTH}:${TARGET_HEIGHT}`,
        `setsar=1`,
      ].join(",");

    case "pad":
      return [
        `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=decrease`,
        `pad=${TARGET_WIDTH}:${TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black`,
        `setsar=1`,
      ].join(",");

    case "stretch":
      return [`scale=${TARGET_WIDTH}:${TARGET_HEIGHT}`, `setsar=1`].join(",");

    case "none":
      return `scale=trunc(iw/2)*2:trunc(ih/2)*2`;

    default:
      return buildVideoFilter("blur");
  }
}

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
  return { useFilterComplex: false, filterValue: buildVideoFilter(mode) };
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

/**
 * Baca konfigurasi thumbnail dari environment variables.
 * Semua nilai mudah diubah dari Railway Dashboard → Variables.
 */
export function getThumbnailConfig(): ThumbnailConfig {
  const enabled =
    (process.env.THUMBNAIL_ENABLED || "true").toLowerCase().trim() !== "false";

  const rawMode = (process.env.THUMBNAIL_MODE || "middle").toLowerCase().trim();
  const validModes: ThumbnailMode[] = ["middle", "best", "start", "custom"];
  const mode: ThumbnailMode = validModes.includes(rawMode as ThumbnailMode)
    ? (rawMode as ThumbnailMode)
    : "middle";

  const offsetSeconds = Math.max(
    0,
    parseFloat(process.env.THUMBNAIL_OFFSET_SECONDS || "5") || 5
  );

  const quality = Math.min(
    31,
    Math.max(1, parseInt(process.env.THUMBNAIL_QUALITY || "5") || 5)
  );

  const width = Math.max(
    64,
    parseInt(process.env.THUMBNAIL_WIDTH || "1280") || 1280
  );
  const height = Math.max(
    0,
    parseInt(process.env.THUMBNAIL_HEIGHT || "720") || 720
  );

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
