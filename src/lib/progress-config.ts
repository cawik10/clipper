/**
 * REAL-TIME TELEGRAM PROGRESS CONFIGURATION
 * ==========================================
 * File ini adalah SATU-SATUNYA tempat yang perlu diubah untuk mengatur
 * tampilan "progress job step-by-step" yang dikirim bot ke Telegram.
 * Tidak ada bagian dashboard web (src/app/page.tsx) yang bergantung pada
 * file ini — fitur ini 100% tambahan baru untuk pengalaman di Telegram.
 *
 * =====================================================================
 * CARA MENGUBAH LANGKAH (STEP) YANG DITAMPILKAN
 * =====================================================================
 * Edit array `PROGRESS_STEPS` di bawah. Setiap job akan menampilkan
 * checklist sesuai urutan array ini. Tambah/kurangi/ubah label & ikon
 * sesuka hati — seluruh aplikasi (job-processor & telegram-bot) otomatis
 * mengikuti karena mereka memanggil step berdasarkan `id`.
 *
 * =====================================================================
 * ENV VARIABLES (atur di Railway → Variables, tanpa redeploy kode)
 * =====================================================================
 * TELEGRAM_PROGRESS_ENABLED=true     ← Nyalakan/matikan fitur ini.
 *                                       false = kembali ke 1 baris status
 *                                       biasa (perilaku versi lama).
 * TELEGRAM_PROGRESS_STYLE=checklist  ← checklist | compact
 *                                       checklist = daftar step lengkap
 *                                       compact   = 1 baris status + bar
 * TELEGRAM_PROGRESS_MIN_INTERVAL_MS=1500
 *                                     ← Jeda minimum antar edit pesan
 *                                       Telegram (hindari rate-limit).
 * TELEGRAM_PROGRESS_SHOW_BAR=true    ← Tampilkan progress bar keseluruhan.
 * TELEGRAM_PROGRESS_SHOW_ELAPSED=true← Tampilkan waktu berjalan (mm:ss).
 */

export type StepStatus = "pending" | "active" | "done" | "error";

export interface ProgressStepDefinition {
  /** ID unik step — dipakai job-processor.ts & telegram-bot.ts untuk merujuk step ini. */
  id: string;
  /** Label yang tampil di Telegram. */
  label: string;
  /** Emoji ikon di depan label. */
  icon: string;
}

export interface StepState extends ProgressStepDefinition {
  status: StepStatus;
  detail?: string;
  percent?: number;
}

/**
 * 👉 DAFTAR STEP JOB — EDIT DI SINI UNTUK MENAMBAH/MENGURANGI/MENGUBAH STEP.
 * Urutan array = urutan tampilan checklist.
 */
export const PROGRESS_STEPS: ProgressStepDefinition[] = [
  { id: "downloading", label: "Download video", icon: "⬇️" },
  { id: "transcribing", label: "Transkripsi audio", icon: "🎙️" },
  { id: "analyzing", label: "Analisis momen viral (AI)", icon: "🧠" },
  { id: "clipping", label: "Potong & edit klip", icon: "✂️" },
  { id: "uploading_youtube", label: "Upload ke YouTube", icon: "📤" },
  { id: "uploading_drive", label: "Upload ke Google Drive", icon: "☁️" },
  { id: "done", label: "Selesai", icon: "🎉" },
];

export function isProgressTrackingEnabled(): boolean {
  const raw = (process.env.TELEGRAM_PROGRESS_ENABLED || "true").toLowerCase().trim();
  return raw !== "false" && raw !== "0" && raw !== "off";
}

export type ProgressStyle = "checklist" | "compact";

export function getProgressStyle(): ProgressStyle {
  const raw = (process.env.TELEGRAM_PROGRESS_STYLE || "checklist").toLowerCase().trim();
  return raw === "compact" ? "compact" : "checklist";
}

