import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-2xl font-semibold">Admin login</h1>
        <p className="mt-1 text-sm text-neutral-400">Platform control plane — operator access only.</p>
      </div>
      <LoginForm />
    </main>
  );
}
