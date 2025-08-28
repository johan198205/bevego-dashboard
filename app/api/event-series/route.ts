// app/api/event-series/route.ts
import { NextResponse } from "next/server";
import { BetaAnalyticsDataClient } from "@google-analytics/data";

const PROPERTY_ID = process.env.GA4_PROPERTY_ID || "314322245";

function client() {
  const client_email = process.env.GA4_CLIENT_EMAIL;
  const rawKey = process.env.GA4_PRIVATE_KEY;
  
  if (!client_email || !rawKey) {
    throw new Error("Saknar GA4 creds: GA4_CLIENT_EMAIL / GA4_PRIVATE_KEY");
  }
  
  // Förbättrad hantering av privata nycklar
  let private_key = rawKey;
  
  // Hantera olika format av privata nycklar
  if (rawKey.includes("\\n")) {
    private_key = rawKey.replace(/\\n/g, "\n");
  } else if (rawKey.includes("-----BEGIN PRIVATE KEY-----") && !rawKey.includes("\n")) {
    // Om nyckeln är på en rad, lägg till radbrytningar
    private_key = rawKey.replace(/-----BEGIN PRIVATE KEY-----/, "-----BEGIN PRIVATE KEY-----\n")
                        .replace(/-----END PRIVATE KEY-----/, "\n-----END PRIVATE KEY-----")
                        .replace(/(.{64})/g, "$1\n")
                        .replace(/\n\n/g, "\n");
  }
  
  return new BetaAnalyticsDataClient({ credentials: { client_email, private_key } });
}

function daysBetween(a: string, b: string) {
  const da = new Date(a + "T00:00:00");
  const db = new Date(b + "T00:00:00");
  return Math.round((+db - +da) / 86400000) + 1; // inklusivt
}

function addDays(iso: string, add: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + add);
  return d.toISOString().slice(0, 10);
}

function dateList(start: string, end: string) {
  const n = daysBetween(start, end);
  const arr: string[] = [];
  for (let i = 0; i < n; i++) arr.push(addDays(start, i));
  return arr;
}

// YYYY-MM-DD -> YYYYMMDD
const ymd = (d: string) => d.replaceAll("-", "");

async function fetchEventDaily(
  c: BetaAnalyticsDataClient,
  startDate: string,
  endDate: string,
  eventName: string
) {
  const [rep] = await c.runReport({
    property: `properties/${PROPERTY_ID}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "date" }],
    metrics: [{ name: "eventCount" }],
    metricAggregations: ["TOTAL"],
    dimensionFilter: {
      filter: {
        fieldName: "eventName",
        stringFilter: { matchType: "EXACT", value: eventName, caseSensitive: false },
      },
    } as any,
    limit: 100000,
  } as any);

  const map = new Map<string, number>();
  for (const r of rep.rows ?? []) {
    const d = r.dimensionValues?.[0]?.value || "";
    const v = Number(r.metricValues?.[0]?.value || 0);
    map.set(d, v);
  }
  return map; // key: YYYYMMDD
}

export async function POST(req: Request) {
  try {
    const { startDate, endDate, eventName } = await req.json();
    if (!startDate || !endDate || !eventName)
      return NextResponse.json({ error: "startDate, endDate och eventName krävs" }, { status: 400 });

    const c = client();

    // Nuvarande period
    const curMap = await fetchEventDaily(c, startDate, endDate, eventName);

    // Föregående period (samma längd, direkt föregående)
    const len = daysBetween(startDate, endDate);
    const prevEnd = addDays(startDate, -1);
    const prevStart = addDays(prevEnd, -(len - 1));
    const prevMap = await fetchEventDaily(c, prevStart, prevEnd, eventName);

    // Labels = nuvarande period (YYYYMMDD)
    const labels = dateList(startDate, endDate).map(ymd);
    const curData = labels.map((d) => curMap.get(d) ?? 0);

    // Föregående: bygg samma antal punkter i kronologisk ordning
    const prevLabels = dateList(prevStart, prevEnd).map(ymd);
    const prevData = prevLabels.map((d) => prevMap.get(d) ?? 0);

    return NextResponse.json({
      labels,
      datasets: [
        { label: "Nuvarande period", data: curData },
        { label: "Föregående period", data: prevData },
      ],
    });
  } catch (e: any) {
    console.error("event-series error:", e);
    return NextResponse.json({ error: e.message || "event-series-fel" }, { status: 500 });
  }
}
