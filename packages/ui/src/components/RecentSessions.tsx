"use client";

import { useMemo, useState } from "react";
import Icon from "@/components/Icon";
import type { SessionSummary } from "@/lib/api";
import { groupSessionsByDate } from "@/lib/sessionGroups";
import { formatRelativeTime } from "@/lib/relativeTime";
import { useT } from "@/i18n";

const GROUP_CAP = 8;
const DEFAULT_COLLAPSED: ReadonlySet<"prev30" | "older"> = new Set(["prev30", "older"]);

interface RecentSessionsProps {
  sessions: SessionSummary[];
  activeSessionId?: string;
  onSelect: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
}

// Map group key → i18n dict key. Keep this in one place so the same
// grouping is used everywhere sessions are bucketed by date.
const GROUP_KEY_TO_I18N: Record<"today" | "yesterday" | "prev7" | "prev30" | "older", string> = {
  today: "recentSessions.today",
  yesterday: "recentSessions.yesterday",
  prev7: "recentSessions.prev7",
  prev30: "recentSessions.prev30",
  older: "recentSessions.older",
};

export default function RecentSessions({
  sessions,
  activeSessionId,
  onSelect,
  onDelete,
}: RecentSessionsProps) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [collapsedOverride, setCollapsedOverride] = useState<Record<string, boolean>>({});
  const [showAll, setShowAll] = useState<Set<string>>(new Set());

  const trimmedQuery = query.trim().toLowerCase();
  const searching = trimmedQuery.length > 0;

  const filtered = useMemo(() => {
    if (!searching) return sessions;
    const fallback = t("recentSessions.untitled");
    return sessions.filter((s) =>
      (s.title || fallback).toLowerCase().includes(trimmedQuery),
    );
  }, [sessions, searching, trimmedQuery, t]);

  const groups = useMemo(() => groupSessionsByDate(filtered), [filtered]);

  if (sessions.length === 0) return null;

  // Stored collapse state (default-collapsed unless the user toggled it). While
  // searching we force every group open so matches are never hidden, but the
  // stored state is preserved and re-applies once the query is cleared.
  const storedCollapsed = (key: keyof typeof GROUP_KEY_TO_I18N) =>
    key in collapsedOverride ? collapsedOverride[key] : DEFAULT_COLLAPSED.has(key as "prev30" | "older");
  const isCollapsed = (key: keyof typeof GROUP_KEY_TO_I18N) =>
    searching ? false : storedCollapsed(key);
  const toggleCollapse = (key: keyof typeof GROUP_KEY_TO_I18N) =>
    setCollapsedOverride((prev) => ({ ...prev, [key]: !storedCollapsed(key) }));
  const revealAll = (key: keyof typeof GROUP_KEY_TO_I18N) =>
    setShowAll((prev) => new Set(prev).add(key));

  return (
    <div className="flex flex-col min-h-0">
      {/* Pinned header — label + search, stays put while the list scrolls */}
      <div className="flex-shrink-0 px-2 pt-3 pb-2">
        <p className="px-2 pb-1.5 text-xs text-fg-subtle font-medium uppercase tracking-wide">
          {t("recentSessions.title")}
        </p>
        <div className="relative">
          <Icon
            name="search"
            size="w-3.5 h-3.5"
            className="absolute left-2 top-1/2 -translate-y-1/2 text-fg-subtle pointer-events-none"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("recentSessions.searchPlaceholder")}
            aria-label={t("recentSessions.searchPlaceholder")}
            className="w-full rounded-lg bg-surface-input/60 border border-line pl-7 pr-2 py-1.5 text-xs text-fg placeholder:text-fg-subtle focus:outline-none focus:border-fg-subtle"
          />
        </div>
      </div>

      {/* Scrollable list */}
      <div className="overflow-y-auto min-h-0 max-h-[75vh] px-2 pb-2">
        {groups.length === 0 ? (
          <p className="px-2 py-3 text-xs text-fg-subtle">
            {t("recentSessions.emptySearch")}
          </p>
        ) : (
          groups.map((group) => {
            const collapsed = isCollapsed(group.key);
            const expandedAll = searching || showAll.has(group.key);
            const visible = expandedAll ? group.items : group.items.slice(0, GROUP_CAP);
            const hiddenCount = group.items.length - visible.length;
            const groupLabel = t(GROUP_KEY_TO_I18N[group.key]);
            return (
              <div key={group.key} className="mb-1">
                <button
                  type="button"
                  onClick={() => toggleCollapse(group.key)}
                  aria-expanded={!collapsed}
                  className="sticky top-0 z-10 w-full flex items-center gap-1.5 px-2 py-1.5 bg-surface-elevated text-fg-subtle hover:text-fg transition-colors cursor-pointer"
                >
                  <Icon
                    name="chevron-right"
                    size="w-3 h-3"
                    className={`transition-transform ${collapsed ? "" : "rotate-90"}`}
                  />
                  <span className="text-[11px] font-medium uppercase tracking-wide">
                    {groupLabel}
                  </span>
                  <span className="text-[10px] text-fg-subtle/70">{group.items.length}</span>
                </button>
                {!collapsed && (
                  <div className="space-y-0.5">
                    {visible.map((s) => (
                      <div
                        key={s.session_id}
                        className={`group relative flex items-center rounded-lg transition-colors ${
                          activeSessionId === s.session_id
                            ? "bg-surface-overlay text-fg"
                            : "text-fg-muted hover:bg-surface-overlay/60 hover:text-fg"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => onSelect(s.session_id)}
                          className="flex-1 min-w-0 text-left px-2 py-2 pr-10 cursor-pointer"
                        >
                          <p className="text-xs truncate leading-snug">
                            {s.title || t("recentSessions.untitled")}
                          </p>
                          <p className="text-[10px] text-fg-subtle mt-0.5">
                            {formatRelativeTime(s.updated_at)}
                          </p>
                        </button>
                        <button
                          type="button"
                          aria-label={t("recentSessions.delete")}
                          title={t("recentSessions.delete")}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(s.session_id);
                          }}
                          className="absolute right-1 top-1/2 -translate-y-1/2 min-h-touch min-w-touch flex items-center justify-center rounded opacity-0 group-hover:opacity-100 focus:opacity-100 text-fg-muted hover:text-red-400 hover:bg-surface-input/60 transition-opacity cursor-pointer"
                        >
                          <Icon name="trash" size="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {hiddenCount > 0 && (
                      <button
                        type="button"
                        onClick={() => revealAll(group.key)}
                        className="w-full text-left px-2 py-1.5 text-[11px] text-fg-subtle hover:text-fg cursor-pointer"
                      >
                        {t("recentSessions.showMore", hiddenCount)}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
