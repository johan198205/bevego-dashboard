// lib/ga4.ts
import { BetaAnalyticsDataClient } from "@google-analytics/data";

const PROPERTY_ID = process.env.GA4_PROPERTY_ID || "314322245";

function client() {
  const client_email = process.env.GA4_CLIENT_EMAIL!;
  const rawKey = process.env.GA4_PRIVATE_KEY!;
  const private_key = rawKey.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;
  return new BetaAnalyticsDataClient({ credentials: { client_email, private_key } });
}

export type MKey = "sessions" | "totalUsers" | "conversions" | "averageSessionDuration";
export const ALL_KEYS: MKey[] = ["sessions","totalUsers","conversions","averageSessionDuration"];

export async function fetchKpis(startDate: string, endDate: string, keys: MKey[]) {
  const c = client();
  const [rep] = await c.runReport({
    property: `properties/${PROPERTY_ID}`,
    dateRanges: [{ startDate, endDate }],
    metrics: keys.map((k) => ({ name: k })),
  } as any);
  const vals = (rep.rows?.[0]?.metricValues || []).map((m:any) => Number(m.value||0));
  const out: Record<MKey, number> = { sessions:0,totalUsers:0,conversions:0,averageSessionDuration:0 };
  keys.forEach((k,i)=> out[k]=vals[i]||0);
  return out;
}

export async function fetchTimeseries(startDate: string, endDate: string, keys: MKey[]) {
  const c = client();
  const [rep] = await c.runReport({
    property: `properties/${PROPERTY_ID}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "date" }],
    metrics: keys.map((k)=>({ name:k })),
  } as any);
  const rows = rep.rows||[];
  const labels = rows.map((r:any)=> r.dimensionValues?.[0]?.value);
  const series: Record<MKey, number[]> = { sessions:[], totalUsers:[], conversions:[], averageSessionDuration:[] };
  keys.forEach((k, i) => { series[k] = rows.map((r:any)=> Number(r.metricValues?.[i]?.value||0)); });
  return { labels, series };
}

export async function fetchWeekdayAverages(endDateISO: string, keys: MKey[], weeks=8) {
  const c = client();
  const end = new Date(endDateISO);
  const start = new Date(end);
  start.setDate(end.getDate() - weeks*7);
  const toISO = (d:Date)=> d.toISOString().slice(0,10);

  const [rep] = await c.runReport({
    property: `properties/${PROPERTY_ID}`,
    dateRanges: [{ startDate: toISO(start), endDate: toISO(end) }],
    dimensions: [{ name: "dayOfWeek" }],
    metrics: keys.map((k)=>({ name:k })),
  } as any);

  const acc: Record<number, Record<MKey, {sum:number, n:number}>> = {};
  (rep.rows||[]).forEach((r:any)=>{
    const d = Number(r.dimensionValues?.[0]?.value||-1);
    if (!(d in acc)) acc[d] = { sessions:{sum:0,n:0}, totalUsers:{sum:0,n:0}, conversions:{sum:0,n:0}, averageSessionDuration:{sum:0,n:0} } as any;
    keys.forEach((k,i)=>{
      acc[d][k].sum += Number(r.metricValues?.[i]?.value||0);
      acc[d][k].n += 1;
    });
  });

  const out: Record<number, Record<MKey, number>> = {};
  Object.keys(acc).forEach((dStr)=>{
    const d = Number(dStr);
    out[d] = { sessions:0,totalUsers:0,conversions:0,averageSessionDuration:0 };
    keys.forEach((k)=> { const {sum,n} = acc[d][k]; out[d][k] = n? Math.round(sum/n):0; });
  });
  return out;
}

export async function fetchCompareDates(dateA: string, dateB: string, keys: MKey[]) {
  const c = client();
  const q = async (d:string)=>{
    const [rep] = await c.runReport({
      property: `properties/${PROPERTY_ID}`,
      dateRanges: [{ startDate: d, endDate: d }],
      metrics: keys.map((k)=>({ name:k })),
    } as any);
    const vals = (rep.rows?.[0]?.metricValues||[]).map((m:any)=> Number(m.value||0));
    const out: Record<MKey, number> = { sessions:0,totalUsers:0,conversions:0,averageSessionDuration:0 };
    keys.forEach((k,i)=> out[k]=vals[i]||0);
    return out;
  };
  const A = await q(dateA);
  const B = await q(dateB);
  return { A, B };
}

export async function fetchChannelBreakdown(startDate: string, endDate: string, keys: MKey[] = ALL_KEYS) {
  const c = client();
  const [rep] = await c.runReport({
    property: `properties/${PROPERTY_ID}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "sessionDefaultChannelGroup" }], // var trafiken kommer från
    metrics: keys.map((k) => ({ name: k })),
    orderBys: [{ metric: { metricName: keys[0] }, desc: true }],
  } as any);

  const rows = rep.rows || [];
  const out = rows.map((r: any) => {
    const channel = r.dimensionValues?.[0]?.value || "(okänd)";
    const obj: any = { channel };
    keys.forEach((k, i) => (obj[k] = Number(r.metricValues?.[i]?.value || 0)));
    return obj as { channel: string } & Record<MKey, number>;
  });

  // totals + shares
  const totals: Record<MKey, number> = { sessions: 0, totalUsers: 0, conversions: 0, averageSessionDuration: 0 };
  out.forEach((r) => keys.forEach((k) => (totals[k] += r[k])));
  const withShare = out.map((r) => {
    const share: Record<MKey, number> = { sessions: 0, totalUsers: 0, conversions: 0, averageSessionDuration: 0 };
    keys.forEach((k) => {
      share[k] = totals[k] ? r[k] / totals[k] : 0;
    });
    return { ...r, share };
  });

  return { rows: withShare, totals };
}
