// app/layout.tsx
import "./globals.css";
import type { ReactNode } from "react";

export const metadata = { title: "GA4 AI Dashboard", description: "Dark analytics" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="sv">
      <body>
        {children}
      </body>
    </html>
  );
}
