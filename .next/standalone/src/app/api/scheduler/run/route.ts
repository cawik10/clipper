import { NextRequest, NextResponse } from "next/server";
import { getDueScheduledUploads, claimScheduledUpload, completeScheduledUpload } from "@/lib/scheduler";
import { publishJobClips } from "@/lib/job-processor";
import { bot } from "@/lib/telegram-bot";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Amankan endpoint dengan SETUP_SECRET dari env
  if (req.nextUrl.searchParams.get("secret") !== process.env.SETUP_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dueJobs = await getDueScheduledUploads(5); // Ambil 5 jadwal yang sudah waktunya
  const results = [];

  for (const job of dueJobs) {
    if (await claimScheduledUpload(job.id)) {
       try {
         await publishJobClips(job.jobId);
         await completeScheduledUpload(job.id, true);
         await bot.api.sendMessage(job.telegramChatId, `✅ *Jadwal Terlaksana!*\nVideo berhasil dipublish otomatis!`, { parse_mode: "Markdown" });
         results.push({ id: job.id, status: "success" });
       } catch (err) {
         await completeScheduledUpload(job.id, false, String(err));
         await bot.api.sendMessage(job.telegramChatId, `❌ *Jadwal Gagal!*\nVideo gagal dipublish: ${String(err)}`, { parse_mode: "Markdown" });
         results.push({ id: job.id, status: "error", error: String(err) });
       }
    }
  }
  return NextResponse.json({ processed: results.length, results });
}