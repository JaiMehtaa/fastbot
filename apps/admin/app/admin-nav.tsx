import Link from "next/link";
import { logoutAction } from "./login/actions";

const LINKS = [
  { href: "/", label: "Prompts" },
  { href: "/tenants", label: "Tenants" },
  { href: "/funnel", label: "Funnel" },
  { href: "/notifications", label: "Notifications" },
];

export function AdminNav({ current }: { current: string }) {
  return (
    <header className="flex items-center justify-between border-b border-neutral-800 px-6 py-4">
      <div className="flex items-center gap-6">
        <div>
          <span className="font-semibold">WhatsApp Bot Platform</span>
          <span className="ml-2 text-sm text-neutral-500">Admin</span>
        </div>
        <nav className="flex items-center gap-4 text-sm">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={current === link.href ? "font-medium text-white" : "text-neutral-400 hover:text-neutral-200"}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      <form action={logoutAction}>
        <button type="submit" className="text-sm text-neutral-400 underline hover:text-neutral-200">
          Log out
        </button>
      </form>
    </header>
  );
}
