import Link from "next/link";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ draftSessionId?: string }>;
}) {
  const { draftSessionId } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <h1 className="text-2xl font-semibold">Log in</h1>
      <LoginForm draftSessionId={draftSessionId} />
      <p className="text-sm text-neutral-400">
        No account?{" "}
        <Link
          href={draftSessionId ? `/signup?draftSessionId=${draftSessionId}` : "/signup"}
          className="text-emerald-400 underline"
        >
          Sign up
        </Link>
      </p>
    </main>
  );
}
