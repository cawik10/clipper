/**
 * 🎯 CUSTOM NICHE PROMPT
 * ======================
 * Fitur baru: user bisa mengatur prompt khusus untuk mengarahkan AI Analysis
 * saat memilih momen viral, misal:
 *   - "fokus ke momen lucu"
 *   - "fokus ke insight bisnis"
 *   - "cari bagian yang paling emosional dan menyentuh"
 *
 * Prompt ini disimpan per-akun Telegram di kolom `user_settings.niche_prompt`
 * (lihat src/db/schema.ts) dan dipakai oleh src/lib/ai-analyzer.ts saat
 * membangun instruksi ke GPT-4o-mini / Gemini.
 *
 * 👉 SEMUANYA DI FILE INI MUDAH DIUBAH TANPA MENYENTUH BAGIAN LAIN APLIKASI:
 *    - Ubah `DEFAULT_NICHE_PROMPT_FALLBACK` untuk default bawaan.
 *    - Ubah `MAX_NICHE_PROMPT_LENGTH` untuk batas panjang teks.
 *    - Tambah/kurangi `NICHE_PRESETS` untuk preset tombol cepat di Telegram
 *      (/niche) maupun referensi di dashboard web.
 *
 * Cara user mengatur (tidak mengubah UI dashboard yang sudah ada):
 *   - Telegram: kirim `/niche fokus ke momen lucu`
 *   - Telegram: tekan salah satu tombol preset di menu `/niche`
 *   - Reset ke default: `/niche reset` atau `/niche off`
 *   - API: `PATCH /api/settings` body `{ telegramUserId, nichePrompt }`
 *
 * Admin juga bisa set default global (berlaku untuk semua user baru yang
 * belum punya prompt sendiri) lewat Railway Variables:
 *   DEFAULT_NICHE_PROMPT="fokus ke insight bisnis"
 */

/** Batas panjang karakter niche prompt agar tetap ringkas & aman untuk prompt AI. */
export const MAX_NICHE_PROMPT_LENGTH = 300;

/** Fallback bawaan kalau DEFAULT_NICHE_PROMPT tidak diset sama sekali (boleh dikosongkan). */
const DEFAULT_NICHE_PROMPT_FALLBACK = "";

/**
 * Preset niche yang ditampilkan sebagai tombol cepat di Telegram (/niche)
 * dan sebagai contoh di dashboard web. Tinggal tambah/ubah/hapus item di
 * array ini — otomatis muncul di semua tempat yang memakainya.
 */
export const NICHE_PRESETS: { emoji: string; label: string; prompt: string }[] = [
  { emoji: "😂", label: "Momen Lucu", prompt: "Fokus ke momen lucu, kocak, atau komedi yang bikin orang ketawa." },
  { emoji: "💼", label: "Insight Bisnis", prompt: "Fokus ke insight bisnis, strategi, atau tips finansial yang actionable." },
  { emoji: "🔥", label: "Drama & Konflik", prompt: "Fokus ke momen dramatis, kontroversial, atau konflik yang memancing diskusi." },
  { emoji: "💡", label: "Edukasi & Tips", prompt: "Fokus ke penjelasan edukatif, fakta menarik, atau tips praktis yang mudah dipahami." },
  { emoji: "💪", label: "Motivasi", prompt: "Fokus ke momen motivasi, kata-kata penyemangat, atau kisah inspiratif." },
  { emoji: "😮", label: "Plot Twist", prompt: "Fokus ke momen mengejutkan, reveal tak terduga, atau plot twist." },
];

/** Ambil default niche prompt global dari Railway Variables (opsional). */
export function getDefaultNichePrompt(): string {
  const raw = process.env.DEFAULT_NICHE_PROMPT;
  return sanitizeNichePrompt(raw) ?? DEFAULT_NICHE_PROMPT_FALLBACK;
}

/** Bersihkan & validasi input niche prompt dari user. Return null kalau kosong. */
export function sanitizeNichePrompt(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^(reset|off|default|hapus|matikan)$/i.test(trimmed)) return null;
  return trimmed.slice(0, MAX_NICHE_PROMPT_LENGTH);
}

/**
 * Bangun potongan instruksi untuk disisipkan ke prompt AI Analysis.
 * Kembalikan string kosong kalau tidak ada niche prompt yang aktif.
 */
export function buildNicheInstruction(nichePrompt: string | null | undefined): string {
  const effective = sanitizeNichePrompt(nichePrompt ?? null) ?? sanitizeNichePrompt(getDefaultNichePrompt());
  if (!effective) return "";
  return (
    `\nARAHAN NICHE KHUSUS DARI USER (PRIORITAS UTAMA):\n"${effective}"\n` +
    `Gunakan arahan ini sebagai prioritas utama saat memilih momen — tetap pilih momen yang ` +
    `paling sesuai dengan fokus/niche di atas, bukan sekadar momen viral secara umum.\n`
  );
}

/** Label singkat untuk ditampilkan di Telegram/dashboard. */
export function getNichePromptLabel(nichePrompt: string | null | undefined): string {
  const sanitized = sanitizeNichePrompt(nichePrompt ?? null);
  if (sanitized) return sanitized;
  const fallback = sanitizeNichePrompt(getDefaultNichePrompt());
  return fallback ? `${fallback} (default)` : "Belum diatur — AI memilih momen paling viral secara umum";
}
