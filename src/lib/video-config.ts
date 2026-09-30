/**
 * VIDEO CONFIGURATION
 * ===================
 * All settings can be set per-user via Telegram /settings command.
 * Railway/env vars act as GLOBAL DEFAULTS when no per-user value is set.
 *
 * Priority: Per-user DB setting > ENV VAR default > Hardcoded fallback
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

// ─── MAX CLIPS ────────────────────────────────────────────────────────────

/** Global default from env var (Railway Variables). Fallback: 5 */
export function getMaxClipsConfig(): number {
  const raw = process.env.MAX_CLIPS;
  if (raw) {
    const parsed = parseInt(raw.trim(), 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 10) return parsed;
  }
  return 5;
}

/** Effective max clips for a user. Per-user > env default. */
export function resolveMaxClips(userValue: number | null | undefined): number {
  if (userValue != null && userValue >= 1 && userValue <= 10) return userValue;
  return getMaxClipsConfig();
}

// ─── ASPECT RATIO ────────────────────────────────────────────────────────

export function getAspectRatioMode(): AspectRatioMode {
  const raw = (process.env.ASPECT_RATIO_MODE || "blur").toLowerCase().trim();
  const valid: AspectRatioMode[] = ["blur", "crop", "pad", "stretch", "none"];
  return valid.includes(raw as AspectRatioMode) ? (raw as AspectRatioMode) : "blur";
}

export function resolveAspectRatioMode(userValue: string | null | undefined): AspectRatioMode {
  if (userValue) {
    const valid: AspectRatioMode[] = ["blur", "crop", "pad", "stretch", "none"];
    if (valid.includes(userValue as AspectRatioMode)) return userValue as AspectRatioMode;
  }
  return getAspectRatioMode();
}

export function getModeLabel(mode: AspectRatioMode): string {
  const labels: Record<AspectRatioMode, string> = {
    blur: "Blur Background \\(9:16 Full\\)",
    crop: "Center Crop \\(9:16 Full\\)",
    pad: "Black Bars \\(Letterbox\\)",
    stretch: "Stretch to Fill",
    none: "Original Ratio",
  };
  return labels[mode] || mode;
}

// ─── THUMBNAIL ────────────────────────────────────────────────────────────

export interface ThumbnailConfig {
  enabled: boolean;
  mode: ThumbnailMode;
  offsetSeconds: number;
  quality: number;
  width: number;
  height: number;
}

