// app/api/events/route.ts
import { NextResponse } from "next/server";
import { BetaAnalyticsDataClient } from "@google-analytics/data";

const PROPERTY_ID = process.env.GA4_PROPERTY_ID || "314322245";

function client() {
  const client_email = process.env.GA4_CLIENT_EMAIL as string;
  const rawKey = process.env.GA4_PRIVATE_KEY as string;
  if (!client_email || !rawKey) throw new Error("Saknar GA4 creds: GA4_CLIENT_EMAIL / GA4_PRIVATE_KEY");
  const private_key = rawKey.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;
  return new BetaAnalyticsDataClient({ credentials: { client_email, private_key } });
}

function defaultRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 29);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: iso(start), endDate: iso(end) };
}

// Normalisera för å/ä/ö, bindestreck, mellanslag etc
function norm(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

type MatchStrategy = "exact" | "normalized" | "partial";

async function runEventReport(
  c: BetaAnalyticsDataClient,
  {
    startDate,
    endDate,
    eventName,
    params = [],
    filters = {},
    limit = 50,
    offset = 0,
    strategy = "exact",
  }: {
    startDate: string;
    endDate: string;
    eventName?: string;
    params?: string[];
    filters?: Record<string, string>;
    limit?: number;
    offset?: number;
    strategy?: MatchStrategy;
  }
) {
  const dimensions = [{ name: "eventName" }, ...params.map((p) => ({ name: `customEvent:${p}` }))];

  const andExpressions: any[] = [];
  if (eventName) {
    const stringFilter =
      strategy === "partial"
        ? { matchType: "PARTIAL", value: eventName, caseSensitive: false }
        : { matchType: "EXACT", value: eventName, caseSensitive: false };
    andExpressions.push({ filter: { fieldName: "eventName", stringFilter } });
  }
  for (const [k, v] of Object.entries(filters || {})) {
    andExpressions.push({
      filter: {
        fieldName: `customEvent:${k}`,
        stringFilter: { matchType: "EXACT", value: String(v), caseSensitive: false },
      },
    });
  }

  const [rep] = await c.runReport({
    property: `properties/${PROPERTY_ID}`,
    dateRanges: [{ startDate, endDate }],
    dimensions,
    metrics: [{ name: "eventCount" }],
    // 🔑 Be om totals så rep.totals fylls
    metricAggregations: ["TOTAL"],
    ...(andExpressions.length ? { dimensionFilter: { andGroup: { expressions: andExpressions } } } : {}),
    orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
    limit,
    offset,
  } as any);

  const rows =
    (rep.rows || []).map((r: any) => {
      const d = r.dimensionValues || [];
      const m = r.metricValues || [];
      const out: any = { eventName: d[0]?.value || "", eventCount: Number(m[0]?.value || 0) };
      params.forEach((p, idx) => (out[p] = d[idx + 1]?.value ?? ""));
      return out;
    }) ?? [];

  // 🔒 Robust: använd totals om de finns, annars summera raderna
  const totalFromTotals = Number(rep.totals?.[0]?.metricValues?.[0]?.value ?? 0);
  const totalFromRows = rows.reduce((s, r) => s + (Number(r.eventCount) || 0), 0);
  const totalEventCount = totalFromTotals || totalFromRows;

  const rowCount = Number(rep.rowCount || rows.length);
  return { rows, totalEventCount, rowCount };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) || {};
    let {
      startDate,
      endDate,
      eventName,
      params = [] as string[],
      filters = {} as Record<string, string>,
      limit = 50,
      offset = 0,
    } = body;

    if (!startDate || !endDate) ({ startDate, endDate } = defaultRange());
    if (!eventName) return NextResponse.json({ error: "eventName krävs" }, { status: 400 });

    const c = client();

    // 1) EXACT (case-insensitive)
    let resolvedEventName: string | undefined = eventName;
    let matchStrategy: MatchStrategy = "exact";
    let { rows, totalEventCount, rowCount } = await runEventReport(c, {
      startDate,
      endDate,
      eventName,
      params,
      filters,
      limit,
      offset,
      strategy: "exact",
    });

    // 2) Om 0 → discovery + normalized exact/contains
    let candidates: { eventName: string; eventCount: number }[] = [];
    if (!totalEventCount) {
      const disc = await runEventReport(c, {
        startDate,
        endDate,
        params: [],
        filters: {},
        limit: 400,
        offset: 0,
      });
      candidates = disc.rows.map((r) => ({ eventName: r.eventName, eventCount: r.eventCount }));

      const want = norm(eventName);
      const hit =
        candidates.find((cnd) => norm(cnd.eventName) === want) ||
        candidates.find((cnd) => norm(cnd.eventName).includes(want)) ||
        candidates.find((cnd) => want.includes(norm(cnd.eventName)));

      if (hit) {
        resolvedEventName = hit.eventName;
        matchStrategy = "normalized";
        const rerun = await runEventReport(c, {
          startDate,
          endDate,
          eventName: hit.eventName,
          params,
          filters,
          limit,
          offset,
          strategy: "exact",
        });
        rows = rerun.rows;
        totalEventCount = rerun.totalEventCount;
        rowCount = rerun.rowCount;
      }
    }

    // 3) Om 0 fortfarande → PARTIAL på eventName
    if (!totalEventCount) {
      matchStrategy = "partial";
      const partial = await runEventReport(c, {
        startDate,
        endDate,
        eventName,
        params,
        filters,
        limit,
        offset,
        strategy: "partial",
      });
      rows = partial.rows;
      totalEventCount = partial.totalEventCount;
      rowCount = partial.rowCount;
      if (rows.length > 0) resolvedEventName = rows[0].eventName;
    }

    return NextResponse.json({
      startDate,
      endDate,
      eventName,
      resolvedEventName,
      matchStrategy,
      rows,
      totalEventCount,
      rowCount,
      candidates, // för felsökning vid behov
    });
  } catch (e: any) {
    console.error("Events API error:", e);
    return NextResponse.json({ error: e.message || "Okänt fel" }, { status: 500 });
  }
}
