/**
 * 🎞️ FORMAT TRANSFORMATIF — teks info untuk Telegram (`/transform`)
 * Hanya membaca konfigurasi (env var TRANSFORM_*, lihat src/lib/transform-config.ts).
 * Mengubah nilai dilakukan di Railway → Variables, sama seperti fitur lain.
 */
import {
  getTransformConfig,
  getFrameLabel,
  getCommentaryHeader,
  describeSplitVisual,
  resolveCommentaryStart,
  TRANSFORM_MODES,
  TRANSFORM_MODE_INFO,
  COMMENTARY_STYLES,
  COMMENTARY_STYLE_PRESETS,
} from "@/lib/transform-config";

const code = (v: string | number | boolean) => `\`${v}\``;

export function buildTransformInfoMessage(): string {
  const cfg = getTransformConfig();
  const on = (b: boolean) => (b ? "✅ Aktif" : "⚪ Tidak dipilih");
  const preset = COMMENTARY_STYLE_PRESETS[cfg.commentary.style];

  let msg =
    `🎞️ *Format Transformatif (anti reused content):*\n\n` +
    `Status: ${cfg.enabled ? "✅ Aktif" : "❌ Nonaktif (TRANSFORM\\_ENABLED=false)"}\n` +
    `Mode: ${cfg.modes.map((m) => code(m)).join(", ")}\n\n` +
    `*Komponen:*\n` +
    TRANSFORM_MODES.map((m) => {
      const active = m === "split-screen" ? cfg.splitActive : m === "commentary" ? cfg.commentaryActive : cfg.frameActive;
      return `• *${TRANSFORM_MODE_INFO[m].label}* — ${on(active)}\n   ${TRANSFORM_MODE_INFO[m].description}`;
    }).join("\n") +
    `\n\n`;

  msg +=
    `*Split-Screen:* klip ${cfg.split.clipPosition === "top" ? "atas" : "bawah"} ${Math.round(cfg.split.ratio * 100)}%, ` +
    `visual: ${describeSplitVisual(cfg.split.visual)}\n` +
    `*Komentar AI:* style ${code(cfg.commentary.style)} (${preset.label}), kartu "${getCommentaryHeader(cfg)}" ` +
    `tampil detik ${resolveCommentaryStart(cfg)}–${(resolveCommentaryStart(cfg) + cfg.commentary.duration).toFixed(1)}\n` +
    `*Frame:* label "${getFrameLabel(cfg)}" (${cfg.frame.style}, ${cfg.frame.position}), bingkai ${cfg.frame.border}px\n\n`;

  msg +=
    `*Style komentar tersedia:*\n` +
    COMMENTARY_STYLES.map((s) => `• ${code(s)} → ${COMMENTARY_STYLE_PRESETS[s].description}`).join("\n") +
    `\n\n*Cara Ubah (Railway Variables):*\n` +
    `• ${code("TRANSFORM_ENABLED")} = ${code("true")} / ${code("false")}\n` +
    `• ${code("TRANSFORM_MODE")} = ${code("split-screen,commentary,frame")} (atau ${code("all")})\n` +
    `• ${code("TRANSFORM_COMMENTARY_STYLE")} = ${COMMENTARY_STYLES.map((s) => code(s)).join(" | ")}\n` +
    `• ${code("TRANSFORM_FRAME_LABEL")} = ${code("auto")} / ${code("reaksi")} / ${code("rangkuman")} / teks bebas\n` +
    `• ${code("TRANSFORM_SPLIT_VISUAL")} = ${code("gradient")} / ${code("blur")} / URL .mp4 (boleh banyak, pisah koma)\n` +
    `• ${code("TRANSFORM_SPLIT_RATIO")} = ${code("0.55")} (0.4–0.7)\n` +
    `• ${code("TRANSFORM_ACCENT_COLOR")} = ${code("#FFC107")}\n\n` +
    `ℹ️ Komentar dibuat AI bersamaan dengan analisis momen (tanpa biaya panggilan tambahan), dirender via FFmpeg, ` +
    `dan ikut ditambahkan ke deskripsi video. Kalau gagal, klip tetap diproses normal.\n` +
    `⚠️ Ini membantu mengurangi risiko reused content, bukan jaminan monetisasi.`;

  return msg;
}
