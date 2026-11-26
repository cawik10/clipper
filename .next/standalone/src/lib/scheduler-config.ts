/**
 * 🗓️ SCHEDULER / QUEUE POSTING — KONFIGURASI
 * ============================================
 * SATU-SATUNYA tempat yang perlu diubah untuk mengatur perilaku fitur
 * penjadwalan upload YouTube (Scheduler / Queue Posting). Tidak ada bagian
 * dashboard web lama (src/app/page.tsx) yang bergantung pada file ini —
 * fitur ini 100% tambahan baru.
 *
 * =====================================================================
 * ENV VARIABLES (atur di Railway → Variables, tanpa redeploy kode)
 * =====================================================================
 * SCHEDULER_ENABLED=true            ← Nyalakan/matikan seluruh fitur.
 *                                      false = tombol scheduler tidak
 *                                      muncul, alur kembali seperti lama
 *                                      (langsung upload setelah clip).
 * SCHEDULER_POLL_INTERVAL_MS=60000  ← Seberapa sering worker mengecek
 *                                      jadwal yang sudah jatuh tempo.
 * SCHEDULER_TIMEZONE=Asia/Jakarta   ← Timezone yang dipakai untuk
 *                                      menampilkan & menghitung jam
 *                                      rekomendasi/custom.
 * SCHEDULER_MAX_DAYS_AHEAD=7        ← Batas maksimum berapa hari ke depan
 *                                      user boleh menjadwalkan upload.
 * SCHEDULER_SLOT_COUNT=3            ← Jumlah pilihan jam yang ditawarkan
 *                                      saat user memilih "Rekomendasi AI".
 *
 * =====================================================================
 * REKOMENDASI JAM OPTIMAL BERDASARKAN NICHE
 * =====================================================================
 * 👉 Tambah/ubah/hapus item di `NICHE_OPTIMAL_HOURS` untuk mengatur jam
 *    "default" (fallback) per niche — dipakai kalau OPENAI_API_KEY /
 *    GEMINI_API_KEY tidak diset, atau kalau panggilan AI gagal.
 *    Jika salah satu API key di atas tersedia, `getOptimalPostingHours()`
 *    di src/lib/scheduler.ts akan mencoba meminta AI untuk memberi jam
 *    yang lebih spesifik berdasarkan teks niche prompt milik user — hasil
 *    AI tetap divalidasi & dibatasi ke jam 0-23 sebelum dipakai.
 */

export function isSchedulerEnabled(): boolean {
  const raw = (process.env.SCHEDULER_ENABLED || "true").toLowerCase().trim();
  return raw !== "false" && raw !== "0" && raw !== "off";
}

export function getSchedulerPollIntervalMs(): number {
  const raw = parseInt(process.env.SCHEDULER_POLL_INTERVAL_MS || "", 10);
  if (!isNaN(raw) && raw >= 10_000 && raw <= 3_600_000) return raw;
  return 60_000; // 1 menit
}

export function getSchedulerTimezone(): string {
  return (process.env.SCHEDULER_TIMEZONE || "Asia/Jakarta").trim();
}

export function getSchedulerMaxDaysAhead(): number {
  const raw = parseInt(process.env.SCHEDULER_MAX_DAYS_AHEAD || "", 10);
  if (!isNaN(raw) && raw >= 1 && raw <= 30) return raw;
  return 7;
}

export function getSchedulerSlotCount(): number {
  const raw = parseInt(process.env.SCHEDULER_SLOT_COUNT || "", 10);
  if (!isNaN(raw) && raw >= 1 && raw <= 6) return raw;
  return 3;
}

/**
 * 👉 DAFTAR JAM OPTIMAL (fallback) PER NICHE — EDIT DI SINI.
 * `keywords` dicocokkan (case-insensitive, substring) terhadap niche
 * prompt milik user (src/lib/niche-prompt.ts) atau judul video. Item
 * pertama yang cocok akan dipakai. Urutan array = prioritas pencocokan.
 */
export const NICHE_OPTIMAL_HOURS: { keywords: string[]; hours: number[]; label: string }[] = [
  { keywords: ["lucu", "komedi", "kocak", "hiburan", "comedy", "entertainment"], hours: [12, 19, 21], label: "Hiburan & Komedi" },
  { keywords: ["bisnis", "finansial", "finance", "invest", "uang", "cuan"], hours: [7, 12, 20], label: "Bisnis & Finansial" },
  { keywords: ["edukasi", "belajar", "tips", "tutorial", "education", "sains"], hours: [9, 15, 20], label: "Edukasi & Tips" },
  { keywords: ["game", "gaming", "esport"], hours: [16, 20, 22], label: "Gaming" },
  { keywords: ["motivasi", "inspirasi", "motivation"], hours: [6, 12, 21], label: "Motivasi" },
  { keywords: ["drama", "konflik", "gosip", "viral", "kontroversi"], hours: [13, 19, 21], label: "Drama & Gosip" },
  { keywords: ["kuliner", "makanan", "masak", "food", "resep"], hours: [11, 18, 20], label: "Kuliner" },
  { keywords: ["fashion", "beauty", "kecantikan", "ootd", "skincare"], hours: [10, 15, 19], label: "Fashion & Kecantikan" },
  { keywords: ["olahraga", "sport", "fitness", "gym"], hours: [6, 17, 20], label: "Olahraga & Fitness" },
  { keywords: ["musik", "music", "lagu"], hours: [14, 18, 21], label: "Musik" },
];

/** Jam optimal umum (default) kalau niche tidak dikenali / belum diatur. */
export const DEFAULT_OPTIMAL_HOURS = [9, 12, 19];

/** Cari preset jam optimal berdasarkan teks niche (nichePrompt / judul video). */
export function matchNicheOptimalHours(nicheText: string | null | undefined): {
  hours: number[];
  label: string;
} {
  const text = (nicheText || "").toLowerCase();
  if (text.trim()) {
    for (const preset of NICHE_OPTIMAL_HOURS) {
      if (preset.keywords.some((kw) => text.includes(kw))) {
        return { hours: preset.hours, label: preset.label };
      }
    }
  }
  return { hours: DEFAULT_OPTIMAL_HOURS, label: "Umum (General Audience)" };
}
