// components/DataChat.tsx
"use client";

import React, { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Line, Doughnut } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Tooltip, Legend);

type Msg = { role: "user" | "assistant"; content: string };

type ChartSpec = {
  title: string;
  type: "line" | "doughnut";
  labels: string[];
  datasets: { label: string; data: number[] }[];
};

type TableSpec = { title: string; columns: string[]; rows: string[][] };

type AssistantResp = { answerMarkdown: string; charts?: ChartSpec[]; tables?: TableSpec[] };

const LS_KEY = "ga4_chat_thread_v1";

// === Snabbfrågor ===
const TOP_QUESTIONS = [
  "Vilken kanal gav flest konverteringar?",
  "När hade vi mest trafik senaste månaden?",
  "Vilka sidor presterar sämst?",
];

// Frågebibliotek för sidebaren (20 st), anpassade för våra verktyg/data
const MORE_QUESTIONS: string[] = [
  // Kanaler
  "Visa kanal-mixen (andel sessioner per kanal).",
  "Vilken kanal har högst konverteringsgrad?",
  "Vilka kanaler växer snabbast senaste 30 dagarna?",
  "Vilka kanaler har längst genomsnittlig sessionstid?",
  "Vilka kanaler står för flest användare?",
  // Sidor
  "Vilka sidor hade flest visningar?",
  "Vilka sidor drev flest konverteringar?",
  "Vilka sidor har kortast genomsnittlig sessionstid?",
  "Vilka sidor presterar sämst?",
  "Visa populäraste sidorna.",
  // KPI & tidsserier
  "Visa nyckeltal senaste 30 dagarna (sessioner, användare, konverteringar).",
  "Hur ser trenden för sessioner ut senaste 30 dagarna?",
  "När var trafiktoppen senaste 30 dagarna?",
  "Hur har konverteringar utvecklats dag för dag senaste månaden?",
  // Veckodagar och jämförelser
  "Vilka veckodagar ger flest konverteringar?",
  "Vilken veckodag har högst snittsession?",
  "Jämför igår mot samma dag förra veckan (sessioner och konverteringar).",
  "Jämför senaste 7 dagarna mot föregående 7 (sessioner och konverteringar).",
  // Övrigt analysstöd
  "Vilka kanaler driver flest nya användare?",
  "Vilka sidor bör vi förbättra först för fler konverteringar?",
];

