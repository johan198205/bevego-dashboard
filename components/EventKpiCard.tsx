// components/EventKpiCard.tsx
"use client";

import { useEffect, useState } from "react";

type ApiResp = {
  totalEventCount: number;
};

export default function EventKpiCard({
  startDate,
  endDate,
  title = "Ansökningar e-handelskonto",
  eventName = "ehandel_ansok",
  params,
  filters,
  showMeta = false,
  onClick,
  active,
}: {
  startDate?: string;
  endDate?: string;
  title?: string;
  eventName?: string;
  params?: string[];
  filters?: Record<string, string>;
  showMeta?: boolean;
  onClick?: () => void;
  active?: boolean;
}) {
  const [count, setCount] = useState<number | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let on = true;
    async function run() {
      setErr("");
      setCount(null);
      try {
        const body: any = { eventName };
        if (startDate) body.startDate = startDate;
        if (endDate) body.endDate = endDate;
        if (params?.length) body.params = params;
        if (filters && Object.keys(filters).length) body.filters = filters;

        const res = await fetch("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data: ApiResp | any = await res.json();
        if (!res.ok || data?.error) throw new Error(data?.error || "Kunde inte läsa event");
        if (!on) return;
        setCount(Number(data?.totalEventCount ?? 0));
      } catch (e: any) {
        if (on) setErr(e.message || "Fel vid inläsning");
      }
    }
    run();
    return () => {
      on = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, eventName, JSON.stringify(params), JSON.stringify(filters)]);

  return (
    <button
      onClick={onClick}
      className="card"
      style={{
        textAlign: "left",
        cursor: "pointer",
        borderColor: active ? "rgba(124,58,237,.6)" : "var(--border)",
        boxShadow: active ? "0 0 0 4px rgba(124,58,237,.15)" : "none",
        padding: 0,
      }}
    >
      <div className="card-header">
        <h3>{title}</h3>
      </div>
      <div className="card-body" style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 56 }}>
        {err ? (
          <div style={{ color: "#b91c1c" }}>Fel: {err}</div>
        ) : count === null ? (
          <div style={{ height: 40, width: 120, borderRadius: 8, background: "#f1f5f9" }} />
        ) : (
          <div style={{ fontSize: 32, fontWeight: 800 }}>{count.toLocaleString("sv-SE")}</div>
        )}
        {showMeta && startDate && endDate && (
          <div style={{ color: "#64748b" }}>{startDate} – {endDate}</div>
        )}
      </div>
    </button>
  );
}
