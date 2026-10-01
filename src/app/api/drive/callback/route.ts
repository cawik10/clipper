import { NextRequest } from "next/server";
import { handleDriveOAuthCallback } from "@/lib/drive-callback";
import { DRIVE_STATE_PREFIX } from "@/lib/drive-uploader";

export const dynamic = "force-dynamic";

// Google OAuth callback untuk Google Drive.
// Opsional: pakai GOOGLE_DRIVE_REDIRECT_URI=https://appmu.up.railway.app/api/drive/callback
// (default: memakai redirect URI YouTube yang sudah ada, jadi tidak perlu setup baru).
export async function GET(req: NextRequest) {
  const state = req.nextUrl.searchParams.get("state");
  const userId = state?.startsWith(DRIVE_STATE_PREFIX) ? state.slice(DRIVE_STATE_PREFIX.length) : state;
  return handleDriveOAuthCallback(
    req.nextUrl.searchParams.get("code"),
    userId,
    req.nextUrl.searchParams.get("error")
  );
}
