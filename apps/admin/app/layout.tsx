import type { ReactNode } from "react";

export const metadata = {
  title: "whatsapp-bot-platform — Admin",
  description: "Pillar 3 — internal admin panel / control plane",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
