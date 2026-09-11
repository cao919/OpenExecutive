'use client';

import Link from 'next/link';

import Icon from '@/components/Icon';
import { useT } from '@/i18n';

// Use-help handbook. Static (no API), all steps are i18n strings —
// keeps the page instant and editable without backend changes. Lives
// at /help and is reachable from the rail footer (next to /guide).
// Each section has: lead (why you'd want this), 1-5 numbered steps,
// and a "what next" action link (open Settings / Council / docs).
//
// Section ordering matters: the "switch to local LM Studio" recipe
// is intentionally first — it's the one operators asked for most
// after the model-default flip-flop.
const SECTION_IDS = [
  'lm-studio',
  'zhipuai',
  'openrouter',
  'language',
  'new-chat',
  'council',
  'troubleshoot',
] as const;

export default function HelpPage() {
  const t = useT();

  return (
    <div className="flex flex-1 min-h-0 bg-surface text-fg overflow-hidden">
      {/* Side TOC — sticky on lg+, slides over content on mobile */}
      <aside className="w-52 flex-shrink-0 border-r border-line flex flex-col bg-surface-elevated overflow-y-auto">
        <div className="px-3 py-4">
          <p className="px-2 text-[10px] font-semibold uppercase tracking-widest text-fg-subtle mb-2">
            {t('pages.help.tocTitle')}
          </p>
          <nav className="space-y-0.5">
            {SECTION_IDS.map((id) => (
              <a
                key={id}
                href={`#${id}`}
                className="block px-2 py-1.5 rounded-lg text-xs text-fg-muted hover:text-fg hover:bg-surface-overlay/60 transition-colors"
              >
                {t(`pages.help.${sectionTitleKey(id)}`)}
              </a>
            ))}
          </nav>
        </div>
        <div className="mt-auto px-4 py-4 border-t border-line space-y-1.5">
          <p className="text-[10px] text-fg-subtle leading-relaxed">
            {t('pages.help.sectionDocsLink')}
            <a
              href="https://github.com/cao919/OpenExecutive/blob/maincode/docs/providers.md"
              target="_blank"
              rel="noreferrer"
              className="text-fg-muted underline decoration-dotted underline-offset-2 hover:text-fg ml-1"
            >
              ↗
            </a>
          </p>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-10 space-y-12">
          <header>
            <div className="flex items-center gap-2 text-fg-muted text-xs">
              <Icon name="help-circle" size="w-4 h-4" />
              <span>{t('nav.help')}</span>
            </div>
            <h1 className="mt-2 text-2xl font-bold text-fg">
              {t('pages.help.title')}
            </h1>
            <p className="mt-2 text-sm text-fg-muted leading-relaxed">
              {t('pages.help.subtitle')}
            </p>
          </header>

          <Section id="lm-studio" tone="accent">
            <SectionTitle>{t('pages.help.sectionLmStudio')}</SectionTitle>
            <Lead>{t('pages.help.sectionLmStudioLead')}</Lead>
            <Steps
              items={[
                t('pages.help.sectionLmStudioStep1'),
                t('pages.help.sectionLmStudioStep2'),
                t('pages.help.sectionLmStudioStep3'),
                t('pages.help.sectionLmStudioStep4'),
              ]}
            />
            <Tip>{t('pages.help.sectionLmStudioTip')}</Tip>
            <ActionLink href="/settings" icon="cog">
              {t('pages.help.sectionOpenSettings')}
            </ActionLink>
          </Section>

          <Section id="zhipuai">
            <SectionTitle>{t('pages.help.sectionZhipuai')}</SectionTitle>
            <Lead>{t('pages.help.sectionZhipuaiLead')}</Lead>
            <Steps
              items={[
                t('pages.help.sectionZhipuaiStep1'),
                t('pages.help.sectionZhipuaiStep2'),
                t('pages.help.sectionZhipuaiStep3'),
              ]}
            />
            <ActionLink href="/council" icon="users">
              {t('pages.help.sectionOpenCouncil')}
            </ActionLink>
          </Section>

          <Section id="openrouter">
            <SectionTitle>{t('pages.help.sectionOpenrouter')}</SectionTitle>
            <Lead>{t('pages.help.sectionOpenrouterLead')}</Lead>
            <Steps
              items={[
                t('pages.help.sectionOpenrouterStep1'),
                t('pages.help.sectionOpenrouterStep2'),
                t('pages.help.sectionOpenrouterStep3'),
              ]}
            />
          </Section>

          <Section id="language">
            <SectionTitle>{t('pages.help.sectionLanguage')}</SectionTitle>
            <Lead>{t('pages.help.sectionLanguageLead')}</Lead>
            <Steps
              items={[
                t('pages.help.sectionLanguageStep1'),
                t('pages.help.sectionLanguageStep2'),
              ]}
            />
          </Section>

          <Section id="new-chat">
            <SectionTitle>{t('pages.help.sectionNewChat')}</SectionTitle>
            <Lead>{t('pages.help.sectionNewChatLead')}</Lead>
            <Steps
              items={[
                t('pages.help.sectionNewChatStep1'),
                t('pages.help.sectionNewChatStep2'),
              ]}
            />
          </Section>

          <Section id="council">
            <SectionTitle>{t('pages.help.sectionCouncil')}</SectionTitle>
            <Lead>{t('pages.help.sectionCouncilLead')}</Lead>
            <Steps
              items={[
                t('pages.help.sectionCouncilStep1'),
                t('pages.help.sectionCouncilStep2'),
              ]}
            />
            <ActionLink href="/council" icon="users">
              {t('pages.help.sectionOpenCouncil')}
            </ActionLink>
          </Section>

          <Section id="troubleshoot">
            <SectionTitle>{t('pages.help.sectionTroubleshoot')}</SectionTitle>
            <Lead>{t('pages.help.sectionTroubleshootLead')}</Lead>
            <Steps
              items={[
                t('pages.help.sectionTroubleshootStep1'),
                t('pages.help.sectionTroubleshootStep2'),
                t('pages.help.sectionTroubleshootStep3'),
              ]}
            />
          </Section>
        </div>
      </main>
    </div>
  );
}

