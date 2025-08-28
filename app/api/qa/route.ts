// app/api/qa/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { BetaAnalyticsDataClient } from "@google-analytics/data";

const PROPERTY_ID = "314322245";
const BUSINESS_CONTEXT = "B2B"; // kan påverka heuristik för helger m.m.

function ga() {
  const client_email = process.env.GA4_CLIENT_EMAIL;
  const private_key = process.env.GA4_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!client_email || !private_key) throw new Error("Saknar GA4 creds (.env.local).");
  return new BetaAnalyticsDataClient({ credentials: { client_email, private_key } });
}

type MKey = "sessions" | "totalUsers" | "conversions" | "averageSessionDuration";

const ALL_KEYS: MKey[] = ["sessions","totalUsers","conversions","averageSessionDuration"];

const METRIC_ALIASES: Record<string, MKey> = {
  sessioner:"sessions", sessions:"sessions", besök:"sessions", trafik:"sessions",
  användare:"totalUsers", users:"totalUsers", "unika användare":"totalUsers",
  konverteringar:"conversions", conversions:"conversions", mål:"conversions",
  "genomsnittlig sessionstid":"averageSessionDuration", sessionstid:"averageSessionDuration", "avg session":"averageSessionDuration",
};

const LABEL: Record<MKey,string> = {
  sessions: "Sessioner",
  totalUsers: "Användare",
  conversions: "Konverteringar",
  averageSessionDuration: "Genomsnittlig sessionstid (sek)"
};

const toISO = (d: Date) => d.toISOString().slice(0,10);
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
const weekdaySv = (d: Date) => d.toLocaleDateString("sv-SE", { weekday: "long" });

function rel(a: number, b: number) {
  if (!b) return a ? 1 : 0;
  return (a - b) / b;
}

function hashString(s: string) {
  let h = 0;
  for (let i=0;i<s.length;i++) h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  return Math.abs(h);
}

