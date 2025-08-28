// components/Topbar.tsx
"use client";
import { useEffect, useState } from "react";

type Theme = "light" | "dark";

export default function Topbar() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const saved = (typeof window !== "undefined" && localStorage.getItem("theme")) as Theme | null;
    const prefersDark =
      typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const t: Theme = saved || (prefersDark ? "dark" : "light");
    setTheme(t);
    document.documentElement.classList.toggle("theme-dark", t === "dark");
  }, []);

  const toggle = () => {
    const t: Theme = theme === "dark" ? "light" : "dark";
    setTheme(t);
    localStorage.setItem("theme", t);
    document.documentElement.classList.toggle("theme-dark", t === "dark");
  };

  return (
    <div className="topbar">
      <div style={{ fontWeight: 800, fontSize: 16 }}>Dashboard</div>
      <div style={{ flex: 1 }} />
      <button className="btn secondary" onClick={toggle} aria-label="Toggle theme">
        {theme === "dark" ? "Light" : "Dark"}
      </button>
      <span title="Notifications">🔔</span>
      <span title="Profile">🧑🏻</span>
    </div>
  );
}
