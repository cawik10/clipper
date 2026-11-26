/**
 * GOOGLE DRIVE AUTO-UPLOAD
 * =====================================================================
 * Setelah klip selesai dibuat, file otomatis di-upload ke Google Drive
 * milik user (OAuth), mirip alur upload YouTube.
 *
 * SEMUA BISA DIGANTI TANPA UBAH KODE:
 *
 * Via Railway Variables (default global):
 *   GOOGLE_DRIVE_ENABLED=true            ← false = matikan fitur Drive total
 *   GOOGLE_DRIVE_FOLDER_ID=<id / link>   ← folder tujuan default (opsional)
 *   GOOGLE_DRIVE_FOLDER_NAME=AutoClip Shorts ← nama folder otomatis jika tidak ada folder
 *   GOOGLE_DRIVE_SUBFOLDER=false         ← true = buat subfolder per video sumber
 *   GOOGLE_DRIVE_UPLOAD_THUMBNAIL=true   ← ikut upload thumbnail (.jpg)
 *   GOOGLE_DRIVE_SHARE=none              ← none | anyone (link bisa dilihat siapa saja)
 *   GOOGLE_DRIVE_SCOPE=drive             ← drive (folder mana saja) | drive.file (hanya folder buatan bot)
 *   GOOGLE_DRIVE_REDIRECT_URI=...        ← opsional, default = GOOGLE_REDIRECT_URI
 *
 * Via Telegram (per akun):
 *   /drive                 ← status + tombol
 *   /drivefolder <link>    ← ganti folder tujuan
 *   /drivefolder reset     ← kembali ke folder default
 *   /driveon  /driveoff    ← nyalakan / matikan auto-upload
 *   /drivedisconnect       ← putuskan akun Google Drive (ganti akun = connect ulang)
 *
 * Prioritas folder tujuan:
 *   1) folder pilihan user (/drivefolder)
 *   2) env GOOGLE_DRIVE_FOLDER_ID
 *   3) folder otomatis "GOOGLE_DRIVE_FOLDER_NAME" (dibuat bot di My Drive)
 */

import { google, drive_v3 } from "googleapis";
import fs from "fs";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { driveTokens, DriveTokenRow, ClipResult } from "@/db/schema";

// ─── CONFIG ──────────────────────────────────────────────────────────────

function envBool(name: string, def: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return def;
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

export interface DriveConfig {
  enabled: boolean;
  folderId: string | null;
  folderName: string;
  subfolderPerJob: boolean;
  uploadThumbnail: boolean;
  share: "none" | "anyone";
  scope: string;
}

export function getDriveConfig(): DriveConfig {
  const scopeRaw = (process.env.GOOGLE_DRIVE_SCOPE || "drive").trim().toLowerCase();
  const shareRaw = (process.env.GOOGLE_DRIVE_SHARE || "none").trim().toLowerCase();
  return {
    enabled: envBool("GOOGLE_DRIVE_ENABLED", true),
    folderId: process.env.GOOGLE_DRIVE_FOLDER_ID
      ? parseDriveFolderId(process.env.GOOGLE_DRIVE_FOLDER_ID)
      : null,
    folderName: (process.env.GOOGLE_DRIVE_FOLDER_NAME || "AutoClip Shorts").trim(),
    subfolderPerJob: envBool("GOOGLE_DRIVE_SUBFOLDER", false),
    uploadThumbnail: envBool("GOOGLE_DRIVE_UPLOAD_THUMBNAIL", true),
    share: shareRaw === "anyone" ? "anyone" : "none",
    scope:
      scopeRaw === "drive.file"
        ? "https://www.googleapis.com/auth/drive.file"
        : "https://www.googleapis.com/auth/drive",
  };
}

export function isDriveConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && getRedirectUri());
}

function getRedirectUri(): string | undefined {
  return process.env.GOOGLE_DRIVE_REDIRECT_URI || process.env.GOOGLE_REDIRECT_URI;
}

