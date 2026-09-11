"use client";

import Link from "next/link";

import Icon from "@/components/Icon";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ProvidersSection } from "@/components/ProvidersSection";
import { ADVANCED_ITEMS } from "@/components/shell/navConfig";
import { useT } from "@/i18n";

// Settings hub — home for admin / power-user tools that were pulled out
// of the primary nav to keep day-to-day navigation focused. Each tool is
// a full route; this page is just the directory that points to them.
export default function SettingsPage() {
  const t = useT();
  return (
    <main className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-xl font-semibold text-fg">{t("pages.settings.title")}</h1>
        <p className="mt-1 text-sm text-fg-muted">
          {t("pages.settings.subtitle")}
        </p>

        {/* Language — the "global" switcher the user asked for. Pinned
            at the top above the advanced tools grid so it's the first
            thing you see on this page; the same control is also one click
            away from any page via the TopBar pill. */}
        <section
          aria-labelledby="settings-language-heading"
          className="mt-6 rounded-xl border border-line bg-surface-elevated p-4"
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-fg-muted">
              <Icon name="globe" size="w-5 h-5" />
            </span>
            <div className="flex-1 min-w-0">
              <h2
                id="settings-language-heading"
                className="text-sm font-medium text-fg"
              >
                {t("language.title")}
              </h2>
              <p className="mt-1 text-xs text-fg-muted leading-relaxed">
                {t("language.description")}
              </p>
              <div className="mt-3">
                <LanguageSwitcher variant="segmented" />
              </div>
            </div>
          </div>
        </section>

        {/* AI providers — the in-UI control panel for adding OpenAI-
            compatible LLM endpoints without restarting the backend. */}
        <div className="mt-4">
          {/* Quick pointer to the full help doc. Operators asked for
              this after the LM Studio / ZhipuAI flip-flop — most of
              the "how do I switch back to local" question is already
              answered at the top of docs/providers.md. */}
          <p className="mb-2 text-xs text-fg-subtle">
            {t("pages.settings.providersHelp")}{" "}
            <a
              href="https://github.com/cao919/OpenExecutive/blob/maincode/docs/providers.md"
              target="_blank"
              rel="noreferrer"
              className="text-fg-muted underline decoration-dotted underline-offset-2 hover:text-fg"
            >
              {t("pages.settings.providersHelpLink")}
            </a>
          </p>
          <ProvidersSection />
        </div>

        <h2 className="mt-8 mb-3 text-xs font-semibold uppercase tracking-widest text-fg-subtle">
          {t("pages.settings.sectionAdvanced")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {ADVANCED_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group rounded-xl border border-line bg-surface-elevated p-4 hover:border-line-strong hover:bg-surface-overlay transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-fg-muted group-hover:text-fg transition-colors">
                  <Icon name={item.icon} size="w-5 h-5" />
                </span>
                <h3 className="text-sm font-medium text-fg">{t(item.labelKey)}</h3>
              </div>
              <p className="mt-2 text-xs text-fg-muted leading-relaxed">
                {t(item.descriptionKey)}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
