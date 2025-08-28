"use client";

import { useEffect, useMemo, useRef, useState, forwardRef } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from "chart.js";

import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import DataChat from "../components/DataChat";
import ChannelWidget from "../components/ChannelWidget";
import EventKpiCard from "../components/EventKpiCard";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

type Kpis = {
  sessions: number;
  users: number;
  averageSessionDuration: number;
  conversions: number;
};
type ChartPayload = {
  labels: string[];
  datasets: { label: string; data: number[] }[];
};
type MetricKey = "sessions" | "users" | "averageSessionDuration" | "conversions";

// ⬇️ Nytt: grafen kan visa metrik eller event-serie
type ChartMode =
  | { type: "metric"; key: MetricKey }
  | { type: "event"; eventName: string; label?: string };

export default function Page() {
  const [endDate, setEndDate] = useState(new Date());
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return d;
  });

  // ⬇️ Startläge: metrik "sessions"
  const [mode, setMode] = useState<ChartMode>({ type: "metric", key: "sessions" });

  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [chartDataRaw, setChartDataRaw] = useState<ChartPayload | null>(null);

  const [loading, setLoading] = useState(false);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [error, setError] = useState("");

  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  async function fetchData() {
    setLoading(true);
    setError("");
    setKpis(null);
    try {
      const res = await fetch("/api/ga4", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: fmt(startDate), endDate: fmt(endDate) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kunde inte hämta GA4-data.");
      setKpis({
        sessions: Number(data.kpis.sessions || 0),
        users: Number(data.kpis.users || 0),
        averageSessionDuration: Number(data.kpis.averageSessionDuration || 0),
        conversions: Number(data.kpis.conversions || 0),
      });
    } catch (e: any) {
      setError(e.message || "Fel vid hämtning av GA4.");
    } finally {
      setLoading(false);
    }
  }

  // ⬇️ Hämta tidsserie för vald mode (metrik eller event)
  async function fetchSeriesForMode(m: ChartMode) {
    setLoadingSeries(true);
    try {
      let res: Response;
      if (m.type === "metric") {
        res = await fetch("/api/series", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startDate: fmt(startDate), endDate: fmt(endDate), metric: m.key }),
        });
      } else {
        res = await fetch("/api/event-series", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startDate: fmt(startDate), endDate: fmt(endDate), eventName: m.eventName }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kunde inte hämta tidsserie.");
      setChartDataRaw(data);
    } catch (e: any) {
      setError(e.message || "Fel vid hämtning av tidsserie.");
    } finally {
      setLoadingSeries(false);
    }
  }

  // Init
  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    fetchSeriesForMode(mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(mode), startDate, endDate]);

  const prettyTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const css = (name: string, fallback: string) =>
    typeof window !== "undefined"
      ? (getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback)
      : fallback;

  const palette = ["#7c3aed", "#22d3ee"];

  const chartDataPrepared = useMemo(() => {
    if (!chartDataRaw) return null;
    const order = chartDataRaw.labels.map((l, i) => ({ l, i })).sort((a, b) => Number(a.l) - Number(b.l));
    const labels = order.map((o) => chartDataRaw.labels[o.i]);
    const datasetsOrdered = chartDataRaw.datasets.map((ds) => ({
      ...ds,
      data: order.map((o) => ds.data[o.i]),
    }));
    const datasets = datasetsOrdered.map((ds, i) => ({
      ...ds,
      borderColor: palette[i % palette.length],
      backgroundColor: `${palette[i % palette.length]}33`,
      fill: true,
      pointRadius: 2,
      pointHoverRadius: 4,
      tension: 0.35,
      borderWidth: 2.5,
    }));
    return { labels, datasets };
  }, [chartDataRaw]);

  const chartRef = useRef<any>(null);

  const DateBtn = forwardRef<HTMLButtonElement, any>(({ value, onClick }, ref) => (
    <button onClick={onClick} ref={ref} className="date-input">
      <span style={{ marginRight: 8 }}>📅</span>
      {value || "Välj datum"}
    </button>
  ));
  DateBtn.displayName = "DateBtn";

  const chartTitle =
    mode.type === "metric" ? metricLabel(mode.key) : (mode.label || "Ansökningar e-handelskonto");

  return (
    <div className="app">
      <Sidebar />
      <div className="content">
        <Topbar />
        <div className="container">
          {/* Kontroller */}
          <section className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>Start</div>
                <DatePicker
                  selected={startDate}
                  onChange={(d) => d && setStartDate(d)}
                  dateFormat="yyyy-MM-dd"
                  customInput={<DateBtn />}
                  calendarClassName="dp"
                  popperClassName="dp-popper"
                />
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>Slut</div>
                <DatePicker
                  selected={endDate}
                  onChange={(d) => d && setEndDate(d)}
                  dateFormat="yyyy-MM-dd"
                  customInput={<DateBtn />}
                  calendarClassName="dp"
                  popperClassName="dp-popper"
                />
              </div>
              <button
                className="btn"
                onClick={() => {
                  fetchData();
                  fetchSeriesForMode(mode);
                }}
                disabled={loading || loadingSeries}
              >
                {loading || loadingSeries ? "Laddar…" : "Uppdatera"}
              </button>
            </div>
          </section>

          {/* Fel */}
          {error && (
            <div className="card" style={{ borderColor: "#7f1d1d", color: "#b91c1c", marginBottom: 16 }}>
              {error}
            </div>
          )}

          {/* KPI-rutor */}
          {kpis && (
            <section
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(5, minmax(160px,1fr))",
                gap: 16,
                marginBottom: 16,
              }}
            >
              <KpiCard
                title="Sessioner"
                value={kpis.sessions.toLocaleString("sv-SE")}
                active={mode.type === "metric" && mode.key === "sessions"}
                onClick={() => setMode({ type: "metric", key: "sessions" })}
              />
              <KpiCard
                title="Användare"
                value={kpis.users.toLocaleString("sv-SE")}
                active={mode.type === "metric" && mode.key === "users"}
                onClick={() => setMode({ type: "metric", key: "users" })}
              />
              <KpiCard
                title="Genomsnittlig sessionstid"
                value={prettyTime(kpis.averageSessionDuration)}
                active={mode.type === "metric" && mode.key === "averageSessionDuration"}
                onClick={() => setMode({ type: "metric", key: "averageSessionDuration" })}
              />
              <KpiCard
                title="Konverteringar"
                value={kpis.conversions.toLocaleString("sv-SE")}
                active={mode.type === "metric" && mode.key === "conversions"}
                onClick={() => setMode({ type: "metric", key: "conversions" })}
              />

              {/* ⬇️ Klickbart event-kort → byter graf till event-serie */}
              <EventKpiCard
                startDate={fmt(startDate)}
                endDate={fmt(endDate)}
                title="Ansökningar e-handelskonto"
                onClick={() =>
                  setMode({ type: "event", eventName: "ehandel_ansok", label: "Ansökningar e-handelskonto" })
                }
                active={mode.type === "event"}
              />
            </section>
          )}

          {/* Linjegraf */}
          {chartDataPrepared && (
            <section className="card modern-card" style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 800, fontSize: 18 }}>
                  {`Periodgraf – ${chartTitle} (nuvarande vs föregående)`}
                </div>
                {loadingSeries && <span style={{ color: "var(--muted)", fontSize: 12 }}>Uppdaterar serie…</span>}
              </div>
              <div style={{ height: 380 }}>
                <Line
                  ref={chartRef}
                  data={chartDataPrepared}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: "index", intersect: false },
                    plugins: {
                      legend: {
                        position: "top",
                        labels: { color: css("--muted", "#64748b"), usePointStyle: true, boxWidth: 8 },
                      },
                      tooltip: {
                        backgroundColor: css("--tooltip-bg", "#fff"),
                        titleColor: css("--tooltip-fg", "#111"),
                        bodyColor: css("--tooltip-fg", "#111"),
                        borderColor: css("--tooltip-border", "#e5e7eb"),
                        borderWidth: 1,
                        cornerRadius: 8,
                        padding: 12,
                        displayColors: true,
                        callbacks: {
                          title: (items) => {
                            const l = items?.[0]?.label ?? "";
                            if (/^\d{8}$/.test(l)) {
                              const y = l.slice(0, 4), m = l.slice(4, 6), d = l.slice(6, 8);
                              return new Date(`${y}-${m}-${d}`).toLocaleDateString("sv-SE", {
                                day: "2-digit", month: "short", year: "numeric",
                              });
                            }
                            return l;
                          },
                        },
                      },
                    },
                    scales: {
                      x: { grid: { color: css("--grid", "#e5e7eb") }, ticks: { color: css("--muted", "#64748b"), maxRotation: 0 } },
                      y: { beginAtZero: true, grid: { color: css("--grid", "#e5e7eb") }, ticks: { color: css("--muted", "#64748b") } },
                    },
                    elements: { line: { borderCapStyle: "round" } },
                  }}
                />
              </div>
            </section>
          )}

          {/* Trafikkanaler */}
          <section style={{ marginBottom: 16 }}>
            <ChannelWidget startDate={fmt(startDate)} endDate={fmt(endDate)} />
          </section>

          {/* Chat */}
          <section>
            <DataChat defaultContext={{ startDate: fmt(startDate), endDate: fmt(endDate) }} />
          </section>
        </div>
      </div>
    </div>
  );
}

function metricLabel(k: MetricKey) {
  switch (k) {
    case "sessions":
      return "Sessioner";
    case "users":
      return "Användare";
    case "averageSessionDuration":
      return "Genomsnittlig sessionstid";
    case "conversions":
      return "Konverteringar";
  }
}

// Klickbar KPI – samma markup som EventKpiCard
function KpiCard({
  title,
  value,
  active,
  onClick,
}: {
  title: string;
  value: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="card"
      style={{
        textAlign: "left",
        cursor: onClick ? "pointer" : "default",
        borderColor: active ? "rgba(124,58,237,.6)" : "var(--border)",
        boxShadow: active ? "0 0 0 4px rgba(124,58,237,.15)" : "none",
        padding: 0,
      }}
    >
      <div className="card-header">
        <h3>{title}</h3>
      </div>
      <div className="card-body" style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 56, paddingTop: 6 }}>
        <div style={{ fontSize: 32, fontWeight: 800 }}>{value}</div>
      </div>
    </button>
  );
}