/** Prefix state OAuth supaya callback YouTube yang sama bisa dipakai untuk Drive */
export const DRIVE_STATE_PREFIX = "drive:";

// ─── DB BOOTSTRAP ────────────────────────────────────────────────────────
// Tabel dibuat otomatis agar deploy di Railway tidak butuh migrasi manual.

let tableReady: Promise<void> | null = null;

export function ensureDriveTable(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS drive_tokens (
          id serial PRIMARY KEY,
          telegram_user_id text NOT NULL UNIQUE,
          access_token text NOT NULL,
          refresh_token text NOT NULL,
          expires_at timestamp NOT NULL,
          scope text,
          google_email text,
          folder_id text,
          folder_name text,
          auto_folder_id text,
          auto_upload boolean NOT NULL DEFAULT true,
          created_at timestamp NOT NULL DEFAULT now(),
          updated_at timestamp NOT NULL DEFAULT now()
        )
      `);
    })().catch((err) => {
      tableReady = null;
      throw err;
    });
  }
  return tableReady;
}

export async function getDriveRow(userId: string): Promise<DriveTokenRow | null> {
  await ensureDriveTable();
  const rows = await db.select().from(driveTokens).where(eq(driveTokens.telegramUserId, userId));
  return rows[0] ?? null;
}

// ─── OAUTH ───────────────────────────────────────────────────────────────

function newOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getRedirectUri()
  );
}

export function getDriveAuthUrl(userId: string): string {
  const client = newOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    scope: [getDriveConfig().scope],
    state: `${DRIVE_STATE_PREFIX}${userId}`,
    prompt: "consent",
  });
}

/** Tukar code OAuth → simpan token. Dipanggil dari route callback. */
export async function saveDriveConnection(code: string, userId: string): Promise<{ email: string | null }> {
  await ensureDriveTable();
  const client = newOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.access_token) throw new Error("Gagal mendapatkan token dari Google");

  const existing = await getDriveRow(userId);
  const refreshToken = tokens.refresh_token || existing?.refreshToken;
  if (!refreshToken) {
    throw new Error(
      "Google tidak memberi refresh token. Cabut akses app di myaccount.google.com/permissions lalu hubungkan ulang."
    );
  }

  client.setCredentials(tokens);
  let email: string | null = null;
  try {
    const drive = google.drive({ version: "v3", auth: client });
    const about = await drive.about.get({ fields: "user(emailAddress)" });
    email = about.data.user?.emailAddress ?? null;
  } catch {
    /* email hanya informasi tambahan */
  }

  const values = {
    accessToken: tokens.access_token,
    refreshToken,
    expiresAt: new Date(tokens.expiry_date || Date.now() + 3600_000),
    scope: tokens.scope || null,
    googleEmail: email,
    updatedAt: new Date(),
  };

  if (existing) {
    // Ganti akun → folder lama tidak berlaku lagi di akun baru
    const accountChanged = !!existing.googleEmail && !!email && existing.googleEmail !== email;
    await db
      .update(driveTokens)
      .set({
        ...values,
        ...(accountChanged ? { folderId: null, folderName: null, autoFolderId: null } : {}),
      })
      .where(eq(driveTokens.telegramUserId, userId));
  } else {
    await db.insert(driveTokens).values({ telegramUserId: userId, ...values });
  }
  return { email };
}

export async function disconnectDrive(userId: string): Promise<void> {
  await ensureDriveTable();
  const row = await getDriveRow(userId);
  if (row) {
    try {
      await newOAuthClient().revokeToken(row.refreshToken);
    } catch {
      /* abaikan, token mungkin sudah tidak valid */
    }
  }
  await db.delete(driveTokens).where(eq(driveTokens.telegramUserId, userId));
}

export async function setDriveAutoUpload(userId: string, autoUpload: boolean): Promise<void> {
  await ensureDriveTable();
  await db
    .update(driveTokens)
    .set({ autoUpload, updatedAt: new Date() })
    .where(eq(driveTokens.telegramUserId, userId));
}

async function getDriveClient(row: DriveTokenRow): Promise<drive_v3.Drive> {
  const client = newOAuthClient();
  client.setCredentials({
    access_token: row.accessToken,
    refresh_token: row.refreshToken,
    expiry_date: row.expiresAt.getTime(),
  });
  // Simpan token baru setiap kali googleapis auto-refresh
  client.on("tokens", (t) => {
    const patch: Partial<typeof driveTokens.$inferInsert> = { updatedAt: new Date() };
    if (t.access_token) patch.accessToken = t.access_token;
    if (t.expiry_date) patch.expiresAt = new Date(t.expiry_date);
    if (t.refresh_token) patch.refreshToken = t.refresh_token;
    db.update(driveTokens)
      .set(patch)
      .where(eq(driveTokens.telegramUserId, row.telegramUserId))
      .catch((e) => console.error("[drive] gagal simpan token baru:", e));
  });
  return google.drive({ version: "v3", auth: client });
}

// ─── FOLDER HELPERS ──────────────────────────────────────────────────────

/** Terima link folder Drive atau ID mentah → ID folder */
export function parseDriveFolderId(input: string): string {
  const v = input.trim();
  const byPath = v.match(/\/folders\/([A-Za-z0-9_-]+)/);
  if (byPath) return byPath[1];
  const byQuery = v.match(/[?&]id=([A-Za-z0-9_-]+)/);
  if (byQuery) return byQuery[1];
  return v;
}

export function driveFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}

function describeError(err: unknown): string {
  const e = err as { message?: string; code?: number; errors?: { message?: string }[] };
  const msg = e?.errors?.[0]?.message || e?.message || String(err);
  if (/invalid_grant/i.test(msg)) {
    return "Akses Google Drive kedaluwarsa/dicabut. Hubungkan ulang lewat /drive.";
  }
  if (/storageQuotaExceeded/i.test(msg)) return "Kuota Google Drive penuh.";
  if (/insufficient.*(scope|permission)/i.test(msg)) {
    return "Izin Drive kurang. Hubungkan ulang lewat /drive.";
  }
  return msg;
}

async function verifyFolder(
  drive: drive_v3.Drive,
  folderId: string
): Promise<{ id: string; name: string } | null> {
  try {
    const res = await drive.files.get({
      fileId: folderId,
      fields: "id,name,mimeType,trashed",
      supportsAllDrives: true,
    });
    const f = res.data;
    if (f.mimeType !== "application/vnd.google-apps.folder" || f.trashed) return null;
    return { id: f.id!, name: f.name || folderId };
  } catch {
    return null;
  }
}

/** Ganti folder tujuan user. Mengembalikan nama folder jika valid. */
export async function setDriveFolder(userId: string, input: string): Promise<{ id: string; name: string }> {
  const row = await getDriveRow(userId);
  if (!row) throw new Error("Google Drive belum terhubung. Gunakan /drive dulu.");
  const folderId = parseDriveFolderId(input);
  if (!/^[A-Za-z0-9_-]{10,}$/.test(folderId)) {
    throw new Error("Link/ID folder tidak valid.");
  }
  const drive = await getDriveClient(row);
  const folder = await verifyFolder(drive, folderId);
  if (!folder) {
    throw new Error(
      "Folder tidak ditemukan / tidak bisa diakses oleh akun yang terhubung." +
        (getDriveConfig().scope.endsWith("drive.file")
          ? " (Mode GOOGLE_DRIVE_SCOPE=drive.file hanya bisa memakai folder buatan bot — ganti ke `drive` untuk folder bebas.)"
          : "")
    );
  }
  await db
    .update(driveTokens)
    .set({ folderId: folder.id, folderName: folder.name, updatedAt: new Date() })
    .where(eq(driveTokens.telegramUserId, userId));
  return folder;
}

export async function resetDriveFolder(userId: string): Promise<void> {
  await ensureDriveTable();
  await db
    .update(driveTokens)
    .set({ folderId: null, folderName: null, updatedAt: new Date() })
    .where(eq(driveTokens.telegramUserId, userId));
}

async function createFolder(drive: drive_v3.Drive, name: string, parentId?: string) {
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      ...(parentId ? { parents: [parentId] } : {}),
    },
    fields: "id,name",
    supportsAllDrives: true,
  });
  return { id: res.data.id!, name: res.data.name || name };
}

/** Tentukan folder dasar sesuai prioritas. */
async function resolveBaseFolder(
  drive: drive_v3.Drive,
  row: DriveTokenRow,
  cfg: DriveConfig
): Promise<{ id: string; name: string; warning?: string }> {
  let warning: string | undefined;

  if (row.folderId) {
    const f = await verifyFolder(drive, row.folderId);
    if (f) return f;
    warning = `Folder pilihanmu (${row.folderName || row.folderId}) tidak bisa diakses, memakai folder default.`;
  }
  if (cfg.folderId) {
    const f = await verifyFolder(drive, cfg.folderId);
    if (f) return { ...f, warning };
    warning = `GOOGLE_DRIVE_FOLDER_ID tidak bisa diakses, memakai folder otomatis.`;
  }
  if (row.autoFolderId) {
    const f = await verifyFolder(drive, row.autoFolderId);
    if (f) return { ...f, warning };
  }
  const created = await createFolder(drive, cfg.folderName);
  await db
    .update(driveTokens)
    .set({ autoFolderId: created.id, updatedAt: new Date() })
    .where(eq(driveTokens.telegramUserId, row.telegramUserId));
  return { ...created, warning };
}

// ─── STATUS ──────────────────────────────────────────────────────────────

export interface DriveStatus {
  configured: boolean;
  globallyEnabled: boolean;
  connected: boolean;
  email: string | null;
  autoUpload: boolean;
  folderLabel: string;
  folderUrl: string | null;
  folderSource: "user" | "env" | "auto";
  subfolderPerJob: boolean;
  share: "none" | "anyone";
}

export async function getDriveStatus(userId: string): Promise<DriveStatus> {
  const cfg = getDriveConfig();
  const row = isDriveConfigured() ? await getDriveRow(userId) : null;
  let folderLabel = `${cfg.folderName} (dibuat otomatis di My Drive)`;
  let folderUrl: string | null = null;
  let folderSource: DriveStatus["folderSource"] = "auto";
  if (row?.folderId) {
    folderSource = "user";
    folderLabel = row.folderName || row.folderId;
    folderUrl = driveFolderUrl(row.folderId);
  } else if (cfg.folderId) {
    folderSource = "env";
    folderLabel = `${cfg.folderId} (env GOOGLE_DRIVE_FOLDER_ID)`;
    folderUrl = driveFolderUrl(cfg.folderId);
  } else if (row?.autoFolderId) {
    folderUrl = driveFolderUrl(row.autoFolderId);
  }
  return {
    configured: isDriveConfigured(),
    globallyEnabled: cfg.enabled,
    connected: !!row,
    email: row?.googleEmail ?? null,
    autoUpload: row?.autoUpload ?? false,
    folderLabel,
    folderUrl,
    folderSource,
    subfolderPerJob: cfg.subfolderPerJob,
    share: cfg.share,
  };
}

// ─── UPLOAD ──────────────────────────────────────────────────────────────

function safeName(s: string, max = 80): string {
  const cleaned = s.replace(/[\\/:*?"<>|%\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  return (cleaned || "clip").slice(0, max);
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      const msg = describeError(err);
      // Jangan retry untuk error permanen
      if (/dicabut|kedaluwarsa|kuota|Izin Drive/i.test(msg)) break;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw last;
}

async function uploadFile(
  drive: drive_v3.Drive,
  filePath: string,
  name: string,
  mimeType: string,
  parentId: string,
  share: "none" | "anyone",
  description?: string
): Promise<{ id: string; url: string }> {
  const res = await withRetry(() =>
    drive.files.create({
      requestBody: { name, parents: [parentId], description },
      media: { mimeType, body: fs.createReadStream(filePath) },
      fields: "id,webViewLink",
      supportsAllDrives: true,
    })
  );
  const id = res.data.id!;
  if (share === "anyone") {
    try {
      await drive.permissions.create({
        fileId: id,
        requestBody: { role: "reader", type: "anyone" },
        supportsAllDrives: true,
      });
    } catch (err) {
      console.warn("[drive] gagal set sharing:", describeError(err));
    }
  }
  return { id, url: res.data.webViewLink || `https://drive.google.com/file/d/${id}/view` };
}

