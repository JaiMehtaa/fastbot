import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Build a WhatsApp bot by chatting",
  description: "Describe your business, get a working WhatsApp bot — no drag-and-drop builder required.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased">{children}</body>
    </html>
  );
}
