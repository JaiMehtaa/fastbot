"use client";

import { useState, useTransition } from "react";
import { setNotificationStatusAction } from "./actions";

const STATUSES = ["unread", "read", "resolved"] as const;

export function NotificationStatusSelect({
  tenantId,
  notificationId,
  status,
}: {
  tenantId: string;
  notificationId: string;
  status: string;
}) {
  const [value, setValue] = useState(status);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleChange(next: string) {
    setValue(next);
    setError(null);
    startTransition(async () => {
      const result = await setNotificationStatusAction(tenantId, notificationId, next as (typeof STATUSES)[number]);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <select
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        disabled={isPending}
        className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs disabled:opacity-50"
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      {error && <span className="text-[11px] text-red-400">{error}</span>}
    </div>
  );
}
