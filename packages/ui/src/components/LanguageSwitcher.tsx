"use client";

// Reusable UI for the global language switcher.
//
// Two variants, both wired to the same I18nContext:
//   - "pill"      — compact one-button flipper for the TopBar; shows the
//                   current language badge (中 / EN) and toggles on click.
//   - "segmented" — two explicit buttons (中文 / English) for the Settings
//                   page, where users need to see both options at once.
//
// The "global" placement the user asked for lives in Settings (the canonical
// config surface) and is also one click away from any page via the TopBar
// pill — same backing state, so toggling either one updates the whole tree
// and persists via `localStorage["oe_lang"]` (see I18nProvider).

import { useT, useLang, useSetLang, type Lang } from "@/i18n";

interface BaseProps {
  className?: string;
}

type Variant = "pill" | "segmented";

export function LanguageSwitcher({
  variant,
  className = "",
}: BaseProps & { variant: Variant }) {
  if (variant === "pill") return <PillSwitcher className={className} />;
  return <SegmentedSwitcher className={className} />;
}

function PillSwitcher({ className = "" }: BaseProps) {
  const lang = useLang();
  const setLang = useSetLang();
  const t = useT();
  const target: Lang = lang === "zh" ? "en" : "zh";
  return (
    <button
      type="button"
      onClick={() => setLang(target)}
      title={t("language.switchTo")}
      aria-label={t("language.switchTo")}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer text-fg-muted hover:text-fg hover:bg-surface-overlay ${className}`}
    >
      <span className="font-mono tracking-tight min-w-[1.5rem] text-center">
        {lang === "zh" ? t("language.badgeZH") : t("language.badgeEN")}
      </span>
    </button>
  );
}

function SegmentedSwitcher({ className = "" }: BaseProps) {
  const lang = useLang();
  const setLang = useSetLang();
  const t = useT();
  return (
    <div
      role="group"
      aria-label={t("language.switchTo")}
      className={`inline-flex items-center rounded-lg border border-line bg-surface-overlay p-0.5 ${className}`}
    >
      <SegmentButton
        active={lang === "zh"}
        onClick={() => setLang("zh")}
        label={t("language.switchToZH")}
        badge={t("language.badgeZH")}
      />
      <SegmentButton
        active={lang === "en"}
        onClick={() => setLang("en")}
        label={t("language.switchToEN")}
        badge={t("language.badgeEN")}
      />
    </div>
  );
}

function SegmentButton({
  active,
  onClick,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${
        active
          ? "bg-surface text-fg shadow-sm"
          : "text-fg-muted hover:text-fg"
      }`}
    >
      <span className="font-mono text-[10px] opacity-70">{badge}</span>
      <span>{label}</span>
    </button>
  );
}
