import { InterviewChat } from "./components/interview-chat";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col items-center gap-10 px-6 py-16">
      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Build your WhatsApp bot by chatting</h1>
        <p className="max-w-xl text-neutral-400">
          Describe your business and answer a few questions — no drag-and-drop builder, no flowcharts. Test it on
          real WhatsApp before you connect a number.
        </p>
      </div>
      <InterviewChat />
    </main>
  );
}
