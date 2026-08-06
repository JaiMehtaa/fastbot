const WEEK_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

const DAY_ABBREV_TO_FULL: Record<string, string> = {
  mon: "monday",
  tue: "tuesday",
  wed: "wednesday",
  thu: "thursday",
  fri: "friday",
  sat: "saturday",
  sun: "sunday",
};

function normalizeDayToken(token: string): string | null {
  if ((WEEK_ORDER as readonly string[]).includes(token)) return token;
  return DAY_ABBREV_TO_FULL[token] ?? null;
}

/**
 * business_info.hours is authored (by the LLM extractor, the heuristic
 * extractor, or a merchant editing it directly) using whatever shorthand
 * reads naturally — grouped ranges like "mon_fri"/"mon_sat", collective
 * keys like "weekdays"/"weekend"/"daily", or individual day
 * abbreviations/full names — never a fixed, exhaustive per-day shape (see
 * business_info.ts's own example: `{ mon_fri: "...", sat: "...", sun:
 * "..." }`). booking.ts's `nextOpenDays` looks up one specific day at a
 * time by its full lowercase name (`DAY_KEYS`, matching `Date.getUTCDay()`
 * order) — found live via QA testing that grouped-range keys never matched
 * that lookup, silently making every booking-enabled tenant configured the
 * documented way show "no open hours configured," regardless of what was
 * actually entered. This expands whatever shorthand was used into an
 * explicit per-day map so `nextOpenDays` always has something to find,
 * without booking.ts needing to understand every shorthand itself.
 */
export function expandBusinessHours(hours: Record<string, unknown>): Record<string, unknown> {
  const expanded: Record<string, unknown> = {};

  for (const [rawKey, value] of Object.entries(hours)) {
    const key = rawKey.toLowerCase().trim();

    if (key === "daily" || key === "everyday") {
      for (const day of WEEK_ORDER) expanded[day] = value;
      continue;
    }
    if (key === "weekday" || key === "weekdays") {
      for (const day of ["monday", "tuesday", "wednesday", "thursday", "friday"]) expanded[day] = value;
      continue;
    }
    if (key === "weekend") {
      for (const day of ["saturday", "sunday"]) expanded[day] = value;
      continue;
    }

    const single = normalizeDayToken(key);
    if (single) {
      expanded[single] = value;
      continue;
    }

    const rangeMatch = /^([a-z]+)_([a-z]+)$/.exec(key);
    if (rangeMatch) {
      const start = normalizeDayToken(rangeMatch[1]!);
      const end = normalizeDayToken(rangeMatch[2]!);
      if (start && end) {
        const startIdx = WEEK_ORDER.indexOf(start as (typeof WEEK_ORDER)[number]);
        const endIdx = WEEK_ORDER.indexOf(end as (typeof WEEK_ORDER)[number]);
        let i = startIdx;
        while (true) {
          expanded[WEEK_ORDER[i]!] = value;
          if (i === endIdx) break;
          i = (i + 1) % WEEK_ORDER.length;
        }
        continue;
      }
    }

    // Unrecognized key (e.g. a free-text "note" from the heuristic extractor's
    // closed/24-7 fallback) — not a day, so it's not part of the per-day map.
  }

  return expanded;
}
