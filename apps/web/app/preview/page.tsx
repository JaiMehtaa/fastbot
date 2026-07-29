import { WhatsappPreview } from "./whatsapp-preview";

export default function PreviewPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col items-center gap-8 px-6 py-16">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-semibold">See your bot in action</h1>
        <p className="max-w-md text-sm text-neutral-400">
          A live simulation of a customer's WhatsApp chat — driven by the real bot engine, no real WhatsApp number required.
        </p>
      </div>
      <WhatsappPreview />
    </main>
  );
}
