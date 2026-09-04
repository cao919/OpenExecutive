"use client";

import { useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import { useT } from "@/i18n";
import {
  BRIEFING_KEYS,
  NavGroup,
  NEW_CHAT_KEYS,
  PULSE_NAV_ITEM,
} from "@/components/shell/navConfig";

interface SidebarNavProps {
  sections: NavGroup[];
  briefingActive: boolean;
  newChatActive: boolean;
  onBriefing: () => void;
  onNewChat: () => void;
  onNavigate: () => void;
}

export default function SidebarNav({
  sections,
  briefingActive,
  newChatActive,
  onBriefing,
  onNewChat,
  onNavigate,
}: SidebarNavProps) {
  // Explicit user toggles; absent keys fall back to "open only the first
  // section" so the menu starts short and the rest are tucked away.
  const [collapsedOverride, setCollapsedOverride] = useState<Record<string, boolean>>({});
  const t = useT();

  const isCollapsed = (key: string, index: number) =>
    key in collapsedOverride ? collapsedOverride[key] : index !== 0;
  const toggle = (key: string, index: number) =>
    setCollapsedOverride((prev) => ({ ...prev, [key]: !isCollapsed(key, index) }));

  return (
    <nav className="px-2 pt-3 pb-2 space-y-0.5">
      {/* New chat first — the single most-used action in a chat-first
          product, kept at the top of the sidebar to match the persistent
          rail (see AppShell) so the two navs agree on every route. */}
      <button
        type="button"
        onClick={onNewChat}
        title={t(NEW_CHAT_KEYS.description)}
        className={`w-full text-left px-3 py-2.5 min-h-touch rounded-lg flex items-center gap-2.5 text-sm font-medium transition-colors cursor-pointer ${
          newChatActive
            ? "bg-surface-overlay text-fg"
            : "text-fg-muted hover:bg-surface-overlay hover:text-fg"
        }`}
      >
        <Icon name="plus" size="w-4 h-4" />
        {t(NEW_CHAT_KEYS.label)}
      </button>
      <button
        type="button"
        onClick={onBriefing}
        title={t(BRIEFING_KEYS.description)}
        className={`w-full text-left px-3 py-2.5 min-h-touch rounded-lg flex items-center gap-2.5 text-sm font-medium transition-colors cursor-pointer ${
          briefingActive
            ? "bg-surface-overlay text-fg"
            : "text-fg-muted hover:bg-surface-overlay hover:text-fg"
        }`}
      >
        <Icon name="clipboard" size="w-4 h-4" />
        {t(BRIEFING_KEYS.label)}
      </button>
      {/* Pulse — pinned beside Briefing/New chat as an always-visible
          destination, mirroring the persistent rail. */}
      <Link
        href={PULSE_NAV_ITEM.href}
        onClick={onNavigate}
        title={t(PULSE_NAV_ITEM.descriptionKey)}
        className="w-full text-left px-3 py-2.5 min-h-touch rounded-lg flex items-center gap-2.5 text-sm font-medium transition-colors cursor-pointer text-fg-muted hover:bg-surface-overlay hover:text-fg"
      >
        <Icon name={PULSE_NAV_ITEM.icon} size="w-4 h-4" />
        {t(PULSE_NAV_ITEM.labelKey)}
      </Link>

      {sections.map((section, index) => {
        const collapsed = isCollapsed(section.labelKey, index);
        const badgeTotal = section.items.reduce((sum, e) => sum + (e.badge ?? 0), 0);
        return (
          <div key={section.labelKey} className="pt-2">
            <button
              type="button"
              onClick={() => toggle(section.labelKey, index)}
              aria-expanded={!collapsed}
              className="w-full flex items-center gap-1.5 px-3 py-1.5 text-fg-subtle hover:text-fg transition-colors cursor-pointer"
            >
              <Icon
                name="chevron-right"
                size="w-3 h-3"
                className={`transition-transform ${collapsed ? "" : "rotate-90"}`}
              />
              <span className="text-[11px] font-medium uppercase tracking-wide flex-1 text-left">
                {t(section.labelKey)}
              </span>
              {collapsed && badgeTotal > 0 && (
                <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full px-1.5 py-0.5 leading-none font-medium">
                  {badgeTotal}
                </span>
              )}
            </button>
            {!collapsed && (
              <div className="space-y-0.5 mt-0.5">
                {section.items.map((entry) => (
                  <Link
                    key={entry.href}
                    href={entry.href}
                    onClick={onNavigate}
                    title={t(entry.descriptionKey)}
                    className="px-3 py-2.5 min-h-touch rounded-lg hover:bg-surface-overlay text-fg-muted hover:text-fg flex items-center gap-2.5 text-sm transition-colors cursor-pointer"
                  >
                    <Icon name={entry.icon} size="w-4 h-4" />
                    <span className="flex-1">{t(entry.labelKey)}</span>
                    {entry.badge != null && entry.badge > 0 && (
                      <span className="ml-auto text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full px-1.5 py-0.5 leading-none font-medium">
                        {entry.badge}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
