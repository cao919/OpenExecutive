import { IconName } from "@/components/Icon";

// Single source of truth for the app's navigation. Both the chat-home
// sidebar (`app/page.tsx`, via `SidebarNav`) and the persistent rail
// (`components/shell/AppShell.tsx`) build their menus from here, so the
// two navs can never drift apart again. When adding a destination, add
// it ONCE in this file.
//
// i18n: every visible string is stored as a `labelKey` / `descriptionKey`
// pointing into the zh/en dictionaries. Consumers call `t(item.labelKey)`
// to resolve at render time. This keeps navConfig a pure data module —
// no React hooks here — while still being localizable. The fallback
// behaviour when a key is missing is documented in I18nProvider.

export interface NavItem {
  href: string;
  /** Dotted path into the i18n dictionary (e.g. "menu.review"). */
  labelKey: string;
  icon: IconName;
  /** One-line plain-language explanation, also a dict key. Required so
   *  every new destination ships with an explanation. */
  descriptionKey: string;
  /** Optional pending-count badge (e.g. items awaiting review). */
  badge?: number;
}

export interface NavGroup {
  /** Translation key for the group heading (e.g. "navGroup.workspace"). */
  labelKey: string;
  items: NavItem[];
}

interface BuildOpts {
  /**
   * When false, the Company-profile entry points at the onboarding
   * wizard and is relabelled "Set up company". The chat home knows the
   * onboarding state from `/health`; the rail assumes onboarded (its
   * routes are only reachable post-setup).
   */
  isOnboarded?: boolean;
  /** Pending + needs-revision count shown on the Review entry. */
  reviewBadge?: number;
}

// Day-to-day navigation only. Power/admin tools live in the Settings
// area (see ADVANCED_ITEMS) so this list stays focused.
export function buildPrimaryNav({ isOnboarded = true, reviewBadge = 0 }: BuildOpts = {}): NavGroup[] {
  return [
    {
      labelKey: "navGroup.workspace",
      items: [
        {
          href: "/review",
          labelKey: "menu.review",
          icon: "check-circle",
          badge: reviewBadge,
          descriptionKey: "menuDesc.review",
        },
        {
          href: "/jobs",
          labelKey: "menu.jobs",
          icon: "doc",
          descriptionKey: "menuDesc.jobs",
        },
        {
          href: "/artifacts",
          labelKey: "menu.artifacts",
          icon: "book",
          descriptionKey: "menuDesc.artifacts",
        },
        {
          href: "/watchlist",
          labelKey: "menu.watchList",
          icon: "eye",
          descriptionKey: "menuDesc.watchList",
        },
      ],
    },
    {
      labelKey: "navGroup.company",
      items: [
        {
          href: "/departments",
          labelKey: "menu.departments",
          icon: "grid",
          descriptionKey: "menuDesc.departments",
        },
        {
          href: "/people",
          labelKey: "menu.people",
          icon: "users",
          descriptionKey: "menuDesc.people",
        },
        {
          href: "/talent",
          labelKey: "menu.talent",
          icon: "clipboard",
          descriptionKey: "menuDesc.talent",
        },
        {
          href: "/staff-onboarding",
          labelKey: "menu.staffOnboarding",
          icon: "users",
          descriptionKey: "menuDesc.staffOnboarding",
        },
        {
          href: isOnboarded ? "/company-profile" : "/onboard",
          labelKey: isOnboarded ? "menu.companyProfile" : "menu.setUpCompany",
          icon: "building",
          descriptionKey: "menuDesc.companyProfile",
        },
      ],
    },
    {
      labelKey: "navGroup.knowledge",
      items: [
        {
          href: "/knowledge",
          labelKey: "menu.knowledgeBase",
          icon: "book",
          descriptionKey: "menuDesc.knowledgeBase",
        },
        {
          href: "/skills",
          labelKey: "menu.skills",
          icon: "bolt",
          descriptionKey: "menuDesc.skills",
        },
      ],
    },
  ];
}

// Pinned, always-visible top-level destination — rendered as a standalone
// link directly beneath Briefing in BOTH navs (rail + chat-home sidebar),
// the same way Briefing is. Kept here as the single source so the two
// navs stay in sync.
export const PULSE_NAV_ITEM: NavItem = {
  href: "/memories",
  labelKey: "nav.pulse",
  icon: "activity",
  descriptionKey: "nav.descPulse",
};

// Single rail/sidebar entry that leads to the Settings hub.
export const SETTINGS_NAV_ITEM: NavItem = {
  href: "/settings",
  labelKey: "nav.settings",
  icon: "cog",
  descriptionKey: "nav.descSettings",
};

// User Guide — pinned next to Settings in both nav footers so help is
// always one click away (it also stays listed on the Settings hub).
export const GUIDE_NAV_ITEM: NavItem = {
  href: "/guide",
  labelKey: "nav.userGuide",
  icon: "info",
  descriptionKey: "nav.descUserGuide",
};

// Keys for the two chat-home actions that aren't NavItems (they
// toggle modes rather than navigate). Components resolve them with
// t("nav.newChat") / t("nav.briefing") / t("nav.descNewChat") / etc.
export const NEW_CHAT_KEYS = {
  label: "nav.newChat",
  description: "nav.descNewChat",
} as const;
export const BRIEFING_KEYS = {
  label: "nav.briefing",
  description: "nav.descBriefing",
} as const;

// Admin / power-user tools surfaced on the Settings hub page rather
// than in the primary nav — they aren't part of the day-to-day loop.
export const ADVANCED_ITEMS: NavItem[] = [
  {
    href: "/council",
    labelKey: "menu.agentCouncil",
    icon: "users",
    descriptionKey: "menuDesc.agentCouncil",
  },
  {
    href: "/audit",
    labelKey: "menu.auditLog",
    icon: "doc-search",
    descriptionKey: "menuDesc.auditLog",
  },
  {
    href: "/audit/usage",
    labelKey: "menu.tokenUsage",
    icon: "activity",
    descriptionKey: "menuDesc.tokenUsage",
  },
  {
    href: "/guide",
    labelKey: "nav.userGuide",
    icon: "info",
    descriptionKey: "nav.descUserGuide",
  },
  {
    href: "/architecture",
    labelKey: "menu.architecture",
    icon: "grid",
    descriptionKey: "menuDesc.architecture",
  },
  {
    href: "/demo",
    labelKey: "menu.companySimulator",
    icon: "cog",
    descriptionKey: "menuDesc.companySimulator",
  },
  {
    href: "/clients",
    labelKey: "menu.clientCompanies",
    icon: "building",
    descriptionKey: "menuDesc.clientCompanies",
  },
];

// Anchors the mobile bottom nav. ≤5 per Material guidance; "More" opens
// the drawer with the full menu. `/` lands on the briefing surface.
export const MOBILE_PRIMARY: NavItem[] = [
  { href: "/", labelKey: BRIEFING_KEYS.label, icon: "clipboard", descriptionKey: BRIEFING_KEYS.description },
  PULSE_NAV_ITEM,
  // `?new=1` signals the chat home to reset to a fresh chat and strip
  // the query — see the effect in app/page.tsx.
  { href: "/?new=1", labelKey: NEW_CHAT_KEYS.label, icon: "plus", descriptionKey: NEW_CHAT_KEYS.description },
  {
    href: "/people",
    labelKey: "menu.people",
    icon: "users",
    descriptionKey: "menuDesc.people",
  },
  {
    href: "/jobs",
    labelKey: "menu.jobs",
    icon: "doc",
    descriptionKey: "menuDesc.jobs",
  },
];
