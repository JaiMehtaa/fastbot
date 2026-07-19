import type { ReactNode } from "react";

export const metadata = {
  title: "whatsapp-bot-platform",
  description: "Pillar 1 — public site + interview agent chat",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
