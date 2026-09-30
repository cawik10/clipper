/**
 * USER SETTINGS HELPERS
 * =====================
 * Centralised CRUD for per-user settings stored in PostgreSQL.
 * All bot code should use these helpers instead of querying the DB directly.
 */

import { db } from "@/db";
import { userSettings, UserSettingsRow } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getMaxClipsConfig } from "@/lib/video-config";

// ─── GET OR CREATE ────────────────────────────────────────────────────────

export async function getOrCreateUserSettings(
  userId: string,
  meta?: { username?: string; firstName?: string }
): Promise<UserSettingsRow> {
  const rows = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.telegramUserId, userId));

  if (rows.length > 0) {
    // Update display name if provided
    if (meta?.username || meta?.firstName) {
      await db
        .update(userSettings)
        .set({
          telegramUsername: meta.username ?? rows[0].telegramUsername,
          telegramFirstName: meta.firstName ?? rows[0].telegramFirstName,
          updatedAt: new Date(),
        })
        .where(eq(userSettings.telegramUserId, userId));
    }
    return rows[0];
  }

  // Create new user settings with env var defaults
  const newRow = await db
    .insert(userSettings)
    .values({
      telegramUserId: userId,
      telegramUsername: meta?.username,
      telegramFirstName: meta?.firstName,
      maxClips: getMaxClipsConfig(),
      minDuration: 20,
      maxDuration: 40,
      defaultPrivacy: "private",
      language: "id",
    })
    .returning();

  return newRow[0];
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
