import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "whatsapp-bot-platform — Admin",
  description: "Pillar 3 — internal admin panel / control plane",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased">{children}</body>
    </html>
  );
}
