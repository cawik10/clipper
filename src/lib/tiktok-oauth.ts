/**
 * TikTok OAuth 2.0 helpers (Content Posting API)
 *
 * Scopes needed:
 *   video.upload   – upload video to inbox (requires TikTok app review)
 *   video.publish  – direct publish (requires TikTok app review)
 *   user.info.basic – display name / avatar
 *
 * Docs: https://developers.tiktok.com/doc/oauth-user-access-token-management
 */

const TIKTOK_AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";

export function getTikTokAuthUrl(state: string): string {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const redirectUri = process.env.TIKTOK_REDIRECT_URI;

  if (!clientKey || !redirectUri) {
    throw new Error(
      "Missing TikTok OAuth credentials: TIKTOK_CLIENT_KEY, TIKTOK_REDIRECT_URI"
    );
  }

  const params = new URLSearchParams({
    client_key: clientKey,
    scope: "video.upload,video.publish,user.info.basic",
    response_type: "code",
    redirect_uri: redirectUri,
    state,
  });

  return `${TIKTOK_AUTH_URL}?${params.toString()}`;
}

export interface TikTokTokenResponse {
  accessToken: string;
  refreshToken: string;
  openId: string;
  expiresAt: Date;         // access token expiry
  refreshExpiresAt: Date;  // refresh token expiry
  scope: string;
}

export async function exchangeCodeForTokens(
  code: string
): Promise<TikTokTokenResponse> {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  const redirectUri = process.env.TIKTOK_REDIRECT_URI;

  if (!clientKey || !clientSecret || !redirectUri) {
    throw new Error("Missing TikTok OAuth credentials");
  }

  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });

  const res = await fetch(TIKTOK_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(
      `TikTok token exchange failed: ${data.error_description || JSON.stringify(data)}`
    );
  }

  const now = Date.now();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    openId: data.open_id,
    expiresAt: new Date(now + data.expires_in * 1000),
    refreshExpiresAt: new Date(now + data.refresh_expires_in * 1000),
    scope: data.scope || "",
  };
}

export async function refreshAccessToken(
  refreshToken: string
): Promise<Omit<TikTokTokenResponse, "scope" | "openId" | "refreshExpiresAt">> {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;

  if (!clientKey || !clientSecret) {
    throw new Error("Missing TikTok OAuth credentials");
  }

  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const res = await fetch(TIKTOK_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(
      `TikTok token refresh failed: ${data.error_description || JSON.stringify(data)}`
    );
  }

  const now = Date.now();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(now + data.expires_in * 1000),
  };
}

export function isTokenExpired(expiresAt: Date): boolean {
  // 5-minute buffer
  return new Date() >= new Date(expiresAt.getTime() - 5 * 60 * 1000);
}
