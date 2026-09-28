/**
 * VIDEO ASPECT RATIO CONFIGURATION
 * =================================
 * Kontrol mode konversi 9:16 melalui environment variable:
 *
 *   ASPECT_RATIO_MODE=blur        ← REKOMENDASI: background blur, tidak bolong
 *   ASPECT_RATIO_MODE=crop        ← Crop tengah, full layar, bisa terpotong sisi
 *   ASPECT_RATIO_MODE=pad         ← Black bars (letterbox) — default lama
 *   ASPECT_RATIO_MODE=stretch     ← Stretch paksa, bisa distorsi
 *   ASPECT_RATIO_MODE=none        ← Tidak konversi, keep original
 *
 * Set di Railway: Settings → Variables → ASPECT_RATIO_MODE=blur
 */

export type AspectRatioMode = "blur" | "crop" | "pad" | "stretch" | "none";

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
  console.warn(`[video-config] ASPECT_RATIO_MODE="${mode}" tidak valid. Menggunakan "blur".`);
  return "blur";
}

/** Target resolusi 9:16 untuk YouTube Shorts */
export const TARGET_WIDTH = 1080;
export const TARGET_HEIGHT = 1920;

/**
 * Bangun FFmpeg -vf filter string berdasarkan mode yang dipilih.
 * Semua mode menghasilkan output 1080x1920 (9:16) tanpa "bolong".
 */
export function buildVideoFilter(mode: AspectRatioMode): string {
  switch (mode) {
    /**
     * BLUR MODE (Rekomendasi)
     * -----------------------
     * Video asli ditaruh di tengah dengan skala proporsional.
     * Sisi kosong diisi dengan versi video yang di-blur & di-scale penuh.
     * Hasil: full 9:16, tidak bolong, tidak crop, tidak distorsi.
     *
     * Teknik: overlay video di atas background yang di-blur.
     * split → [bg] scale+blur+boxblur → overlay dengan video utama yang di-scale
     */
    case "blur":
      return [
        // Split input jadi 2 stream: [main] dan [bg]
        `split=2[main][bg]`,
        // Background: scale ke 1080x1920 (stretch) lalu blur kuat
        `[bg]scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=increase`,
        `crop=${TARGET_WIDTH}:${TARGET_HEIGHT}`,
        `boxblur=20:5[blurred]`,
        // Foreground: scale proporsional agar muat di 1080x1920
        `[main]scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=decrease`,
        `pad=${TARGET_WIDTH}:${TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black@0[overlay]`,
        // Gabungkan: bg_blur + overlay video di tengah
        `[blurred][overlay]overlay=(W-w)/2:(H-h)/2`,
        `setsar=1`,
      ].join(",");

    /**
     * CROP MODE
     * ---------
     * Zoom & crop tengah video agar mengisi penuh 9:16.
     * Hasil: full layar tanpa bolong, tapi sisi kiri/kanan mungkin terpotong.
     * Cocok untuk video yang subyeknya di tengah.
     */
    case "crop":
      return [
        `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=increase`,
        `crop=${TARGET_WIDTH}:${TARGET_HEIGHT}`,
        `setsar=1`,
      ].join(",");

    /**
     * PAD MODE (Lama)
     * ---------------
     * Video di-scale proporsional, sisa area diisi hitam.
     * Hasil: ada "black bars" di sisi tapi tidak distorsi.
     */
    case "pad":
      return [
        `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=decrease`,
        `pad=${TARGET_WIDTH}:${TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black`,
        `setsar=1`,
      ].join(",");

    /**
     * STRETCH MODE
     * ------------
     * Paksa stretch ke 9:16. Cepat tapi bisa distorsi.
     */
    case "stretch":
      return [
        `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}`,
        `setsar=1`,
      ].join(",");

    /**
     * NONE MODE
     * ---------
     * Tidak ada konversi aspek rasio, keep original.
     * Hanya pastikan dimensi genap (divisible by 2).
     */
    case "none":
      return `scale=trunc(iw/2)*2:trunc(ih/2)*2`;

    default:
      return buildVideoFilter("blur");
  }
}

/**
 * Bangun argumen FFmpeg -filter_complex atau -vf.
 * Mode blur membutuhkan filter_complex (multi-input), sisanya pakai -vf.
 */
export function buildFFmpegFilterArgs(mode: AspectRatioMode): {
  useFilterComplex: boolean;
  filterValue: string;
} {
  if (mode === "blur") {
    // Untuk blur, kita pakai pendekatan split yang lebih kompatibel
    // menggunakan -filter_complex
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

/** Nama tampilan untuk mode */
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
