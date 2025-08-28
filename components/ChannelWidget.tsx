"use client";

import { useEffect, useMemo, useState } from "react";
import { Doughnut } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
ChartJS.register(ArcElement, Tooltip, Legend);

import PopularPagesTable from "./PopularPagesTable";

type Row = {
  channel: string;
  sessions: number;
  totalUsers: number;
  conversions: number;
  averageSessionDuration: number;
  share: {
    sessions: number;
    totalUsers: number;
    conversions: number;
    averageSessionDuration: number;
  };
};

export default function ChannelWidget({
  startDate,
  endDate,
}: {
  startDate: string;
  endDate: string;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function run() {
      setLoading(true);
      try {
        const res = await fetch("/api/channels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startDate, endDate }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Fel vid hämtning");
        if (isMounted) setRows(data.rows || []);
      } catch (e) {
        console.error(e);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    run();
    return () => {
      isMounted = false;
    };
  }, [startDate, endDate]);

  // Palett för doughnut
  const palette = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#14b8a6", "#f97316"];

  const doughnutData = useMemo(() => {
    const labels = rows.map((r) => r.channel);
    const data = rows.map((r) => r.sessions);
    const bg = labels.map((_, i) => `${palette[i % palette.length]}CC`); // 80% opacity
    const border = labels.map((_, i) => palette[i % palette.length]);
    return {
      labels,
      datasets: [
        {
          data,
          backgroundColor: bg,
          borderColor: border,
          borderWidth: 1,
        },
      ],
    };
  }, [rows]);

  const doughnutOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      cutout: "55%",
      plugins: {
        legend: {
          position: "right" as const,
          labels: { usePointStyle: true, boxWidth: 8 },
        },
        tooltip: {
          cornerRadius: 8,
          padding: 10,
          displayColors: true,
          callbacks: {
            // Visa "Label: 51.8% (9 519)"
            label: (ctx: any) => {
              const value = Number(ctx.parsed ?? 0);
              const dataArr: number[] = (ctx.dataset?.data || []) as number[];
              const total = dataArr.reduce((a, b) => a + (Number(b) || 0), 0);
              const pct = total ? (value / total) * 100 : 0;
              const pretty = (n: number) =>
                (Number(n) as any)?.toLocaleString?.() ?? String(n);
              return `${ctx.label}: ${pct.toFixed(1)}% (${pretty(value)})`;
            },
          },
        },
      },
    }),
    []
  );

  return (
    <section>
      <div className="card">
        <div className="card-header">
          <h3>Trafikkanaler</h3>
        </div>
        <div className="card-body">
          {loading ? (
            <div style={{ padding: 16 }}>Laddar...</div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "420px 1fr", // lite bredare donut-kolumn
                gap: 16,
              }}
            >
              <div style={{ height: 320, alignSelf: "center" }}>
                <Doughnut data={doughnutData} options={doughnutOptions} />
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left" }}>Kanal</th>
                      <th>Sessioner</th>
                      <th>Användare</th>
                      <th>Konverteringar</th>
                      <th>Andel sessioner</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.channel}>
                        <td>{r.channel}</td>
                        <td style={{ textAlign: "right" }}>{r.sessions.toLocaleString()}</td>
                        <td style={{ textAlign: "right" }}>{r.totalUsers.toLocaleString()}</td>
                        <td style={{ textAlign: "right" }}>{r.conversions.toLocaleString()}</td>
                        <td style={{ textAlign: "right" }}>
                          {(r.share.sessions * 100).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Populäraste sidor – renderas som card inuti komponenten */}
      <PopularPagesTable startDate={startDate} endDate={endDate} />

      <style jsx global>{`
        .table-wrap {
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          overflow: hidden;
        }
        .table-wrap table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        }
        .table-wrap thead th {
          background: #f8fafc;
          padding: 10px 12px;
          font-weight: 700;
          color: #475569;
          border-bottom: 1px solid #e5e7eb;
        }
        .table-wrap tbody td {
          padding: 10px 12px;
          border-bottom: 1px solid #f1f5f9;
        }
        .table-wrap tbody tr:nth-child(even) {
          background: #fafafa;
        }
        .table-wrap tbody tr:hover {
          background: #f3f4f6;
        }
      `}</style>
    </section>
  );
}
