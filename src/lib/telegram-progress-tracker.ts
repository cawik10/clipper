/**
 * REAL-TIME TELEGRAM PROGRESS TRACKER
 * ====================================
 * Mengubah 1 pesan Telegram menjadi "live checklist" yang di-edit terus
 * menerus selama job berjalan, sehingga user melihat update step-by-step
 * (download → transkripsi → analisis → clip → upload → selesai) alih-alih
 * cuma notifikasi "selesai/gagal" di akhir.
 *
 * Fitur ini murni tambahan — tidak menyentuh tabel/kolom yang dipakai
 * dashboard web (clip_jobs, user_settings, dst). Riwayat step disimpan di
 * tabel baru `job_progress_events` (lihat src/db/schema.ts).
 *
 * Tampilan & daftar step bisa diubah tanpa menyentuh file ini — lihat
 * src/lib/progress-config.ts.
 */
import type { Api } from "grammy";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { jobProgressEvents } from "@/db/schema";
import {
  PROGRESS_STEPS,
  StepState,
  StepStatus,
  getProgressMinIntervalMs,
  isProgressTrackingEnabled,
  renderProgressMessage,
} from "@/lib/progress-config";

export interface ProgressTrackerOptions {
  api: Api;
  chatId: number;
  jobId: string;
  /** Judul singkat ditampilkan di header pesan, misal "📺 YOUTUBE". */
  title: string;
  /** Baris opsional kedua, misal link sumber video (dipotong otomatis). */
  jobLabel?: string;
}

type EditExtra = { reply_markup?: unknown };

