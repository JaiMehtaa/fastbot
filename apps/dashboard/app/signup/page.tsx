import Link from "next/link";
import { SignupForm } from "./signup-form";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ draftSessionId?: string }>;
}) {
  const { draftSessionId } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-2xl font-semibold">Sign up</h1>
        {draftSessionId && (
          <p className="mt-1 text-sm text-neutral-400">Create an account to connect your WhatsApp number and go live.</p>
        )}
      </div>
      <SignupForm draftSessionId={draftSessionId} />
      <p className="text-sm text-neutral-400">
        Already have an account?{" "}
        <Link href={draftSessionId ? `/login?draftSessionId=${draftSessionId}` : "/login"} className="text-emerald-400 underline">
          Log in
        </Link>
      </p>
    </main>
  );
}
