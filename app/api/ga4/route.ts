import { NextResponse } from "next/server";
import { BetaAnalyticsDataClient } from "@google-analytics/data";

const PROPERTY_ID = "314322245"; // hårdkodat

function client() {
  const client_email = process.env.GA4_CLIENT_EMAIL;
  const private_key = process.env.GA4_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!client_email || !private_key) throw new Error("Sätt GA4_CLIENT_EMAIL och GA4_PRIVATE_KEY i .env.local");
  return new BetaAnalyticsDataClient({ credentials: { client_email, private_key } });
}

export async function POST(req: Request) {
  try {
    const { startDate, endDate } = await req.json();
    if (!startDate || !endDate) return NextResponse.json({ error: "startDate och endDate krävs" }, { status: 400 });

    const ga = client();

    // KPI:er
    const [kpi] = await ga.runReport({
      property: `properties/${PROPERTY_ID}`,
      dateRanges: [{ startDate, endDate }],
      metrics: [
        { name: "sessions" },
        { name: "totalUsers" },
        { name: "averageSessionDuration" },
        { name: "conversions" },
      ],
    });

    const kpis = {
      sessions: Number(kpi.rows?.[0]?.metricValues?.[0]?.value || 0),
      users: Number(kpi.rows?.[0]?.metricValues?.[1]?.value || 0),
      averageSessionDuration: Number(kpi.rows?.[0]?.metricValues?.[2]?.value || 0),
      conversions: Number(kpi.rows?.[0]?.metricValues?.[3]?.value || 0),
    };

    // Sessions per dag (nu)
    const [nowRep] = await ga.runReport({
      property: `properties/${PROPERTY_ID}`,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ dimension: { dimensionName: "date" } }],
    });
    const labels = (nowRep.rows || []).map((r) => r.dimensionValues?.[0]?.value || "");
    const nowData = (nowRep.rows || []).map((r) => Number(r.metricValues?.[0]?.value || 0));

    // Föregående period (samma längd)
    const start = new Date(startDate), end = new Date(endDate);
    const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    const prevStart = new Date(start); prevStart.setDate(prevStart.getDate() - days);
    const prevEnd = new Date(end);     prevEnd.setDate(prevEnd.getDate() - days);

    const [prevRep] = await ga.runReport({
      property: `properties/${PROPERTY_ID}`,
      dateRanges: [{ startDate: prevStart.toISOString().slice(0,10), endDate: prevEnd.toISOString().slice(0,10) }],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ dimension: { dimensionName: "date" } }],
    });
    const prevData = (prevRep.rows || []).map((r) => Number(r.metricValues?.[0]?.value || 0));

    const chartData = {
      labels,
      datasets: [
        { label: "Nuvarande period", data: nowData, borderColor: "rgba(33, 150, 243, 1)", fill: false },
        { label: "Föregående period", data: prevData, borderColor: "rgba(158, 158, 158, 1)", borderDash: [6, 4], fill: false },
      ],
    };

    return NextResponse.json({ kpis, chartData });
  } catch (e: any) {
    console.error("GA4 error:", e);
    return NextResponse.json({ error: e.message || "GA4-fel" }, { status: 500 });
  }
}
