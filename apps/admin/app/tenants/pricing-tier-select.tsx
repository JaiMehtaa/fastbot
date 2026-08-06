"use client";

import { useState, useTransition } from "react";
import { setPricingTierAction } from "./actions";

const KNOWN_TIERS = ["free", "starter", "growth"];

export function PricingTierSelect({ tenantId, pricingTier }: { tenantId: string; pricingTier: string }) {
  const [value, setValue] = useState(pricingTier);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // pricing_tier has no DB check constraint, so an existing tenant could carry
  // a value outside the known list (e.g. seeded by hand) — keep it selectable
  // rather than silently hiding it.
  const options = KNOWN_TIERS.includes(value) ? KNOWN_TIERS : [value, ...KNOWN_TIERS];

  function handleChange(next: string) {
    setValue(next);
    setError(null);
    startTransition(async () => {
      const result = await setPricingTierAction(tenantId, next);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-0.5">
      <select
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        disabled={isPending}
        className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs disabled:opacity-50"
      >
        {options.map((tier) => (
          <option key={tier} value={tier}>
            {tier}
          </option>
        ))}
      </select>
      {error && <span className="text-[11px] text-red-400">{error}</span>}
    </div>
  );
}