export function getThumbnailConfig(): ThumbnailConfig {
  const enabled = (process.env.THUMBNAIL_ENABLED || "true").toLowerCase().trim() !== "false";
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

export function resolveThumbnailEnabled(userValue: boolean | null | undefined): boolean {
  if (userValue != null) return userValue;
  return getThumbnailConfig().enabled;
}

export function resolveThumbnailMode(userValue: string | null | undefined): ThumbnailMode {
  if (userValue) {
    const valid: ThumbnailMode[] = ["middle", "best", "start", "custom"];
    if (valid.includes(userValue as ThumbnailMode)) return userValue as ThumbnailMode;
  }
  return getThumbnailConfig().mode;
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

// ─── WATERMARK ────────────────────────────────────────────────────────────

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
  const enabled = (process.env.WATERMARK_ENABLED || "true").toLowerCase().trim() !== "false";
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

/** Merge env defaults with per-user overrides */
export function resolveWatermarkConfig(user: {
  watermarkEnabled?: boolean | null;
  watermarkText?: string | null;
  watermarkPosition?: string | null;
  watermarkFontSize?: number | null;
  watermarkColor?: string | null;
  watermarkOpacity?: number | null;
  watermarkBox?: boolean | null;
}): WatermarkConfig {
  const global = getWatermarkConfig();
  const validPositions: WatermarkPosition[] = ["topleft", "topright", "bottomleft", "bottomright", "center"];
  return {
    ...global,
    enabled: user.watermarkEnabled ?? global.enabled,
    text: user.watermarkText ?? global.text,
    position: (user.watermarkPosition && validPositions.includes(user.watermarkPosition as WatermarkPosition))
      ? (user.watermarkPosition as WatermarkPosition)
      : global.position,
    fontSize: user.watermarkFontSize ?? global.fontSize,
    color: user.watermarkColor ?? global.color,
    opacity: user.watermarkOpacity ?? global.opacity,
    box: user.watermarkBox ?? global.box,
  };
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

// ─── INTRO / OUTRO ────────────────────────────────────────────────────────

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
  const introEnabled = (process.env.INTRO_ENABLED || "false").toLowerCase().trim() === "true";
  const introVideoPath = process.env.INTRO_VIDEO_PATH || "";
  const introDuration = Math.max(1, Math.min(30, parseFloat(process.env.INTRO_DURATION || "3") || 3));
  const introText = process.env.INTRO_TEXT || "AutoClip Bot";
  const introColor = process.env.INTRO_COLOR || "#000000";
  const outroEnabled = (process.env.OUTRO_ENABLED || "false").toLowerCase().trim() === "true";
  const outroVideoPath = process.env.OUTRO_VIDEO_PATH || "";
  const outroDuration = Math.max(1, Math.min(30, parseFloat(process.env.OUTRO_DURATION || "3") || 3));
  const outroText = process.env.OUTRO_TEXT || "Subscribe! 🔔";
  const outroColor = process.env.OUTRO_COLOR || "#000000";
  return {
    introEnabled, introVideoPath, introDuration, introText, introColor,
    outroEnabled, outroVideoPath, outroDuration, outroText, outroColor,
  };
}

export function resolveIntroOutroConfig(user: {
  introEnabled?: boolean | null;
  introText?: string | null;
  introDuration?: number | null;
  outroEnabled?: boolean | null;
  outroText?: string | null;
  outroDuration?: number | null;
}): IntroOutroConfig {
  const global = getIntroOutroConfig();
  return {
    ...global,
    introEnabled: user.introEnabled ?? global.introEnabled,
    introText: user.introText ?? global.introText,
    introDuration: user.introDuration ?? global.introDuration,
    outroEnabled: user.outroEnabled ?? global.outroEnabled,
    outroText: user.outroText ?? global.outroText,
    outroDuration: user.outroDuration ?? global.outroDuration,
  };
}

// ─── ZOOM EFFECT ─────────────────────────────────────────────────────────

export interface ZoomEffectConfig {
  enabled: boolean;
  mode: ZoomEffectMode;
  intensity: number;
  duration: number;
  minScore: number;
  type: ZoomEffectType;
}

export function getZoomEffectConfig(): ZoomEffectConfig {
  const enabled = (process.env.ZOOM_EFFECT_ENABLED || "true").toLowerCase().trim() !== "false";
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

export function resolveZoomEffectConfig(user: {
  zoomEnabled?: boolean | null;
  zoomMode?: string | null;
  zoomType?: string | null;
  zoomIntensity?: number | null;
  zoomMinScore?: number | null;
}): ZoomEffectConfig {
  const global = getZoomEffectConfig();
  const validModes: ZoomEffectMode[] = ["auto", "always", "never"];
  const validTypes: ZoomEffectType[] = ["in", "out", "in-out", "pulse"];
  return {
    ...global,
    enabled: user.zoomEnabled ?? global.enabled,
    mode: (user.zoomMode && validModes.includes(user.zoomMode as ZoomEffectMode))
      ? (user.zoomMode as ZoomEffectMode)
      : global.mode,
    type: (user.zoomType && validTypes.includes(user.zoomType as ZoomEffectType))
      ? (user.zoomType as ZoomEffectType)
      : global.type,
    intensity: user.zoomIntensity ?? global.intensity,
    minScore: user.zoomMinScore ?? global.minScore,
  };
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
