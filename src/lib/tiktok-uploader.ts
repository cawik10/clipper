/**
 * TikTok Content Posting API – video uploader
 *
 * Supports two modes:
 *   1. INBOX (Creator Post) – sends video to TikTok inbox; user taps "Post" in-app.
 *      Does NOT require publishing scope approval from TikTok.
 *      Endpoint: /v2/post/publish/inbox/video/init/
 *
 *   2. DIRECT (Direct Post) – publishes immediately to the user's profile.
 *      Requires video.publish scope approval from TikTok developer portal.
 *      Endpoint: /v2/post/publish/video/init/
 *
 * We default to INBOX mode because it is available without extra review approval.
 * Switch UPLOAD_MODE to "direct" once your TikTok app is approved.
 *
 * Docs: https://developers.tiktok.com/doc/content-posting-api-reference-upload-video
 */

import fs from "fs";

const TIKTOK_API_BASE = "https://open.tiktokapis.com";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TikTokPrivacy =
  | "PUBLIC_TO_EVERYONE"
  | "MUTUAL_FOLLOW_FRIENDS"
  | "SELF_ONLY";

export interface TikTokUploadOptions {
  filePath: string;
  title: string;           // caption / description (max 2200 chars)
  privacyLevel?: TikTokPrivacy;
  disableDuet?: boolean;
  disableComment?: boolean;
  disableStitch?: boolean;
  mode?: "inbox" | "direct"; // default: "inbox"
}

export interface TikTokUploadResult {
  publishId: string;
  /** URL only available for "direct" mode once video is processed */
  videoUrl?: string;
}

// ── Upload ────────────────────────────────────────────────────────────────────

export async function uploadToTikTok(
  options: TikTokUploadOptions,
  accessToken: string
): Promise<TikTokUploadResult> {
  const {
    filePath,
    title,
    privacyLevel = "SELF_ONLY",
    disableDuet = false,
    disableComment = false,
    disableStitch = false,
    mode = "inbox",
  } = options;

  if (!fs.existsSync(filePath)) {
    throw new Error(`TikTok upload: video file not found at ${filePath}`);
  }

  const fileSize = fs.statSync(filePath).size;

  // Chunk size: 10 MB (TikTok min 5 MB, max 64 MB per chunk)
  const CHUNK_SIZE = 10 * 1024 * 1024;
  const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);

  console.log(
    `[TikTok] Uploading "${title}" – mode=${mode}, size=${Math.round(fileSize / 1024 / 1024)}MB, chunks=${totalChunks}`
  );

  // ── Step 1: Init upload ──────────────────────────────────────────────────
  const initEndpoint =
    mode === "direct"
      ? `${TIKTOK_API_BASE}/v2/post/publish/video/init/`
      : `${TIKTOK_API_BASE}/v2/post/publish/inbox/video/init/`;

  const initBody: Record<string, unknown> = {
    source_info: {
      source: "FILE_UPLOAD",
      video_size: fileSize,
      chunk_size: CHUNK_SIZE,
      total_chunk_count: totalChunks,
    },
  };

  // Direct mode needs post_info
  if (mode === "direct") {
    initBody.post_info = {
      title: title.slice(0, 2200),
      privacy_level: privacyLevel,
      disable_duet: disableDuet,
      disable_comment: disableComment,
      disable_stitch: disableStitch,
      video_cover_timestamp_ms: 1000,
    };
  }

  const initRes = await fetch(initEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify(initBody),
  });

  const initData = await initRes.json();

  if (!initRes.ok || initData.error?.code !== "ok") {
    const code = initData.error?.code ?? initRes.status;
    const msg = initData.error?.message ?? JSON.stringify(initData);
    throw new Error(`TikTok init upload failed [${code}]: ${msg}`);
  }

  const { publish_id: publishId, upload_url: uploadUrl } = initData.data;

  if (!uploadUrl) {
    throw new Error("TikTok did not return upload_url");
  }

  console.log(`[TikTok] publish_id=${publishId}, upload_url obtained`);

  // ── Step 2: Upload chunks ────────────────────────────────────────────────
  const fileBuffer = fs.readFileSync(filePath);
  let offset = 0;
  let chunkIndex = 0;

  while (offset < fileSize) {
    const end = Math.min(offset + CHUNK_SIZE, fileSize);
    const chunk = fileBuffer.slice(offset, end);

    const chunkRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Range": `bytes ${offset}-${end - 1}/${fileSize}`,
        "Content-Length": String(chunk.length),
      },
      body: chunk,
    });

    if (!chunkRes.ok && chunkRes.status !== 206) {
      throw new Error(
        `TikTok chunk upload failed [chunk ${chunkIndex + 1}/${totalChunks}]: HTTP ${chunkRes.status}`
      );
    }

    console.log(
      `[TikTok] Chunk ${chunkIndex + 1}/${totalChunks} uploaded (${Math.round((end / fileSize) * 100)}%)`
    );

    offset = end;
    chunkIndex++;
  }

  console.log(`[TikTok] All chunks uploaded for publish_id=${publishId}`);

  return { publishId };
}

// ── Check publish status ──────────────────────────────────────────────────────

export interface TikTokPublishStatus {
  status: "PROCESSING_UPLOAD" | "PUBLISH_COMPLETE" | "FAILED" | string;
  publicationId?: string;
}

export async function checkPublishStatus(
  publishId: string,
  accessToken: string
): Promise<TikTokPublishStatus> {
  const res = await fetch(
    `${TIKTOK_API_BASE}/v2/post/publish/status/fetch/`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({ publish_id: publishId }),
    }
  );

  const data = await res.json();

  if (!res.ok) {
    return { status: "FAILED" };
  }

  return {
    status: data.data?.status ?? "UNKNOWN",
    publicationId: data.data?.publicationId,
  };
}

// ── Upload multiple clips ─────────────────────────────────────────────────────

import { ClipResult } from "@/db/schema";

export interface TikTokClipUploadResult {
  publishId: string;
  videoUrl?: string;
}

export async function uploadClipsToTikTok(
  clips: ClipResult[],
  accessToken: string,
  privacyLevel: TikTokPrivacy = "SELF_ONLY",
  mode: "inbox" | "direct" = "inbox",
  onProgress?: (
    clipIndex: number,
    result: TikTokClipUploadResult | null,
    error?: string
  ) => Promise<void>
): Promise<(TikTokClipUploadResult | null)[]> {
  const results: (TikTokClipUploadResult | null)[] = [];

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    if (!clip.filePath) {
      results.push(null);
      if (onProgress) await onProgress(i, null, "No file path");
      continue;
    }

    try {
      // Build caption: title + hashtags (max 2200 chars)
      const hashtags = (clip.tags || [])
        .map((t) => `#${t.replace(/\s+/g, "")}`)
        .join(" ");
      const caption = `${clip.title}\n\n${hashtags}\n\n#TikTok #Viral #Shorts`.slice(
        0,
        2200
      );

      const result = await uploadToTikTok(
        {
          filePath: clip.filePath,
          title: caption,
          privacyLevel,
          mode,
        },
        accessToken
      );

      results.push(result);
      if (onProgress) await onProgress(i, result);

      // Delay between uploads to avoid rate limiting
      if (i < clips.length - 1) {
        await new Promise((r) => setTimeout(r, 3000));
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[TikTok] Failed to upload clip ${i}:`, err);
      results.push(null);
      if (onProgress) await onProgress(i, null, errorMsg);
    }
  }

  return results;
}
