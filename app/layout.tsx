// app/layout.tsx
import "./globals.css";
import type { ReactNode } from "react";
import PasswordProtection from "../components/PasswordProtection";

export const metadata = { 
  title: "GA4 AI Dashboard", 
  description: "Dark analytics",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
      'max-video-preview': -1,
      'max-image-preview': 'none',
      'max-snippet': -1,
    },
  }
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
