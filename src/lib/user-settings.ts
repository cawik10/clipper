/**
 * USER SETTINGS HELPERS
 * =====================
 * Centralised CRUD for per-user settings stored in PostgreSQL.
 * All bot code should use these helpers instead of querying the DB directly.
 */

import { db } from "@/db";
import { userSettings, UserSettingsRow } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getMaxClipsConfig, getDefaultClipDuration, getDurationRange } from "@/lib/video-config";
import { getDefaultNichePrompt, sanitizeNichePrompt } from "@/lib/niche-prompt";

// ─── GET OR CREATE ────────────────────────────────────────────────────────

export async function getOrCreateUserSettings(
  userId: string,
  _meta?: { username?: string; firstName?: string }
): Promise<UserSettingsRow> {
  const rows = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.telegramUserId, userId));

  if (rows.length > 0) return rows[0];

  // Create new user settings with env var defaults
  const defaultDuration = getDefaultClipDuration();
  const { min, max } = getDurationRange(defaultDuration);
  const newRow = await db
    .insert(userSettings)
    .values({
      telegramUserId: userId,
      maxClips: getMaxClipsConfig(),
      clipDuration: defaultDuration,
      minDuration: min,
      maxDuration: max,
      defaultPrivacy: "private",
      language: "id",
      // 🎯 Custom Niche Prompt (BARU!) — user baru mewarisi default global (bisa kosong)
      nichePrompt: sanitizeNichePrompt(getDefaultNichePrompt()),
    })
    .returning();

  return newRow[0];
}

// ─── 🎯 CUSTOM NICHE PROMPT (BARU!) ─────────────────────────────────────────
// Helper khusus supaya gampang dipakai ulang dari Telegram bot / API route
// tanpa perlu tahu detail validasi. Lihat src/lib/niche-prompt.ts untuk
// aturan sanitasi & preset yang mudah diubah.

/** Set/ubah niche prompt milik satu user. Kirim string kosong/"reset" untuk menghapus. */
export async function setNichePrompt(userId: string, rawPrompt: string): Promise<string | null> {
  await getOrCreateUserSettings(userId);
  const sanitized = sanitizeNichePrompt(rawPrompt);
  await patchUserSettings(userId, { nichePrompt: sanitized });
  return sanitized;
}

/** Hapus niche prompt milik user (kembali memakai default global / tanpa arahan khusus). */
export async function clearNichePrompt(userId: string): Promise<void> {
  await patchUserSettings(userId, { nichePrompt: null });
}

// ─── PATCH ────────────────────────────────────────────────────────────────

export async function patchUserSettings(
  userId: string,
  patch: Partial<Omit<UserSettingsRow, "id" | "telegramUserId" | "createdAt" | "updatedAt">>
): Promise<void> {
  await db
    .update(userSettings)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(userSettings.telegramUserId, userId));
}

// ─── RESET ────────────────────────────────────────────────────────────────

/** Reset a specific setting to NULL so the env-var default takes over */
export async function resetUserSetting(
  userId: string,
  field: keyof Omit<UserSettingsRow, "id" | "telegramUserId" | "createdAt" | "updatedAt">
): Promise<void> {
  await db
    .update(userSettings)
    .set({ [field]: null, updatedAt: new Date() })
    .where(eq(userSettings.telegramUserId, userId));
}

// ─── GET ALL USERS (admin) ────────────────────────────────────────────────

export async function getAllUserSettings(): Promise<UserSettingsRow[]> {
  return db.select().from(userSettings).orderBy(userSettings.createdAt);
}