export async function POST(req: Request) {
  try {
    const { message, context } = await req.json() as {
      message: string;
      context?: { startDate?: string; endDate?: string; groupByDate?: boolean };
    };
    if (!message) return NextResponse.json({ error: "message saknas" }, { status: 400 });

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) return NextResponse.json({ error: "OPENAI_API_KEY saknas" }, { status: 500 });
    const openai = new OpenAI({ apiKey: openaiKey });

    // 1) Intent + metrics[] + datum + groupByDate
    const parseOut = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        { role: "system", content: `
Returnera strikt JSON. Inget annat.
Schema:
{
 "intent":"overview|anomaly_detection|compare_dates|trend|why_question|metric_specific",
 "metrics": "auto|list",    // "auto" = använd alla fyra; eller en array av strängar
 "metrics_list": ["sessions","totalUsers","conversions","averageSessionDuration"],
 "startDate":"YYYY-MM-DD|MM-DD|optional",
 "endDate":"YYYY-MM-DD|MM-DD|optional",
 "groupByDate": true|false
}
Regler:
- Om frågan är bred (t.ex. "analysera kontot", "hitta avvikelser"): intent=anomaly_detection och metrics="auto".
- Om frågan nämner specifika metriker: metrics_list sätts därefter.
- "Varför fler besökare en viss dag?" => intent=why_question, groupByDate=true.
- Om datum saknas, lämna tomt (client fyller med default).
` },
        { role: "user", content: message }
      ]
    });

    let raw = parseOut.choices?.[0]?.message?.content?.trim() || "{}";
    // nödfix om modellen råkar återge med ```json
    raw = raw.replace(/```json|```/g, "").trim();
    let ask: any = {};
    try { ask = JSON.parse(raw); } catch { ask = {}; }

    // Metrics
    let keys: MKey[] = [];
    if (ask.metrics === "auto" || !ask.metrics_list || ask.metrics_list.length === 0) {
      keys = ALL_KEYS;
    } else {
      keys = (ask.metrics_list as string[])
        .map(s => METRIC_ALIASES[s?.toLowerCase()?.trim()] || (ALL_KEYS as string[]).find(k => k === s))
        .filter(Boolean) as MKey[];
      if (keys.length === 0) keys = ALL_KEYS;
    }

    // Datum
    const today = new Date(); const yyyy = today.getFullYear();
    const ensureYear = (s: string) => /^\d{2}-\d{2}$/.test(s) ? `${yyyy}-${s}` : s;

    let startDate: string | undefined = ask.startDate;
    let endDate: string | undefined = ask.endDate;
    let groupByDate: boolean = !!ask.groupByDate;

    if (!startDate || !endDate) {
      if (context?.startDate && context?.endDate) {
        startDate = context.startDate; endDate = context.endDate;
        if (context.groupByDate !== undefined) groupByDate = !!context.groupByDate;
      } else {
        // default: senaste 30 dagar
        const end = new Date();
        const start = addDays(end, -29);
        startDate = toISO(start);
        endDate = toISO(end);
      }
    } else {
      startDate = ensureYear(startDate);
      endDate = ensureYear(endDate);
    }

    // Specialfall: why_question utan tydlig aggregation => visa per dag
    const intent: string = ask.intent || "overview";
    if (intent === "why_question") groupByDate = true;

    // 2) GA4
    const client = ga();

    // För nuvarande period
    const [nowRep] = await client.runReport({
      property: `properties/${PROPERTY_ID}`,
      dateRanges: [{ startDate, endDate }],
      metrics: keys.map(k => ({ name: k })),
      dimensions: groupByDate ? [{ name: "date" }] : [],
    } as any);

    // Föregående period (samma längd, direkt föregående)
    const start = new Date(startDate!);
    const end = new Date(endDate!);
    const days = Math.max(1, Math.ceil((end.getTime() - start.getTime())/86400000)+1);
    const prevEnd = addDays(start, -1);
    const prevStart = addDays(prevEnd, -(days-1));

    const [prevRep] = await client.runReport({
      property: `properties/${PROPERTY_ID}`,
      dateRanges: [{ startDate: toISO(prevStart), endDate: toISO(prevEnd) }],
      metrics: keys.map(k => ({ name: k })),
      dimensions: groupByDate ? [{ name: "date" }] : [],
    } as any);

    // 3) Aggregeringar
    const sumMetrics = (rows: any[]) => {
      const acc: Record<MKey, number> = { sessions:0,totalUsers:0,conversions:0,averageSessionDuration:0 };
      for (const r of (rows||[])) {
        keys.forEach((k, i) => {
          acc[k] += Number(r.metricValues?.[i]?.value || 0);
        });
      }
      return acc;
    };

    const rowsNow = nowRep.rows || [];
    const rowsPrev = prevRep.rows || [];
    const totalsNow = sumMetrics(rowsNow);
    const totalsPrev = sumMetrics(rowsPrev);

    const deltas: Record<MKey, number> = { sessions:0,totalUsers:0,conversions:0,averageSessionDuration:0 };
    keys.forEach(k => { deltas[k] = rel(totalsNow[k], totalsPrev[k]); });

    // 4) Single-day stöd + weekday-avg för förklaringar
    let single: null | {
      date: string; weekday: string; isWeekend: boolean;
      current: Record<MKey, number>;
      prevShift: Record<MKey, number>;
      weekdayAvg: Record<MKey, number>;
      deltaPrev: Record<MKey, number>;
      deltaWeekday: Record<MKey, number>;
    } = null;

    if (groupByDate && startDate === endDate) {
      const dateStr = rowsNow?.[0]?.dimensionValues?.[0]?.value || startDate!;
      const current: Record<MKey, number> = { sessions:0,totalUsers:0,conversions:0,averageSessionDuration:0 };
      keys.forEach((k,i) => current[k] = Number(rowsNow?.[0]?.metricValues?.[i]?.value || 0));

      // Föregående period, skiftad till samma index (d.v.s. gårdagens “motsvarande” dag i förra perioden)
      const prevVal: Record<MKey, number> = { sessions:0,totalUsers:0,conversions:0,averageSessionDuration:0 };
      if (rowsPrev?.[0]) keys.forEach((k,i)=> prevVal[k] = Number(rowsPrev[0].metricValues?.[i]?.value || 0));

      // Weekday-avg (8 v bakåt)
      const day = new Date(dateStr);
      const dow = day.getDay(); // 0=sön ... 6=lör
      const occ = 8;
      const weekdayAvg: Record<MKey, number> = { sessions:0,totalUsers:0,conversions:0,averageSessionDuration:0 };

      // Hämta 8 occurrences av samma veckodag (enkelt approx: de 8 föregående veckorna på samma veckodag)
      const start8 = addDays(day, -(7*occ) );
      const [dowRep] = await client.runReport({
        property: `properties/${PROPERTY_ID}`,
        dateRanges: [{ startDate: toISO(start8), endDate: toISO(addDays(day,-1)) }],
        metrics: keys.map(k => ({ name: k })),
        dimensions: [{ name: "date" }, { name: "dayOfWeek" }],
      } as any);

      // summera värden endast för samma dow
      const filtered = (dowRep.rows||[]).filter((r:any)=> Number(r.dimensionValues?.[1]?.value||-1) === dow);
      const sums: Record<MKey, number> = { sessions:0,totalUsers:0,conversions:0,averageSessionDuration:0 };
      filtered.forEach((r:any)=>{
        keys.forEach((k,i)=> { sums[k] += Number(r.metricValues?.[i]?.value || 0); });
      });
      keys.forEach(k => weekdayAvg[k] = filtered.length ? Math.round(sums[k]/filtered.length) : 0);

      const deltaPrev: Record<MKey, number> = { sessions:0,totalUsers:0,conversions:0,averageSessionDuration:0 };
      const deltaWeekday: Record<MKey, number> = { sessions:0,totalUsers:0,conversions:0,averageSessionDuration:0 };
      keys.forEach(k => {
        deltaPrev[k] = rel(current[k], prevVal[k]);
        deltaWeekday[k] = rel(current[k], weekdayAvg[k]);
      });

      single = {
        date: dateStr,
        weekday: weekdaySv(day),
        isWeekend: dow === 0 || dow === 6,
        current,
        prevShift: prevVal,
        weekdayAvg,
        deltaPrev,
        deltaWeekday
      };
    }

    // 5) “Anomaly severity” = max absolut delta över valda metriker
    const maxDelta = single
      ? Math.max(...keys.map(k => Math.abs(single!.deltaPrev[k])), ...keys.map(k => Math.abs(single!.deltaWeekday[k])))
      : Math.max(...keys.map(k => Math.abs(deltas[k])));

    // 6) Välj svarsmall (varierad stil)
    const styles = [
      { name: "kort", note: "Svara kort och koncist med 2–4 rader + 3 bullets." },
      { name: "punkt", note: "Svara primärt i punktlista. Hög signal, ingen fluff." },
      { name: "qa", note: "Svara som Q→A: 2–3 frågor följt av koncisa svar." },
      { name: "insikt→åtgärd", note: "Svara i formatet Insikter → Rekommenderade åtgärder." }
    ];
    const pick = styles[ hashString(message + (startDate||"") + (endDate||"")) % styles.length ];

    // 7) LLM-prompt med ALLA metriker
    const payload = {
      intent,
      businessContext: BUSINESS_CONTEXT,
      period: { startDate, endDate, groupByDate: !!groupByDate },
      metrics: keys,
      totals: { now: totalsNow, prev: totalsPrev, deltas },
      single,              // kan vara null
      severity: maxDelta,  // 0..1+
      question: message
    };

    const prompt = `
Skriv på svenska. Variera stilen enligt: "${pick.name}" (${pick.note}).
Fokusera endast på dessa metriker: ${keys.map(k=>LABEL[k]).join(", ")}.

Regler:
- Hitta avvikelser tvärs över metriker, inte bara sessioner.
- Om "why_question" och single-day: jämför både mot föregående period och veckodagssnitt.
- Ange siffror tydligt, och Δ i %. Ingen hittepå-data.
- Om helg och B2B: nämn att helger ofta är svagare (om relevant).
- Avsluta alltid med 1–3 **konkreta åtgärder**.

JSON (för analys):
${JSON.stringify(payload, null, 2)}
`;

    const out = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.65,
      messages: [
        { role: "system", content: "Var saklig, kompakt och datadriven. Svara i Markdown." },
        { role: "user", content: prompt },
      ],
    });

    const answer = out.choices?.[0]?.message?.content?.trim() || "";

    return NextResponse.json({
      answer,
      meta: {
        intent,
        metrics: keys,
        startDate, endDate, groupByDate,
        totals: { now: totalsNow, prev: totalsPrev, deltas },
        single,
        severity: maxDelta
      }
    });
  } catch (e: any) {
    console.error("QA error:", e);
    return NextResponse.json({ error: e?.message || "QA-fel" }, { status: 500 });
  }
}
