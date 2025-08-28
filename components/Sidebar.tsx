// components/Sidebar.tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Sidebar() {
  const path = usePathname();
  const active = path === "/" || path === "/dashboard";
  return (
    <aside className="sidebar">
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 10px 16px" }}>
        <div style={{ width:30, height:30, borderRadius:8, background:"linear-gradient(135deg,#5b21b6,#22d3ee)" }} />
        <div style={{ fontWeight:800 }}>Vuexy</div>
      </div>

      <nav style={{ display:"grid", gap:6 }}>
        <Link
          href="/"
          className="navitem"
          style={{
            display:"flex", alignItems:"center", gap:10,
            textDecoration:"none",
            padding:"10px 12px",
            borderRadius:10,
            background: active ? "rgba(124,58,237,.14)" : "transparent",
            border: active ? "1px solid rgba(124,58,237,.35)" : "1px solid transparent"
          }}
        >
          <span style={{ width:20, textAlign:"center" }}>🏠</span>
          <span>Dashboard</span>
        </Link>
      </nav>
    </aside>
  );
}
