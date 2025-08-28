"use client";

import { useState, useEffect } from "react";

const DASHBOARD_PASSWORD = process.env.NEXT_PUBLIC_DASHBOARD_PASSWORD || "admin123";

export default function PasswordProtection({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    // Kontrollera om användaren redan är autentiserad
    const authStatus = sessionStorage.getItem("dashboard_authenticated");
    if (authStatus === "true") {
      setIsAuthenticated(true);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === DASHBOARD_PASSWORD) {
      setIsAuthenticated(true);
      sessionStorage.setItem("dashboard_authenticated", "true");
      setError("");
    } else {
      setError("Felaktigt lösenord");
      setPassword("");
    }
  };

  if (isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      fontFamily: "system-ui, -apple-system, sans-serif"
    }}>
      <div style={{
        background: "white",
        padding: "2rem",
        borderRadius: "12px",
        boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
        width: "100%",
        maxWidth: "400px",
        margin: "1rem"
      }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{
            width: "60px",
            height: "60px",
            borderRadius: "12px",
            background: "linear-gradient(135deg, #5b21b6, #22d3ee)",
            margin: "0 auto 1rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "24px"
          }}>
            🔐
          </div>
          <h1 style={{
            fontSize: "24px",
            fontWeight: "700",
            color: "#1f2937",
            margin: "0 0 0.5rem 0"
          }}>
            Dashboard Access
          </h1>
          <p style={{
            color: "#6b7280",
            margin: "0"
          }}>
            Ange lösenord för att komma åt dashboarden
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "1rem" }}>
            <label style={{
              display: "block",
              fontSize: "14px",
              fontWeight: "500",
              color: "#374151",
              marginBottom: "0.5rem"
            }}>
              Lösenord
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Ange lösenord"
              style={{
                width: "100%",
                padding: "0.75rem",
                border: "1px solid #d1d5db",
                borderRadius: "8px",
                fontSize: "16px",
                outline: "none",
                transition: "border-color 0.2s",
                boxSizing: "border-box"
              }}
              onFocus={(e) => e.target.style.borderColor = "#5b21b6"}
              onBlur={(e) => e.target.style.borderColor = "#d1d5db"}
              required
            />
          </div>

          {error && (
            <div style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#dc2626",
              padding: "0.75rem",
              borderRadius: "8px",
              fontSize: "14px",
              marginBottom: "1rem"
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            style={{
              width: "100%",
              background: "linear-gradient(135deg, #5b21b6, #22d3ee)",
              color: "white",
              border: "none",
              padding: "0.75rem",
              borderRadius: "8px",
              fontSize: "16px",
              fontWeight: "600",
              cursor: "pointer",
              transition: "transform 0.2s",
              boxSizing: "border-box"
            }}
            onMouseOver={(e) => e.currentTarget.style.transform = "translateY(-1px)"}
            onMouseOut={(e) => e.currentTarget.style.transform = "translateY(0)"}
          >
            Logga in
          </button>
        </form>

        <div style={{
          marginTop: "1.5rem",
          padding: "1rem",
          background: "#f9fafb",
          borderRadius: "8px",
          fontSize: "12px",
          color: "#6b7280",
          textAlign: "center"
        }}>
          <strong>Standard lösenord:</strong> admin123<br />
          <em>Ändra NEXT_PUBLIC_DASHBOARD_PASSWORD i miljövariabler för att använda eget lösenord</em>
        </div>
      </div>
    </div>
  );
}
