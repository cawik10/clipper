/**
 * TikTok Content Posting API – video uploader
 */
import fs from "fs";
import { ClipResult } from "@/db/schema";

const TIKTOK_API_BASE = "https://open.tiktokapis.com";

export type TikTokPrivacy =
  | "PUBLIC_TO_EVERYONE"
  | "MUTUAL_FOLLOW_FRIENDS"
  | "SELF_ONLY";

export interface TikTokUploadOptions {
  filePath: string;
  title: string;
  privacyLevel?: TikTokPrivacy;
  disableDuet?: boolean;
  disableComment?: boolean;
  disableStitch?: boolean;
  mode?: "inbox" | "direct";
}

export interface TikTokUploadResult {
  publishId: string;
  videoUrl?: string;
}

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
  const CHUNK_SIZE = 10 * 1024 * 1024;
  const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);

  console.log(
    `[TikTok] Uploading "${title}" – mode=${mode}, size=${Math.round(fileSize / 1024 / 1024)}MB, chunks=${totalChunks}`
  );

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

  const initData = await initRes.json() as {
    error?: { code: string; message: string };
    data?: { publish_id: string; upload_url: string };
  };

  if (!initRes.ok || initData.error?.code !== "ok") {
    const code = initData.error?.code ?? initRes.status;
    const msg = initData.error?.message ?? JSON.stringify(initData);
    throw new Error(`TikTok init upload failed [${code}]: ${msg}`);
  }

  const { publish_id: publishId, upload_url: uploadUrl } = initData.data!;
  if (!uploadUrl) {
    throw new Error("TikTok did not return upload_url");
  }

  console.log(`[TikTok] publish_id=${publishId}, upload_url obtained`);

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
        "Content-Length": chunk.length.toString(),
        "Content-Range": `bytes ${offset}-${end - 1}/${fileSize}`,
      },
      body: chunk,
    });
    if (!chunkRes.ok && chunkRes.status !== 206) {
      throw new Error(`TikTok chunk ${chunkIndex} upload failed: HTTP ${chunkRes.status}`);
    }
    console.log(`[TikTok] Chunk ${chunkIndex + 1}/${totalChunks} uploaded`);
    offset = end;
    chunkIndex++;
  }

  return { publishId };
}

export async function checkTikTokUploadStatus(
  publishId: string,
  accessToken: string
): Promise<{ status: string; publicationId?: string }> {
  const res = await fetch(`${TIKTOK_API_BASE}/v2/post/publish/status/fetch/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({ publish_id: publishId }),
  });
  const data = await res.json() as { data?: { status: string; publicationId?: string } };
  if (!res.ok) {
    return { status: "FAILED" };
  }
  return {
    status: data.data?.status ?? "UNKNOWN",
    publicationId: data.data?.publicationId,
  };
}

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
    if (!clip.filePath || !fs.existsSync(clip.filePath)) {
      results.push(null);
      if (onProgress) await onProgress(i, null, "File tidak ditemukan");
      continue;
    }

    try {
      const hashtags = (clip.tags || [])
        .map((t) => `#${t.replace(/\s+/g, "")}`)
        .join(" ");
      const caption = `${clip.title}\n\n${hashtags}\n\n#TikTok #Viral #Shorts`.slice(0, 2200);

      const result = await uploadToTikTok(
        { filePath: clip.filePath, title: caption, privacyLevel, mode },
        accessToken
      );
      results.push(result);
      if (onProgress) await onProgress(i, result);

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