// ---------- helpers ----------

function sectionTitleKey(id: (typeof SECTION_IDS)[number]): string {
  // Map anchor id → existing i18n key (we already have sectionFoo strings).
  return `section${id
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('')}`;
}

function Section({
  id,
  children,
  tone,
}: {
  id: string;
  children: React.ReactNode;
  tone?: 'accent';
}) {
  const isAccent = tone === 'accent';
  return (
    <section
      id={id}
      className={`scroll-mt-20 rounded-xl border p-5 ${
        isAccent
          ? 'border-indigo-500/30 bg-indigo-500/5'
          : 'border-line bg-surface-elevated'
      }`}
    >
      {children}
    </section>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-semibold text-fg">{children}</h2>;
}

function Lead({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 text-sm text-fg-muted leading-relaxed">{children}</p>
  );
}

function Steps({ items }: { items: string[] }) {
  return (
    <ol className="mt-3 space-y-1.5">
      {items.map((s, i) => (
        <li
          key={i}
          className="flex gap-2.5 text-sm text-fg leading-relaxed"
        >
          <span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-fg/10 text-[11px] font-mono text-fg-muted">
            {i + 1}
          </span>
          <span className="flex-1 min-w-0">{s}</span>
        </li>
      ))}
    </ol>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 leading-relaxed">
      <strong className="font-semibold">⚠️</strong> {children}
    </p>
  );
}

function ActionLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: 'cog' | 'users';
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-overlay px-2.5 py-1.5 text-xs font-medium text-fg hover:bg-fg/[0.05] transition-colors"
    >
      <Icon name={icon} size="w-3.5 h-3.5" />
      {children}
    </Link>
  );
}