// Sama seperti pola `ensureDriveTable()` di drive-uploader.ts — membuat tabel
// otomatis saat runtime kalau belum ada (misal baru deploy di Railway dan
// belum sempat menjalankan `drizzle-kit push`). Idempotent & aman dipanggil
// berkali-kali secara bersamaan.
let tableReady: Promise<void> | null = null;
function ensureJobProgressEventsTable(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS job_progress_events (
          id serial PRIMARY KEY,
          job_id text NOT NULL,
          step_id text NOT NULL,
          step_label text NOT NULL,
          state text NOT NULL,
          message text,
          percent integer,
          created_at timestamp NOT NULL DEFAULT now()
        )
      `);
    })().catch((err) => {
      tableReady = null;
      throw err;
    });
  }
  return tableReady;
}

export class TelegramProgressTracker {
  private api: Api;
  private chatId: number;
  private jobId: string;
  private title: string;
  private jobLabel?: string;
  private steps: Map<string, StepState>;
  private order: string[];
  private messageId: number | null = null;
  private startedAt = Date.now();
  private lastEditAt = 0;
  private lastText = "";
  private finished = false;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  private enabled: boolean;

  constructor(opts: ProgressTrackerOptions) {
    this.api = opts.api;
    this.chatId = opts.chatId;
    this.jobId = opts.jobId;
    this.title = opts.title;
    this.jobLabel = opts.jobLabel;
    this.enabled = isProgressTrackingEnabled();
    this.order = PROGRESS_STEPS.map((s) => s.id);
    this.steps = new Map(
      PROGRESS_STEPS.map((s) => [
        s.id,
        { ...s, status: "pending" as StepStatus, detail: undefined, percent: undefined },
      ])
    );
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getMessageId(): number | null {
    return this.messageId;
  }

  /** Kirim pesan awal (semua step masih pending) dan simpan message_id untuk diedit. */
  async start(): Promise<number> {
    const text = this.enabled ? this.render() : `⏳ *Memproses...*`;
    const msg = await this.api.sendMessage(this.chatId, text, { parse_mode: "Markdown" });
    this.messageId = msg.message_id;
    this.lastText = text;
    return this.messageId;
  }

  private render(footerNote?: string): string {
    return renderProgressMessage({
      title: this.title,
      jobLabel: this.jobLabel,
      steps: [...this.steps.values()],
      startedAt: this.startedAt,
      footerNote,
    });
  }

  private async persist(step: StepState): Promise<void> {
    try {
      await ensureJobProgressEventsTable();
      await db.insert(jobProgressEvents).values({
        jobId: this.jobId,
        stepId: step.id,
        stepLabel: step.label,
        state: step.status,
        message: step.detail || null,
        percent: typeof step.percent === "number" ? Math.round(step.percent) : null,
      });
    } catch (err) {
      // Jangan sampai kegagalan logging menggagalkan proses job utama.
      console.error("[progress-tracker] gagal menyimpan event:", err);
    }
  }

  /**
   * Update sebuah step: step-step sebelumnya (sesuai urutan PROGRESS_STEPS)
   * otomatis ditandai selesai, step ini ditandai "active" (atau status lain
   * bila di-override lewat opts.status).
   */
  async update(
    stepId: string,
    opts: { detail?: string; percent?: number; status?: StepStatus } = {}
  ): Promise<void> {
    if (this.finished) return;

    let step = this.steps.get(stepId);
    if (!step) {
      // Step id belum terdaftar di konfigurasi — tetap ditampilkan agar
      // informasi tidak hilang (defensif terhadap step baru di job-processor).
      step = { id: stepId, label: opts.detail || stepId, icon: "🔹", status: "pending" };
      this.steps.set(stepId, step);
      this.order.push(stepId);
    }

    const idx = this.order.indexOf(stepId);
    if (idx >= 0) {
      for (let i = 0; i < idx; i++) {
        const prev = this.steps.get(this.order[i]);
        if (prev && prev.status !== "done" && prev.status !== "error") {
          prev.status = "done";
        }
      }
    }

    step.status = opts.status || "active";
    if (opts.detail) step.detail = opts.detail;
    if (typeof opts.percent === "number") {
      step.percent = Math.max(0, Math.min(100, Math.round(opts.percent)));
    }

    await this.persist(step);
    await this.scheduleFlush();
  }

  /** Tandai step yang sedang aktif (atau step pertama yang belum selesai) sebagai gagal. */
  async fail(message: string): Promise<void> {
    if (this.finished) return;
    const target =
      [...this.steps.values()].find((s) => s.status === "active") ||
      [...this.steps.values()].find((s) => s.status === "pending");
    if (target) {
      target.status = "error";
      target.detail = message;
      await this.persist(target);
    }
    await this.scheduleFlush();
  }

  private async scheduleFlush(): Promise<void> {
    if (!this.enabled) return;
    const now = Date.now();
    const minInterval = getProgressMinIntervalMs();
    const elapsed = now - this.lastEditAt;
    if (elapsed < minInterval) {
      if (this.pendingTimer) clearTimeout(this.pendingTimer);
      this.pendingTimer = setTimeout(() => {
        this.flush().catch(() => {});
      }, minInterval - elapsed);
      return;
    }
    await this.flush();
  }

  private async flush(forceText?: string): Promise<void> {
    if (!this.messageId) return;
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    const text = forceText ?? this.render();
    if (text === this.lastText) return;
    this.lastEditAt = Date.now();
    this.lastText = text;
    try {
      await this.api.editMessageText(this.chatId, this.messageId, text, { parse_mode: "Markdown" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("message is not modified")) {
        console.warn("[progress-tracker] gagal edit pesan:", msg);
      }
    }
  }

  /** Panggil saat job sukses: tandai semua step selesai & kunci pesan (tidak diedit lagi). */
  async finishSuccess(note?: string, extra?: EditExtra): Promise<void> {
    if (this.finished) return;
    for (const step of this.steps.values()) {
      if (step.status !== "error") step.status = "done";
    }
    this.finished = true;
    if (!this.enabled || !this.messageId) return;
    const text = this.render(note);
    this.lastEditAt = Date.now();
    this.lastText = text;
    try {
      await this.api.editMessageText(this.chatId, this.messageId, text, {
        parse_mode: "Markdown",
        ...(extra as object),
      });
    } catch {
      /* ignore */
    }
  }

  /** Panggil saat job gagal: tandai step yang sedang berjalan sebagai error & kunci pesan. */
  async finishError(errorMessage: string, extra?: EditExtra): Promise<void> {
    if (this.finished) {
      // Progress message sudah final (mis. sudah error sebelumnya) — tetap coba
      // lampirkan tombol retry di pesan yang sama supaya user bisa mengulang.
      if (this.messageId) {
        try {
          await this.api.editMessageText(this.chatId, this.messageId, this.render(`❌ ${errorMessage}`), {
            parse_mode: "Markdown",
            ...(extra as object),
          });
        } catch {
          /* ignore */
        }
      }
      return;
    }
    const target =
      [...this.steps.values()].find((s) => s.status === "active") ||
      [...this.steps.values()].find((s) => s.status === "pending");
    if (target) {
      target.status = "error";
      target.detail = errorMessage;
    }
    this.finished = true;
    if (!this.enabled || !this.messageId) return;
    const text = this.render(`❌ ${errorMessage}`);
    this.lastEditAt = Date.now();
    this.lastText = text;
    try {
      await this.api.editMessageText(this.chatId, this.messageId, text, {
        parse_mode: "Markdown",
        ...(extra as object),
      });
    } catch {
      /* ignore */
    }
  }
}
