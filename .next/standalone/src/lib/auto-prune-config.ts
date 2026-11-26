/**
 * ✂️ AUTO-PRUNE KLIP GAGAL — KONFIGURASI (FITUR BARU! bagian dari AI Analytics Loop)
 * =====================================================================
 * Klip yang sudah tayang LEBIH DARI 14 HARI, views-nya masih DI BAWAH 50, dan
 * sudah pernah di-retitle oleh Auto-Title Doctor minimal 1x → bot MENGUSULKAN
 * untuk disembunyikan atau dihapus. Channel yang penuh klip sepi bisa menurunkan
 * performa distribusi, jadi klip-klip itu perlu dirapikan.
 *
 * 🧑‍⚖️ BOT HANYA MEMBERI USULAN. Tidak ada video yang disembunyikan/dihapus
 *    sebelum kamu menekan tombol di Telegram:
 *        [🙈 Sembunyikan]  [🗑 Hapus]  [✅ Pertahankan]
 *
 * 👉 SEMUANYA MUDAH DIGANTI lewat Railway Variables (tanpa menyentuh kode):
 *
 *   AUTO_PRUNE_ENABLED=true                 // SAKLAR UTAMA (default: true — aman, hanya memberi usulan)
 *   AUTO_PRUNE_MIN_AGE_DAYS=14              // klip dianggap "gagal" setelah tayang N hari
 *   AUTO_PRUNE_VIEWS_THRESHOLD=50           // views di bawah angka ini = sepi
 *   AUTO_PRUNE_MIN_RETITLES=1               // minimal sudah di-retitle N kali (0 = tidak wajib retitle)
 *   AUTO_PRUNE_RETITLE_GRACE_DAYS=3         // beri waktu N hari setelah retitle terakhir sebelum dinilai gagal
 *   AUTO_PRUNE_ACTIONS=hide,delete          // tombol yang ditawarkan: hide, delete (atau salah satunya)
 *   AUTO_PRUNE_HIDE_TO=private              // "sembunyikan" = ubah privasi ke: private | unlisted
 *   AUTO_PRUNE_DELETE_CONFIRM=true          // hapus butuh konfirmasi tombol kedua
 *   AUTO_PRUNE_PRIVACY=public,unlisted      // hanya usulkan video dengan privasi ini (yang private dianggap sudah tersembunyi)
 *   AUTO_PRUNE_MAX_PER_NOTIFY=5             // maks klip per notifikasi per siklus (hindari spam)
 *   AUTO_PRUNE_NOTIFY=true                  // kirim usulan ke Telegram
 *   AUTO_PRUNE_REMINDER_DAYS=0              // ingatkan lagi usulan yang belum diputuskan tiap N hari (0 = tidak)
 *   AUTO_PRUNE_KEEP_SNOOZE_DAYS=0           // klip yang "Dipertahankan" boleh diusulkan lagi setelah N hari (0 = tidak pernah)
 *   AUTO_PRUNE_MAX_STALE_HOURS=48           // views harus disinkron dalam N jam terakhir (data basi diabaikan)
 *   AUTO_PRUNE_REQUEST_SCOPE=true           // minta izin edit video (youtube.force-ssl) saat /connect
 *
 * 🔑 PENTING: menyembunyikan (videos.update) & menghapus (videos.delete) butuh
 *    izin `youtube.force-ssl` — sama dengan Auto-Title Doctor. Kalau akun
 *    sudah /connect setelah Auto-Title Doctor aktif, tidak perlu apa-apa lagi.
 *    Kalau belum, kirim /connect sekali lagi.
 *
 * Teks pesan Telegram ada di konstanta paling bawah file ini.
 */

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return !/^(false|0|off|no|nonaktif)$/i.test(raw.trim());
}

function envInt(name: string, fallback: number, min: number, max: number): number {
  const n = parseInt(process.env[name] || "", 10);
  if (!isNaN(n) && n >= min && n <= max) return n;
  return fallback;
}

function envList(name: string, fallback: string[], allowed: string[]): string[] {
  const list = (process.env[name] || "")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter((s) => allowed.includes(s));
  return list.length ? Array.from(new Set(list)) : fallback;
}

// ─── FLAG ────────────────────────────────────────────────────────────────

/** Saklar utama. Default NYALA karena bot hanya memberi usulan (tidak mengubah apa pun otomatis). */
export function isAutoPruneEnabled(): boolean {
  return envBool("AUTO_PRUNE_ENABLED", true);
}

