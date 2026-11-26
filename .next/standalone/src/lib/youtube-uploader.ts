import { google } from "googleapis";
import fs from "fs";
import type { ClipResult } from "@/db/schema";

function getOAuthClient(accessToken: string, refreshToken: string) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  oauth2Client.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
  return oauth2Client;
}

export interface UploadResult {
  videoId: string;
  videoUrl: string;
  clipIndex: number;
}

export async function uploadClipsToYouTube(
  clips: ClipResult[],
  accessToken: string,
  refreshToken: string,
  privacyStatus: "private" | "unlisted" | "public" = "private",
  onUpload?: (index: number, result?: UploadResult, error?: string) => Promise<void>
): Promise<(UploadResult | null)[]> {
  const auth = getOAuthClient(accessToken, refreshToken);
  const youtube = google.youtube({ version: "v3", auth });
  const results: (UploadResult | null)[] = [];

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    if (!clip.filePath || !fs.existsSync(clip.filePath)) {
      results.push(null);
      if (onUpload) await onUpload(i, undefined, "File tidak ditemukan");
      continue;
    }

    try {
      const response = await youtube.videos.insert({
        part: ["snippet", "status"],
        requestBody: {
          snippet: {
            title: clip.title.slice(0, 100),
            description: clip.description || "",
            tags: clip.tags || [],
            categoryId: "22",
          },
          status: {
            privacyStatus,
            selfDeclaredMadeForKids: false,
          },
        },
        media: {
          body: fs.createReadStream(clip.filePath),
        },
      });

      const videoId = response.data.id!;
      const videoUrl = `https://youtu.be/${videoId}`;
      const result: UploadResult = { videoId, videoUrl, clipIndex: i };
      results.push(result);
      if (onUpload) await onUpload(i, result);

      // Small delay between uploads
      if (i < clips.length - 1) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[youtube] Upload klip ${i} gagal:`, err);
      results.push(null);
      if (onUpload) await onUpload(i, undefined, errorMsg);
    }
  }

  return results;
}

export function isTokenExpired(expiresAt: Date): boolean {
  return new Date() >= new Date(expiresAt.getTime() - 5 * 60 * 1000);
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresAt: Date;
}> {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await oauth2Client.refreshAccessToken();
  return {
    accessToken: credentials.access_token!,
    expiresAt: new Date(credentials.expiry_date || Date.now() + 3600000),
  };
}
