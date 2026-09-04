import type { SessionSummary } from "@/lib/api";

export type GroupKey = "today" | "yesterday" | "prev7" | "prev30" | "older";

export interface SessionGroup {
  /** Stable bucket id; consumers map it to a localized label via the
   *  i18n dictionary (key `groupSessions.${key}`). Keeping the label
   *  out of the data layer means switching languages doesn't require
   *  re-bucketing or re-fetching anything. */
  key: GroupKey;
  items: SessionSummary[];
}

const GROUP_ORDER: { key: GroupKey }[] = [
  { key: "today" },
  { key: "yesterday" },
  { key: "prev7" },
  { key: "prev30" },
  { key: "older" },
];

const DAY_MS = 86_400_000;

/**
 * Buckets sessions into date groups by `updated_at`. Input is assumed already
 * sorted newest-first (the API returns `updated_at DESC`), so item order within
 * each bucket is preserved. Empty buckets are dropped. `now` is injectable so
 * the bucketing is deterministically testable. Unparseable timestamps fall into
 * "Older" rather than throwing.
 */
export function groupSessionsByDate(
  sessions: SessionSummary[],
  now: Date = new Date(),
): SessionGroup[] {
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const startOfYesterday = startOfToday - DAY_MS;
  const sevenDaysAgo = startOfToday - 7 * DAY_MS;
  const thirtyDaysAgo = startOfToday - 30 * DAY_MS;

  const buckets: Record<GroupKey, SessionSummary[]> = {
    today: [],
    yesterday: [],
    prev7: [],
    prev30: [],
    older: [],
  };

  for (const s of sessions) {
    const t = new Date(s.updated_at).getTime();
    let key: GroupKey;
    if (Number.isNaN(t)) {
      key = "older";
    } else if (t >= startOfToday) {
      key = "today";
    } else if (t >= startOfYesterday) {
      key = "yesterday";
    } else if (t >= sevenDaysAgo) {
      key = "prev7";
    } else if (t >= thirtyDaysAgo) {
      key = "prev30";
    } else {
      key = "older";
    }
    buckets[key].push(s);
  }

  return GROUP_ORDER.map(({ key }) => ({
    key,
    items: buckets[key],
  })).filter((g) => g.items.length > 0);
}
