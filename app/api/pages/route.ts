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

function defaultRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 29);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: iso(start), endDate: iso(end) };
}

async function runPagesReport(startDate: string, endDate: string, limit = 10, offset = 0) {
  const c = client();

  const [rep] = await c.runReport({
    property: `properties/${PROPERTY_ID}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "pagePath" }],
    metrics: [
      { name: "screenPageViews" },
      { name: "totalUsers" },
      { name: "sessions" },
      { name: "averageSessionDuration" },
      { name: "conversions" },
    ],
    orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
    limit,
    offset,
  } as any);

  const rows = (rep.rows || []).map((r: any) => {
    const d = r.dimensionValues || [];
    const m = r.metricValues || [];
    const num = (x: any) => Number(x?.value || 0);
    return {
      pagePath: d[0]?.value || "(okänd)",
      screenPageViews: num(m[0]),
      totalUsers: num(m[1]),
      sessions: num(m[2]),
      averageSessionDuration: num(m[3]),
      conversions: num(m[4]),
    };
  });

  return { rows, totalRows: Number(rep.rowCount || rows.length) };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) || {};
    let { startDate, endDate, limit = 10, offset = 0 } = body;

    // Fallbacka datum om saknas eller tomma
    if (!startDate || !endDate) {
      const d = defaultRange();
      startDate = d.startDate;
      endDate = d.endDate;
    }

    const data = await runPagesReport(startDate, endDate, limit, offset);
    return NextResponse.json(data);
  } catch (e: any) {
    console.error("Pages API error:", e);
    return NextResponse.json({ error: e.message || "Okänt fel" }, { status: 500 });
  }
}

// Valfritt: stöd för GET vid manuell felsökning i browsern
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    let startDate = url.searchParams.get("startDate") || "";
    let endDate = url.searchParams.get("endDate") || "";
    const limit = Number(url.searchParams.get("limit") || 10);
    const offset = Number(url.searchParams.get("offset") || 0);

    if (!startDate || !endDate) {
      const d = defaultRange();
      startDate = d.startDate;
      endDate = d.endDate;
    }

    const data = await runPagesReport(startDate, endDate, limit, offset);
    return NextResponse.json(data);
  } catch (e: any) {
    console.error("Pages API GET error:", e);
    return NextResponse.json({ error: e.message || "Okänt fel" }, { status: 500 });
  }
}