export function getProgressMinIntervalMs(): number {
  const raw = process.env.TELEGRAM_PROGRESS_MIN_INTERVAL_MS;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  if (!isNaN(parsed) && parsed >= 300 && parsed <= 10000) return parsed;
  return 1500;
}

export function getProgressShowBar(): boolean {
  const raw = (process.env.TELEGRAM_PROGRESS_SHOW_BAR || "true").toLowerCase().trim();
  return raw !== "false" && raw !== "0" && raw !== "off";
}

export function getProgressShowElapsed(): boolean {
  const raw = (process.env.TELEGRAM_PROGRESS_SHOW_ELAPSED || "true").toLowerCase().trim();
  return raw !== "false" && raw !== "0" && raw !== "off";
}

function statusIcon(status: StepStatus): string {
  switch (status) {
    case "done":
      return "✅";
    case "active":
      return "⏳";
    case "error":
      return "❌";
    default:
      return "⬜";
  }
}

export function createBar(percent: number, length: number = 12): string {
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round((clamped / 100) * length);
  const empty = length - filled;
  return `[${"▓".repeat(filled)}${"░".repeat(empty)}]`;
}

export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/** Hitung persentase keseluruhan job berdasarkan step yang sudah selesai + progres step aktif. */
export function computeOverallPercent(steps: StepState[]): number {
  if (!steps.length) return 0;
  const total = steps.length;
  let completed = 0;
  for (const step of steps) {
    if (step.status === "done") completed += 1;
    else if (step.status === "active") completed += (step.percent ?? 0) / 100;
  }
  return Math.round((completed / total) * 100);
}

export interface RenderProgressInput {
  title: string;
  jobLabel?: string;
  steps: StepState[];
  startedAt: number;
  footerNote?: string;
}

/** Render checklist lengkap (gaya default). */
function renderChecklist(input: RenderProgressInput): string {
  const { title, jobLabel, steps, startedAt, footerNote } = input;
  const lines: string[] = [];

  lines.push(`🎬 *Progres Job* — ${title}`);
  if (jobLabel) lines.push(jobLabel);

  if (getProgressShowBar()) {
    const overall = computeOverallPercent(steps);
    lines.push(`${createBar(overall)} ${overall}%`);
  }

  lines.push("");

  for (const step of steps) {
    let line = `${statusIcon(step.status)} ${step.icon} ${step.label}`;
    if (step.status === "active" && typeof step.percent === "number") {
      line += ` — ${step.percent}%`;
    }
    lines.push(line);
    if (step.status === "active" && step.detail) {
      lines.push(`   ↳ ${step.detail}`);
    }
    if (step.status === "error" && step.detail) {
      lines.push(`   ↳ ⚠️ ${step.detail}`);
    }
  }

  if (getProgressShowElapsed()) {
    lines.push("");
    lines.push(`⏱ Berjalan ${formatElapsed(Date.now() - startedAt)}`);
  }

  if (footerNote) {
    lines.push("");
    lines.push(footerNote);
  }

  return lines.join("\n");
}

/** Render versi ringkas: 1 baris status aktif + progress bar keseluruhan. */
function renderCompact(input: RenderProgressInput): string {
  const { title, steps, startedAt, footerNote } = input;
  const active = steps.find((s) => s.status === "active") || steps.find((s) => s.status === "error");
  const overall = computeOverallPercent(steps);
  const lines: string[] = [];
  lines.push(`🎬 *${title}*`);
  if (active) {
    lines.push(`${statusIcon(active.status)} ${active.icon} ${active.label}${active.detail ? ` — ${active.detail}` : ""}`);
  }
  lines.push(`${createBar(overall)} ${overall}%`);
  if (getProgressShowElapsed()) {
    lines.push(`⏱ ${formatElapsed(Date.now() - startedAt)}`);
  }
  if (footerNote) lines.push(footerNote);
  return lines.join("\n");
}

export function renderProgressMessage(input: RenderProgressInput): string {
  return getProgressStyle() === "compact" ? renderCompact(input) : renderChecklist(input);
}
