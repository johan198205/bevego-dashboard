// app/layout.tsx
import "./globals.css";
import type { ReactNode } from "react";
import PasswordProtection from "../components/PasswordProtection";

export const metadata = { 
  title: "GA4 AI Dashboard", 
  description: "Dark analytics",
  robots: "noindex, nofollow, noarchive, nosnippet"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="sv">
      <body>
        <PasswordProtection>
          {children}
        </PasswordProtection>
      </body>
    </html>
  );
}