export function isPruneNotifyEnabled(): boolean {
  return envBool("AUTO_PRUNE_NOTIFY", true);
}

export function isPruneDeleteConfirmRequired(): boolean {
  return envBool("AUTO_PRUNE_DELETE_CONFIRM", true);
}

/** Minta scope `youtube.force-ssl` saat /connect (hanya kalau fitur menyala). */
export function shouldRequestPruneScope(): boolean {
  return isAutoPruneEnabled() && envBool("AUTO_PRUNE_REQUEST_SCOPE", true);
}

// ─── KRITERIA ────────────────────────────────────────────────────────────

export function getPruneMinAgeDays(): number {
  return envInt("AUTO_PRUNE_MIN_AGE_DAYS", 14, 1, 3650);
}

export function getPruneViewsThreshold(): number {
  return envInt("AUTO_PRUNE_VIEWS_THRESHOLD", 50, 1, 100_000_000);
}

export function getPruneMinRetitles(): number {
  return envInt("AUTO_PRUNE_MIN_RETITLES", 1, 0, 10);
}

export function getPruneRetitleGraceDays(): number {
  return envInt("AUTO_PRUNE_RETITLE_GRACE_DAYS", 3, 0, 365);
}

export function getPruneMaxStaleHours(): number {
  return envInt("AUTO_PRUNE_MAX_STALE_HOURS", 48, 1, 24 * 30);
}

/** Status privasi video yang boleh diusulkan. */
export function getPruneAllowedPrivacy(): string[] {
  return envList("AUTO_PRUNE_PRIVACY", ["public", "unlisted"], ["public", "unlisted", "private"]);
}

// ─── AKSI ────────────────────────────────────────────────────────────────

export type PruneAction = "hide" | "delete";

export function getPruneActions(): PruneAction[] {
  return envList("AUTO_PRUNE_ACTIONS", ["hide", "delete"], ["hide", "delete"]) as PruneAction[];
}

export function getPruneHideTo(): "private" | "unlisted" {
  const raw = (process.env.AUTO_PRUNE_HIDE_TO || "").trim().toLowerCase();
  return raw === "unlisted" ? "unlisted" : "private";
}

// ─── NOTIFIKASI ──────────────────────────────────────────────────────────

export function getPruneMaxPerNotify(): number {
  return envInt("AUTO_PRUNE_MAX_PER_NOTIFY", 5, 1, 20);
}

export function getPruneReminderDays(): number {
  return envInt("AUTO_PRUNE_REMINDER_DAYS", 0, 0, 365);
}

export function getPruneKeepSnoozeDays(): number {
  return envInt("AUTO_PRUNE_KEEP_SNOOZE_DAYS", 0, 0, 3650);
}

/** Ringkasan kriteria untuk ditampilkan ke user. */
export function describePruneRules(): string {
  const retitle = getPruneMinRetitles();
  return (
    `tayang > ${getPruneMinAgeDays()} hari, views < ${getPruneViewsThreshold().toLocaleString("id-ID")}` +
    (retitle > 0 ? `, sudah di-retitle ≥ ${retitle}x` : "") +
    `, video: ${getPruneAllowedPrivacy().join("/")}`
  );
}

// ─── KONSTANTA (ubah di sini kalau perlu) ────────────────────────────────

/** Scope Google yang cukup untuk `videos.update` & `videos.delete`. */
export const PRUNE_REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/youtube.force-ssl",
  "https://www.googleapis.com/auth/youtube",
];
export const PRUNE_SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl";

/** Teks pesan Telegram — ganti kata-katanya di sini. */
export const PRUNE_TEXT = {
  header: "✂️ <b>Auto-Prune Klip Gagal</b>",
  headerHint:
    "Klip di bawah ini sudah lama tayang, views-nya masih sepi, dan sudah dicoba diperbaiki judulnya. " +
    "Channel dengan banyak klip sepi bisa menurunkan performa distribusi.\n<i>Kamu yang memutuskan — tidak ada yang diubah tanpa tombolmu.</i>",
  hidden: "🙈 <b>Disembunyikan</b>",
  deleted: "🗑 <b>Dihapus dari YouTube</b>",
  kept: "✅ <b>Dipertahankan</b>",
  confirmDelete: "⚠️ <b>Yakin hapus permanen?</b> Video akan hilang dari YouTube dan tidak bisa dikembalikan.",
};
