import type { ReactNode } from "react";

export const metadata = {
  title: "whatsapp-bot-platform — Dashboard",
  description: "Pillar 2 — customer dashboard",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
