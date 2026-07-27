import { ConnectForm } from "./connect-form";

export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ draftSessionId?: string }>;
}) {
  const { draftSessionId } = await searchParams;

  return (
    <div className="flex max-w-md flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Connect your WhatsApp number</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Once connected, your bot flips from draft to live and starts answering real customers.
        </p>
      </div>
      <ConnectForm draftSessionId={draftSessionId} />
    </div>
  );
}
