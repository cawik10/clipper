import fs from "fs";
import { getYouTubeClient, getOAuth2ClientWithCredentials } from "@/lib/youtube-oauth";
import { ClipResult } from "@/db/schema";

export interface UploadOptions {
  filePath: string;
  title: string;
  description: string;
  tags: string[];
  privacyStatus: "private" | "unlisted" | "public";
  categoryId?: string;
  madeForKids?: boolean;
}

export interface UploadResult {
  videoId: string;
  videoUrl: string;
  title: string;
}

// Upload video to YouTube as draft (private)
export async function uploadToYouTube(
  options: UploadOptions,
  accessToken: string,
  refreshToken: string
): Promise<UploadResult> {
  const youtube = getYouTubeClient(accessToken, refreshToken);

  if (!fs.existsSync(options.filePath)) {
    throw new Error(`Video file not found: ${options.filePath}`);
  }

  const fileSize = fs.statSync(options.filePath).size;
  console.log(`Uploading video: ${options.title} (${Math.round(fileSize / 1024 / 1024)}MB)`);

  // Build title: ensure #Shorts is included and max 100 chars
  let title = options.title;
  if (!title.toLowerCase().includes("#shorts")) {
    title = title + " #Shorts";
  }
  title = title.slice(0, 100);

  // Build description
  const description = [
    options.description,
    "",
    "#Shorts #YouTube #Viral #Trending",
    "",
    "🎬 Auto-generated clip | Created with AutoClip Bot",
  ].join("\n").slice(0, 5000);

  const tags = [
    ...options.tags,
    "shorts",
    "viral",
    "trending",
    "youtube shorts",
  ].filter((t, i, arr) => arr.indexOf(t) === i).slice(0, 500); // unique, max 500 total chars

  const response = await youtube.videos.insert(
    {
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title,
          description,
          tags,
          categoryId: options.categoryId || "22", // 22 = People & Blogs
          defaultLanguage: "id",
        },
        status: {
          privacyStatus: options.privacyStatus,
          selfDeclaredMadeForKids: options.madeForKids || false,
        },
      },
      media: {
        mimeType: "video/mp4",
        body: fs.createReadStream(options.filePath),
      },
    },
    {
      onUploadProgress: (evt) => {
        const pct = Math.round((evt.bytesRead / fileSize) * 100);
        process.stdout.write(`\rUpload progress: ${pct}%`);
      },
    }
  );

  process.stdout.write("\n");

  const videoId = response.data.id!;
  const videoUrl = `https://www.youtube.com/shorts/${videoId}`;

  console.log(`Upload complete: ${videoUrl}`);

  return {
    videoId,
    videoUrl,
    title,
  };
}

// Upload multiple clips from a job
export async function uploadClipsToYouTube(
  clips: ClipResult[],
  accessToken: string,
  refreshToken: string,
  privacyStatus: "private" | "unlisted" | "public" = "private",
  onProgress?: (clipIndex: number, result: UploadResult | null, error?: string) => void
): Promise<(UploadResult | null)[]> {
  const results: (UploadResult | null)[] = [];

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];

    if (!clip.filePath || !fs.existsSync(clip.filePath)) {
      console.error(`Clip ${i} file not found: ${clip.filePath}`);
      results.push(null);
      if (onProgress) onProgress(i, null, "File not found");
      continue;
    }

    try {
      const result = await uploadToYouTube(
        {
          filePath: clip.filePath,
          title: clip.title,
          description: clip.description || "",
          tags: clip.tags || [],
          privacyStatus,
        },
        accessToken,
        refreshToken
      );

      results.push(result);
      if (onProgress) onProgress(i, result);

      // Wait between uploads to avoid rate limiting
      if (i < clips.length - 1) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`Failed to upload clip ${i}:`, err);
      results.push(null);
      if (onProgress) onProgress(i, null, errorMsg);
    }
  }

  return results;
}

// Refresh access token
export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresAt: Date;
}> {
  const oauth2Client = getOAuth2ClientWithCredentials("", refreshToken);
  const { credentials } = await oauth2Client.refreshAccessToken();

  return {
    accessToken: credentials.access_token!,
    expiresAt: new Date(credentials.expiry_date!),
  };
}

// Check if token is expired
export function isTokenExpired(expiresAt: Date): boolean {
  return new Date() >= new Date(expiresAt.getTime() - 5 * 60 * 1000); // 5 min buffer
}
