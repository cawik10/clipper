/**
 * GET /api/schedule/recommend?niche=...&platform=youtube
 * Mengembalikan rekomendasi jam optimal posting (AI kalau tersedia, fallback
 * kurasi manual kalau tidak) — dipakai oleh Telegram bot (/schedule,
 * /besttime) dan bisa dipanggil langsung untuk integrasi lain.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAiOptimalSlots, nextDateForSlot, formatSlotLabel } from "@/lib/scheduler-config";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const niche = req.nextUrl.searchParams.get("niche");
  const platform = (req.nextUrl.searchParams.get("platform") as "youtube" | "tiktok") || "youtube";
  const countRaw = req.nextUrl.searchParams.get("count");
  const count = countRaw ? Math.min(5, Math.max(1, parseInt(countRaw, 10) || 3)) : 3;

  const recommendation = await getAiOptimalSlots(niche, platform, count);

  const slots = recommendation.slots.map((slot) => ({
    ...slot,
    display: formatSlotLabel(slot),
    nextOccurrence: nextDateForSlot(slot).toISOString(),
  }));

  return NextResponse.json({
    niche: recommendation.nicheLabel,
    platform,
    aiPowered: recommendation.aiPowered,
    slots,
  });
}