export interface DriveUploadSummary {
  /** false jika Drive tidak aktif untuk user ini (tidak ada yang diupload) */
  attempted: boolean;
  skippedReason?: string;
  folderName?: string;
  folderUrl?: string;
  warning?: string;
  error?: string;
  /** sejajar dengan array clips yang dikirim */
  results: ({ fileId: string; url: string } | null)[];
}

export async function uploadClipsToDrive(opts: {
  userId: string;
  jobId: string;
  videoTitle?: string | null;
  clips: ClipResult[];
  onProgress?: (clipIndex: number, total: number, result: { url: string } | null, error?: string) => Promise<void>;
}): Promise<DriveUploadSummary> {
  const { userId, clips, onProgress } = opts;
  const empty: DriveUploadSummary = { attempted: false, results: clips.map(() => null) };

  const cfg = getDriveConfig();
  if (!cfg.enabled) return { ...empty, skippedReason: "GOOGLE_DRIVE_ENABLED=false" };
  if (!isDriveConfigured()) return { ...empty, skippedReason: "Google OAuth belum dikonfigurasi" };

  const row = await getDriveRow(userId);
  if (!row) return { ...empty, skippedReason: "Drive belum terhubung" };
  if (!row.autoUpload) return { ...empty, skippedReason: "Auto-upload Drive dimatikan" };

  const summary: DriveUploadSummary = { attempted: true, results: clips.map(() => null) };

  try {
    const drive = await getDriveClient(row);
    const base = await resolveBaseFolder(drive, row, cfg);
    summary.warning = base.warning;

    let target = base;
    if (cfg.subfolderPerJob) {
      const date = new Date().toISOString().slice(0, 10);
      target = await withRetry(() =>
        createFolder(drive, `${safeName(opts.videoTitle || "Video", 60)} - ${date}`, base.id)
      );
    }
    summary.folderName = target.name;
    summary.folderUrl = driveFolderUrl(target.id);

    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      if (!clip.filePath || !fs.existsSync(clip.filePath)) {
        if (onProgress) await onProgress(i, clips.length, null, "File tidak ditemukan");
        continue;
      }
      try {
        const prefix = String(i + 1).padStart(2, "0");
        const baseName = `${prefix} - ${safeName(clip.title)}`;
        const description = [clip.description, clip.tags?.length ? clip.tags.map((t) => `#${t}`).join(" ") : ""]
          .filter(Boolean)
          .join("\n\n");

        const video = await uploadFile(
          drive, clip.filePath, `${baseName}.mp4`, "video/mp4", target.id, cfg.share, description
        );
        summary.results[i] = { fileId: video.id, url: video.url };

        if (cfg.uploadThumbnail && clip.thumbnailPath && fs.existsSync(clip.thumbnailPath)) {
          try {
            await uploadFile(drive, clip.thumbnailPath, `${baseName}.jpg`, "image/jpeg", target.id, cfg.share);
          } catch (err) {
            console.warn("[drive] thumbnail gagal:", describeError(err));
          }
        }
        if (onProgress) await onProgress(i, clips.length, { url: video.url });
      } catch (err) {
        const msg = describeError(err);
        console.error(`[drive] upload klip ${i + 1} gagal:`, err);
        if (onProgress) await onProgress(i, clips.length, null, msg);
        summary.error = msg;
      }
    }
  } catch (err) {
    summary.error = describeError(err);
    console.error("[drive] upload gagal:", err);
  }

  return summary;
}
