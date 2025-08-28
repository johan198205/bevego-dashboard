import { NextResponse } from "next/server";
import { fetchChannelBreakdown, ALL_KEYS, type MKey } from "../../../lib/ga4";

export async function POST(req: Request) {
  try {
    const { startDate, endDate, metrics } = await req.json();
    const keys: MKey[] = (metrics && metrics.length ? metrics : ALL_KEYS) as MKey[];
    const data = await fetchChannelBreakdown(startDate, endDate, keys);
    return NextResponse.json(data);
  } catch (e: any) {
    console.error("channels error:", e);
    return NextResponse.json({ error: e?.message || "channels-fel" }, { status: 500 });
  }
}
