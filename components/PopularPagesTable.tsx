"use client";

import { useEffect, useMemo, useState } from "react";

type PageRow = {
  pagePath: string;
  screenPageViews: number;
  totalUsers: number;
  sessions: number;
  averageSessionDuration: number;
  conversions: number;
};

function fmtDuration(sec: number) {
  if (!sec || sec <= 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function PopularPagesTable({
  startDate,
  endDate,
  pageSize = 10,
}: {
  startDate?: string;   // gör valfria – route fallbacks
  endDate?: string;
  pageSize?: number;
}) {
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<PageRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");
  const pageCount = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  useEffect(() => {
    let isMounted = true;
    async function run() {
      setLoading(true);
      setErr("");
      try {
        const payload: any = { limit: pageSize, offset: page * pageSize };
        // Skicka bara datum om de finns – annars låter vi API:t defaulta
        if (startDate) payload.startDate = startDate;
        if (endDate) payload.endDate = endDate;

        const res = await fetch("/api/pages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok || data?.error) throw new Error(data?.error || "Fel vid hämtning");

        if (isMounted) {
          setRows(data.rows || []);
          setTotal(data.totalRows || (data.rows?.length ?? 0));
        }
      } catch (e: any) {
        console.error(e);
        if (isMounted) {
          setErr(e.message || "Fel vid hämtning");
          setRows([]);
          setTotal(0);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    run();
    return () => {
      isMounted = false;
    };
  }, [startDate, endDate, page, pageSize]);

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h3>Populäraste sidor</h3>
        <div style={{ fontSize: 12, color: "#64748b" }}>Visar {rows.length} av {total}</div>
      </div>

      <div className="card-body">
        {err && (
          <div style={{ color: "#b91c1c", marginBottom: 8 }}>Fel: {err}</div>
        )}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Sida</th>
                <th>Visningar</th>
                <th>Användare</th>
                <th>Sessioner</th>
                <th>Snittsession</th>
                <th>Konverteringar</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ padding: 16, textAlign: "center" }}>Laddar...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: 16, textAlign: "center" }}>Ingen data</td></tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={r.pagePath + i}>
                    <td style={{ maxWidth: 420, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.pagePath}>
                      {r.pagePath}
                    </td>
                    <td style={{ textAlign: "right" }}>{r.screenPageViews.toLocaleString()}</td>
                    <td style={{ textAlign: "right" }}>{r.totalUsers.toLocaleString()}</td>
                    <td style={{ textAlign: "right" }}>{r.sessions.toLocaleString()}</td>
                    <td style={{ textAlign: "right" }}>{fmtDuration(r.averageSessionDuration)}</td>
                    <td style={{ textAlign: "right" }}>{r.conversions.toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0 || loading}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e5e7eb", background: "white" }}
          >
            Föregående
          </button>
          <div style={{ fontSize: 12, color: "#64748b" }}>Sida {page + 1} av {pageCount}</div>
          <button
            onClick={() => setPage((p) => (p + 1 < pageCount ? p + 1 : p))}
            disabled={page + 1 >= pageCount || loading}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e5e7eb", background: "white" }}
          >
            Nästa
          </button>
        </div>
      </div>

      <style jsx global>{`
        .table-wrap { border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; }
        .table-wrap table { width: 100%; border-collapse: collapse; font-size: 14px; }
        .table-wrap thead th { background: #f8fafc; padding: 10px 12px; font-weight: 700; color: #475569; border-bottom: 1px solid #e5e7eb; }
        .table-wrap tbody td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; }
        .table-wrap tbody tr:nth-child(even) { background: #fafafa; }
        .table-wrap tbody tr:hover { background: #f3f4f6; }
      `}</style>
    </div>
  );
}
