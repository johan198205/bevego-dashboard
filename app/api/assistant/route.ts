// app/api/assistant/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import {
  fetchKpis,
  fetchTimeseries,
  fetchCompareDates,
  fetchWeekdayAverages,
  fetchChannelBreakdown,
  ALL_KEYS,
  type MKey,
} from "../../../lib/ga4";

/* ───────────────────────── Hjälpare / intents ───────────────────────── */

function defaultRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 29); // 30 dagar
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: iso(start), endDate: iso(end) };
}

function isPagesIntent(q: string) {
  const s = (q || "").toLowerCase();
  return /(sidor|landningssidor|pages?|page\s*path|vilka sidor|sida presterar|populäraste sidor|sämsta sidor)/i.test(s);
}

function isEhandelAnsokIntent(q: string) {
  const s = (q || "").toLowerCase();
  return /(e-?handelskonto|ansö(k|kn)ing(ar)?|ehandel_ansok|kontoansökan)/i.test(s);
}

function fmtDur(sec: number) {
  if (!sec || sec <= 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
const pretty = (n: number) => (Number(n) as any)?.toLocaleString?.() ?? String(n);

/* ───────────────────────── Typer för tool-svar ───────────────────────── */

type ToolResult =
  | { type: "kpis"; data: Record<MKey, number> }
  | { type: "timeseries"; data: { labels: string[]; series: Record<MKey, number[]> } }
  | { type: "weekdayAverages"; data: Record<number, Record<MKey, number>> }
  | { type: "compareDates"; data: { A: Record<MKey, number>; B: Record<MKey, number> } }
  | {
      type: "channelBreakdown";
      data: {
        rows: Array<{ channel: string } & Record<MKey, number> & { share: Record<MKey, number> }>;
        totals: Record<MKey, number>;
      };
    };

/* ───────────────────────── Verktygsdeklaration ───────────────────────── */

const tools: any[] = [
  {
    type: "function",
    function: {
      name: "fetchKpis",
      description: "Get aggregated KPIs for a date range",
      parameters: {
        type: "object",
        properties: {
          startDate: { type: "string" },
          endDate: { type: "string" },
          metrics: { type: "array", items: { type: "string", enum: ALL_KEYS } },
        },
        required: ["startDate", "endDate", "metrics"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetchTimeseries",
      description: "Get per-day time series for metrics",
      parameters: {
        type: "object",
        properties: {
          startDate: { type: "string" },
          endDate: { type: "string" },
          metrics: { type: "array", items: { type: "string", enum: ALL_KEYS } },
        },
        required: ["startDate", "endDate", "metrics"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetchWeekdayAverages",
      description: "Get weekday averages for metrics over the last N weeks",
      parameters: {
        type: "object",
        properties: {
          endDate: { type: "string" },
          metrics: { type: "array", items: { type: "string", enum: ALL_KEYS } },
          weeks: { type: "number", default: 8 },
        },
        required: ["endDate", "metrics"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetchCompareDates",
      description: "Compare two specific dates on the same metrics",
      parameters: {
        type: "object",
        properties: {
          dateA: { type: "string" },
          dateB: { type: "string" },
          metrics: { type: "array", items: { type: "string", enum: ALL_KEYS } },
        },
        required: ["dateA", "dateB", "metrics"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetchChannelBreakdown",
      description: "Get sessionDefaultChannelGroup breakdown for a date range, with metrics.",
      parameters: {
        type: "object",
        properties: {
          startDate: { type: "string" },
          endDate: { type: "string" },
          metrics: { type: "array", items: { type: "string", enum: ALL_KEYS } },
        },
        required: ["startDate", "endDate"],
      },
    },
  },
];

/* ───────────────────────── Diverse ───────────────────────── */

function styleSeedFrom(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/* ───────────────────────── Route handler ───────────────────────── */

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { message, thread = [], context } = (body || {}) as {
      message: string;
      thread?: { role: "user" | "assistant"; content: string }[];
      context?: { startDate?: string; endDate?: string };
    };

    if (!message) return NextResponse.json({ error: "message saknas" }, { status: 400 });

    // Datumintervall (fallback: senaste 30 dagar)
    const { startDate, endDate } = {
      startDate: context?.startDate || defaultRange().startDate,
      endDate: context?.endDate || defaultRange().endDate,
    };

    /* ── Intent 1: Sidor → hämta från /api/pages ───────────────────── */
    if (isPagesIntent(message)) {
      const origin = new URL(req.url).origin;
      const pagesRes = await fetch(`${origin}/api/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate, limit: 100, offset: 0 }),
      });
      const pages = await pagesRes.json();

      if (!pagesRes.ok || pages?.error) {
        const err = pages?.error || "Kunde inte hämta sidor";
        return NextResponse.json({ answerMarkdown: `Fel: ${err}` }, { status: 200 });
      }

      type PageRow = {
        pagePath: string;
        screenPageViews: number;
        totalUsers: number;
        sessions: number;
        averageSessionDuration: number;
        conversions: number;
      };
      const rows: PageRow[] = pages.rows || [];

      const worstByConv = [...rows].sort((a, b) => (a.conversions || 0) - (b.conversions || 0)).slice(0, 5);
      const worstBySess = [...rows].sort((a, b) => (a.sessions || 0) - (b.sessions || 0)).slice(0, 5);
      const topByViews = rows.slice(0, 5);

      const answerMarkdown = [
        `### Sidor – sammanfattning (${startDate} – ${endDate})`,
        ``,
        `**Populäraste (visningar):**`,
        ...topByViews.map(
          (r, i) =>
            `${i + 1}. \`${r.pagePath}\` — ${pretty(r.screenPageViews)} visningar, ${pretty(
              r.conversions
            )} konverteringar (snitt ${fmtDur(r.averageSessionDuration)})`
        ),
        ``,
        `**Lägst konverteringar:**`,
        ...worstByConv.map(
          (r, i) =>
            `${i + 1}. \`${r.pagePath}\` — ${pretty(r.conversions)} konverteringar, ${pretty(r.sessions)} sessioner`
        ),
        ``,
        `**Lägst sessioner:**`,
        ...worstBySess.map(
          (r, i) => `${i + 1}. \`${r.pagePath}\` — ${pretty(r.sessions)} sessioner, ${pretty(r.conversions)} konverteringar`
        ),
      ].join("\n");

      const table = {
        title: `Populäraste sidor (${startDate} – ${endDate})`,
        columns: ["Sida", "Visningar", "Användare", "Sessioner", "Snittsession", "Konverteringar"],
        rows: rows.map((r) => [
          r.pagePath,
          pretty(r.screenPageViews),
          pretty(r.totalUsers),
          pretty(r.sessions),
          fmtDur(r.averageSessionDuration),
          pretty(r.conversions),
        ]),
      };

      return NextResponse.json({ answerMarkdown, tables: [table] }, { status: 200 });
    }

    /* ── Intent 2: Ansökningar e-handelskonto → /api/events ────────── */
    if (isEhandelAnsokIntent(message)) {
      const origin = new URL(req.url).origin;
      const evRes = await fetch(`${origin}/api/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate, eventName: "ehandel_ansok" }),
      });
      const data = await evRes.json();

      if (!evRes.ok || data?.error) {
        const err = data?.error || "Kunde inte hämta ansökningar";
        return NextResponse.json({ answerMarkdown: `Fel: ${err}` }, { status: 200 });
      }

      const total = Number(data?.totalEventCount ?? 0);
      const answerMarkdown =
        `### Antal ansökningar om e-handelskonto\n\n` +
        `**${total.toLocaleString()}** under perioden ${startDate} – ${endDate}.\n\n` +
        `**Åtgärd:** Fortsätt driva källor som ger hög ansökningsvolym och analysera event-parametrar för optimering.`;

      const table = {
        title: `Ansökningar (${startDate} – ${endDate})`,
        columns: ["Event", "Antal"],
        rows: [["ehandel_ansok", total.toLocaleString()]],
      };

      return NextResponse.json({ answerMarkdown, tables: [table] }, { status: 200 });
    }

    /* ── Alla andra frågor: ditt ursprungliga OpenAI + tools-flöde ──── */

    if (!process.env.OPENAI_API_KEY)
      return NextResponse.json({ error: "OPENAI_API_KEY saknas" }, { status: 500 });

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const threadLimited = (thread || []).slice(-16);
    const styleSeed = styleSeedFrom(message + (context?.startDate || "") + (context?.endDate || ""));

    const messages: any[] = [
      {
        role: "system",
        content:
          "Du är en GA4-analytiker. Du får använda verktyg (functions) och får endast använda siffror från verktygsresultat. Variera stilen (kort, punktlista, Q&A, Insikt→Åtgärd). Svara på svenska, kompakt, utan fluff. Avsluta med 1–3 konkreta åtgärder.",
      },
      ...threadLimited,
      { role: "user", content: JSON.stringify({ message, context: { startDate, endDate } }) },
    ];

    // Pass 1: plan + ev. tool calls
    let comp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.6 + ((styleSeed % 10) / 100),
      messages,
      tools,
      tool_choice: "auto",
    });

    const toolResults: Record<string, ToolResult> = {};
    while (comp.choices[0].message.tool_calls?.length) {
      for (const call of comp.choices[0].message.tool_calls) {
        const args = JSON.parse(call.function.arguments || "{}");
        let result: ToolResult | null = null;

        switch (call.function.name) {
          case "fetchKpis":
            result = { type: "kpis", data: await fetchKpis(args.startDate, args.endDate, args.metrics as MKey[]) };
            break;
          case "fetchTimeseries":
            result = { type: "timeseries", data: await fetchTimeseries(args.startDate, args.endDate, args.metrics as MKey[]) };
            break;
          case "fetchWeekdayAverages":
            result = {
              type: "weekdayAverages",
              data: await fetchWeekdayAverages(args.endDate, args.metrics as MKey[], args.weeks || 8),
            };
            break;
          case "fetchCompareDates":
            result = { type: "compareDates", data: await fetchCompareDates(args.dateA, args.dateB, args.metrics as MKey[]) };
            break;
          case "fetchChannelBreakdown":
            result = {
              type: "channelBreakdown",
              data: await fetchChannelBreakdown(
                args.startDate,
                args.endDate,
                (args.metrics?.length ? args.metrics : ALL_KEYS) as MKey[]
              ),
            };
            break;
        }
        toolResults[call.id] = result!;
      }

      const toolMsgs = comp.choices[0].message.tool_calls.map((call) => ({
        role: "tool" as const,
        tool_call_id: call.id,
        content: JSON.stringify(toolResults[call.id]),
      }));

      comp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.65 + ((styleSeed % 10) / 100),
        messages: [...messages, comp.choices[0].message, ...toolMsgs],
      });
    }

    const rawAnswer = comp.choices[0].message.content?.trim() || "";

    // Pass 2: strukturera till { answerMarkdown, charts, tables }
    const summarizer = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'Returnera JSON: {"answerMarkdown":string,"charts":[{"title":string,"type":"line|doughnut","labels":string[],"datasets":[{"label":string,"data":number[]}]}],"tables":[{"title":string,"columns":string[],"rows":string[][]}]}. Ändra inte siffror och inga extra fält.',
        },
        { role: "user", content: rawAnswer },
      ],
    });

    const payload =
      JSON.parse(summarizer.choices[0].message.content || "{}") ||
      { answerMarkdown: rawAnswer, charts: [], tables: [] };

    if (!payload.answerMarkdown) payload.answerMarkdown = rawAnswer;
    if (!payload.charts) payload.charts = [];
    if (!payload.tables) payload.tables = [];

    return NextResponse.json(payload);
  } catch (e: any) {
    console.error("assistant error:", e);
    return NextResponse.json({ error: e?.message || "assistant-fel" }, { status: 500 });
  }
}
