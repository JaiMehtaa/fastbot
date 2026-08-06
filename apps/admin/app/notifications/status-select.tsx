"use client";

import { useState, useTransition } from "react";
import { setNotificationStatusAction } from "./actions";

const STATUSES = ["unread", "read", "resolved"] as const;

export function NotificationStatusSelect({ notificationId, status }: { notificationId: string; status: string }) {
  const [value, setValue] = useState(status);
  const [isPending, startTransition] = useTransition();

  function handleChange(next: string) {
    setValue(next);
    startTransition(async () => {
      await setNotificationStatusAction(notificationId, next as (typeof STATUSES)[number]);
    });
  }

  return (
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
  );
}