export default function DataChat({
  defaultContext,
}: {
  defaultContext?: { startDate?: string; endDate?: string };
}) {
  const [thread, setThread] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<AssistantResp | null>(null);
  const [error, setError] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);

  // load/save thread
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved) setThread(JSON.parse(saved));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(thread));
    } catch {}
  }, [thread]);

  // Close drawer on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Palett till diagram
  const palette = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#14b8a6", "#f97316"];

  // Skicka – kan ta override så snabbfrågor kör direkt
  async function send(qOverride?: string) {
    const q = (qOverride ?? input).trim();
    if (!q) return;

    // Trådkontroll
    const threadForApi = thread.slice(-12);
    const nextThread = [...thread, { role: "user" as const, content: q }];
    setThread(nextThread);
    setBusy(true);
    setError("");
    setLast(null);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q, thread: threadForApi, context: defaultContext }),
      });

      const ct = res.headers.get("content-type") || "";
      const data: AssistantResp | any = ct.includes("application/json")
        ? await res.json()
        : { error: await res.text() };

      if (!res.ok || data.error) throw new Error(data.error || "Kunde inte få svar från assistenten.");

      setLast(data);
      // lägg in assistentens markdown i tråden
      setThread((c) => [...c, { role: "assistant", content: data.answerMarkdown }]);
    } catch (e: any) {
      setError(e.message || "Fel i analysen");
    } finally {
      setBusy(false);
      // rensa input bara om det var en snabbfråga (override)
      if (qOverride) setInput("");
    }
  }

  // Hjälpare för snabbfråge-klick
  function ask(q: string) {
    if (busy) return;
    setInput(q);
    setDrawerOpen(false);
    // kör direkt utan att kräva “Skicka”
    send(q);
  }

  return (
    <>
      <div className="card modern-card" style={{ padding: 16, position: "relative", overflow: "hidden" }}>
        <h2 style={{ fontWeight: 700, marginBottom: 12 }}>Fråga datan</h2>

        {/* Snabbfrågor + Fler frågor-länk */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          {TOP_QUESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => ask(q)}
              disabled={busy}
              className="chip-black"
              title={q}
            >
              {q}
            </button>
          ))}
          <button
            type="button"
            className="link-more"
            onClick={() => setDrawerOpen(true)}
            disabled={busy}
            aria-haspopup="dialog"
            aria-expanded={drawerOpen}
          >
            Fler frågor
          </button>
        </div>

        {/* Input + Skicka (behövs endast för egna frågor) */}
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ex: Vilka kanaler driver flest konverteringar senaste 30 dagarna?"
            style={{
              flex: 1,
              height: 40,
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: "0 12px",
            }}
          />
          <button className="btn" onClick={() => send()} disabled={busy}>
            {busy ? "Analyserar..." : "Skicka"}
          </button>
        </div>

        {error && (
          <div style={{ color: "#b91c1c", marginTop: 12 }}>
            {error}
          </div>
        )}

        {/* Svarsyta */}
        <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
          {thread.map((m, i) => (
            <div
              key={i}
              className="card"
              style={{ padding: 12, background: m.role === "user" ? "#f9fafb" : "#fff" }}
            >
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>
                {m.role === "user" ? "Du" : "Assist:"}
              </div>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
            </div>
          ))}

          {/* Diagram */}
          {last?.charts?.map((c, idx) => {
            if (c.type === "doughnut") {
              const bg = c.labels.map((_, i) => `${palette[i % palette.length]}cc`);
              const border = c.labels.map((_, i) => `${palette[i % palette.length]}`);
              const data = {
                labels: c.labels,
                datasets: c.datasets.map((d) => ({
                  ...d,
                  backgroundColor: bg,
                  borderColor: border,
                  borderWidth: 1,
                })),
              };
              return (
                <div key={`chart-${idx}`} className="card modern-card" style={{ padding: 16 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>{c.title}</div>
                  <div style={{ height: 320 }}>
                    <Doughnut
                      data={data}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: { position: "right", labels: { usePointStyle: true, boxWidth: 8 } },
                          tooltip: { cornerRadius: 8, padding: 10, displayColors: true },
                        },
                      }}
                    />
                  </div>
                </div>
              );
            }

            // Line
            const datasets = c.datasets.map((d, i) => {
              const color = palette[i % palette.length];
              return {
                ...d,
                borderColor: color,
                backgroundColor: `${color}33`,
                fill: true,
                tension: 0.35,
                borderWidth: 2.5,
                pointRadius: 2,
                pointHoverRadius: 4,
                pointBorderWidth: 0,
              };
            });

            return (
              <div key={`chart-${idx}`} className="card modern-card" style={{ padding: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>{c.title}</div>
                <div style={{ height: 320 }}>
                  <Line
                    data={{ labels: c.labels, datasets }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      interaction: { mode: "index", intersect: false },
                      plugins: {
                        legend: { position: "top", labels: { usePointStyle: true, boxWidth: 8 } },
                        tooltip: { cornerRadius: 8, padding: 10, displayColors: true },
                      },
                      scales: {
                        x: { grid: { color: "#f1f5f9" }, ticks: { maxRotation: 0 } },
                        y: { beginAtZero: true, grid: { color: "#f1f5f9" } },
                      },
                      elements: { line: { borderCapStyle: "round" } },
                    }}
                  />
                </div>
              </div>
            );
          })}

          {/* Tabeller */}
          {last?.tables?.map((t, idx) => (
            <div key={`table-${idx}`} className="card modern-card table-wrap" style={{ padding: 0 }}>
              <div style={{ padding: "12px 16px", fontWeight: 700 }}>{t.title}</div>
              <table>
                <thead>
                  <tr>
                    {t.columns.map((h, i) => (
                      <th key={i}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {t.rows.map((r, ri) => (
                    <tr key={ri}>
                      {r.map((cell, ci) => (
                        <td key={ci}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        {/* Styles */}
        <style jsx global>{`
          .btn {
            background: #111827;
            color: white;
            border: 0;
            border-radius: 10px;
            height: 40px;
            padding: 0 14px;
            cursor: pointer;
          }
          .btn:disabled { opacity: 0.6; cursor: not-allowed; }

          .chip-black {
            background: #111827;
            color: #fff;
            border: 1px solid #111827;
            border-radius: 999px;
            padding: 6px 12px;
            font-size: 12px;
            line-height: 1;
            cursor: pointer;
          }
          .chip-black:disabled { opacity: 0.7; cursor: not-allowed; }

          .link-more {
            background: transparent;
            border: 0;
            color: #0ea5e9;
            cursor: pointer;
            padding: 6px 6px;
            font-size: 13px;
            text-decoration: underline;
          }

          .modern-card { border-radius: 16px !important; box-shadow: 0 6px 24px rgba(0,0,0,0.06); }

          .table-wrap { border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; }
          .table-wrap table { width: 100%; border-collapse: collapse; font-size: 14px; }
          .table-wrap thead th {
            background: #f8fafc; padding: 10px 12px; text-align: left; font-weight: 700;
            color: #475569; text-transform: uppercase; letter-spacing: .02em; border-bottom: 1px solid #e5e7eb;
          }
          .table-wrap tbody td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; }
          .table-wrap tbody tr:nth-child(even) { background: #fafafa; }
          .table-wrap tbody tr:hover { background: #f3f4f6; }

          /* Drawer / sidebar */
          .drawer-overlay {
            position: fixed; inset: 0; background: rgba(15, 23, 42, 0.35);
            display: flex; justify-content: flex-end; z-index: 60;
          }
          .drawer-panel {
            width: 360px; max-width: 90vw; height: 100%;
            background: #ffffff; box-shadow: -12px 0 24px rgba(0,0,0,0.08);
            display: flex; flex-direction: column;
          }
          .drawer-header {
            padding: 14px 16px; border-bottom: 1px solid #e5e7eb;
            display: flex; align-items: center; justify-content: space-between;
          }
          .drawer-title { font-weight: 700; }
          .drawer-body { padding: 12px; overflow: auto; display: grid; gap: 8px; }
          .q-item {
            text-align: left; border: 1px solid #e5e7eb; border-radius: 10px;
            background: #fff; padding: 10px 12px; font-size: 13px; cursor: pointer;
          }
          .q-item:hover { background: #f8fafc; }
          .close-btn {
            background: transparent; border: 0; font-size: 20px; line-height: 1; cursor: pointer; color: #64748b;
          }
        `}</style>
      </div>

      {/* Drawer */}
      {drawerOpen && (
        <div className="drawer-overlay" onClick={() => setDrawerOpen(false)} aria-hidden="true">
          <div className="drawer-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="drawer-header">
              <div className="drawer-title">Fler frågor</div>
              <button className="close-btn" onClick={() => setDrawerOpen(false)} aria-label="Stäng">×</button>
            </div>
            <div className="drawer-body">
              {MORE_QUESTIONS.map((q, i) => (
                <button key={i} className="q-item" onClick={() => ask(q)} disabled={busy} title={q}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
