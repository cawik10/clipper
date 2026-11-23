import { google } from "googleapis";
import { shouldRequestReadonlyScope } from "@/lib/analytics-config";
import { RETITLE_SCOPE, shouldRequestRetitleScope } from "@/lib/auto-title-doctor-config";
import { PRUNE_SCOPE, shouldRequestPruneScope } from "@/lib/auto-prune-config";
import { AUTO_COMMENT_SCOPE, shouldRequestCommentScope } from "@/lib/auto-comment-config";
import { CLAIM_SCOPE, shouldRequestClaimScope } from "@/lib/claim-monitor-config"; // 🚨 Claim Monitor (BARU!)

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function getAuthUrl(userId: string): string {
  const oauth2Client = getOAuthClient();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    // 📈 AI Analytics (BARU!) — scope baca-saja ditambahkan supaya views video
    // private/draft bisa dilacak. Matikan: ANALYTICS_REQUEST_READONLY_SCOPE=false
    scope: Array.from(
      new Set([
        "https://www.googleapis.com/auth/youtube.upload",
        ...(shouldRequestReadonlyScope() ? ["https://www.googleapis.com/auth/youtube.readonly"] : []),
        // 🩺 Auto-Title Doctor (BARU!) — izin edit judul video (videos.update).
        // Hanya diminta kalau ANALYTICS_AUTO_RETITLE_LOW_VIEWS=true.
        ...(shouldRequestRetitleScope() ? [RETITLE_SCOPE] : []),
        // ✂️ Auto-Prune Klip Gagal (BARU!) — izin sembunyikan/hapus video (videos.update/delete,
        // scope youtube.force-ssl yang sama). Matikan: AUTO_PRUNE_ENABLED=false / AUTO_PRUNE_REQUEST_SCOPE=false
        ...(shouldRequestPruneScope() ? [PRUNE_SCOPE] : []),
        // 💬 Auto-First Comment (BARU!) — izin posting komentar (commentThreads.insert,
        // scope youtube.force-ssl). Hanya diminta kalau YOUTUBE_AUTO_COMMENT_ENABLED=true.
        ...(shouldRequestCommentScope() ? [AUTO_COMMENT_SCOPE] : []),
        // 🚨 Post-Upload Claim Monitor (BARU!) — izin baca status klaim (videos.list) + tombol Hapus/Private
        // (videos.update/delete, scope youtube.force-ssl). Matikan: CLAIM_MONITOR_ENABLED=false / CLAIM_MONITOR_REQUEST_SCOPE=false
        ...(shouldRequestClaimScope() ? [CLAIM_SCOPE] : []),
      ])
    ),
    state: userId,
    prompt: "consent",
  });
}

export async function exchangeCodeForTokens(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string;
}> {
  const oauth2Client = getOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error("Gagal mendapatkan token dari Google");
  }

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(tokens.expiry_date || Date.now() + 3600000),
    scope: tokens.scope || "",
  };
}
