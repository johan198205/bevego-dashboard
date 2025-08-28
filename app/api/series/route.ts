// app/api/series/route.ts
import { NextResponse } from "next/server";
import { fetchTimeseries, type MKey } from "../../../lib/ga4";

const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function POST(req: Request) {
  try {
    const { startDate, endDate, metric } = await req.json();
    if (!startDate || !endDate || !metric) {
      return NextResponse.json({ error: "startDate, endDate och metric krävs" }, { status: 400 });
    }

    const map: Record<string, MKey> = {
      sessions: "sessions",
      users: "totalUsers",
      averageSessionDuration: "averageSessionDuration",
      conversions: "conversions",
    };
    const mKey = map[metric];
    if (!mKey) return NextResponse.json({ error: `Okänd metric: ${metric}` }, { status: 400 });

    // Räkna ut föregående period med samma längd
    const s = new Date(startDate);
    const e = new Date(endDate);
    const days = Math.round((+e - +s) / (1000 * 60 * 60 * 24));
    const prevEnd = new Date(s); prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - days);

    // Hämta timeseries
    const cur = await fetchTimeseries(startDate, endDate, [mKey]);
    const prv = await fetchTimeseries(iso(prevStart), iso(prevEnd), [mKey]);

    // Sortera nuvarande period kronologiskt och använd dess labels som X-axel
    const curLabelsRaw: string[] = cur.labels ?? [];
    const curValsRaw: number[] = cur.series?.[mKey] ?? [];
    const curOrder = curLabelsRaw.map((l, i) => ({ l, i })).sort((a, b) => Number(a.l) - Number(b.l));
    const labels = curOrder.map(o => curLabelsRaw[o.i]);
    const currentData = curOrder.map(o => curValsRaw[o.i] ?? 0);

    // Sortera föregående period och aligna index-vis mot nuvarande
    const prvLabelsRaw: string[] = prv.labels ?? [];
    const prvValsRaw: number[] = prv.series?.[mKey] ?? [];
    const prvOrder = prvLabelsRaw.map((l, i) => ({ l, i })).sort((a, b) => Number(a.l) - Number(b.l));
    const previousOrdered = prvOrder.map(o => prvValsRaw[o.i] ?? 0);

    // Säkerställ samma längd (pad/trunka om GA4 skulle sakna dagar)
    let previousData: number[];
    if (previousOrdered.length === currentData.length) {
      previousData = previousOrdered;
    } else if (previousOrdered.length > currentData.length) {
      previousData = previousOrdered.slice(-currentData.length);
    } else {
      const pad = Array(currentData.length - previousOrdered.length).fill(0);
      previousData = pad.concat(previousOrdered);
    }

    // Returnera med X-axel = nuvarande periodens datum
    return NextResponse.json({
      metric,
      labels,
      datasets: [
        { label: "Nuvarande period", data: currentData },
        { label: "Föregående period", data: previousData },
      ],
    });
  } catch (e: any) {
    console.error("series error:", e);
    return NextResponse.json({ error: e?.message || "series-fel" }, { status: 500 });
  }
}
