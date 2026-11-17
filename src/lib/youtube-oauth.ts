import { google } from "googleapis";
import { shouldRequestReadonlyScope } from "@/lib/analytics-config";

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
    scope: shouldRequestReadonlyScope()
      ? [
          "https://www.googleapis.com/auth/youtube.upload",
          "https://www.googleapis.com/auth/youtube.readonly",
        ]
      : ["https://www.googleapis.com/auth/youtube.upload"],
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
