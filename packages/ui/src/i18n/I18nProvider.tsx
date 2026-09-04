"use client";

// Lightweight i18n: a single React Context that exposes `lang`, `setLang`,
// and a `t(key)` helper that looks up nested keys via dotted paths.
//
// Design choices — see zh.ts / en.ts for the dictionaries:
//   - Default language is "zh" (user preference). English is opt-in.
//   - localStorage key `oe_lang` persists the choice across reloads.
//     We also still read the legacy `oe_language` key (left over from the
//     chat-only toggle) so existing users don't get reset on first load.
//   - Missing keys fall back to the dotted path itself — better than
//     throwing, and obvious in dev. Type-checking at compile time keeps
//     the dictionaries in sync (see Dict type below).
//   - We do NOT call `useRouter().refresh()` on language change; since
//     every nav item passes through navConfig → component reads via
//     `useT()`, the React tree re-renders naturally without a round-trip.
//
// We intentionally do not pull in next-intl / react-i18next: the project
// has zero i18n deps today, and a 4-file custom Context is enough for
// the surface area we need.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";

import { en } from "./en";
import { zh } from "./zh";

export type Lang = "zh" | "en";

// Mirror the shape of one dictionary. Used to make zh.ts and en.ts
// structurally identical — adding a key to one without the other is a
// compile error (en: typeof en mirrors zh: typeof zh).
type Dict = typeof zh;
type DictValue = string | number | boolean | ((...args: any[]) => string) | Dict | { [k: string]: DictValue };

const DICTS: Record<Lang, Dict> = { zh, en };

const STORAGE_KEY = "oe_lang";
const LEGACY_STORAGE_KEY = "oe_language"; // from the earlier chat-only toggle

function resolveInitialLang(): Lang {
  if (typeof window === "undefined") return "zh";
  try {
    const cur = window.localStorage.getItem(STORAGE_KEY);
    if (cur === "zh" || cur === "en") return cur;
    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy === "zh" || legacy === "en") return legacy;
  } catch {
    /* localStorage blocked — fall through to default */
  }
  return "zh";
}

// Resolve `a.b.c` against a nested dict. Returns the dotted path itself
// when nothing is found — better than throwing, and the untranslated key
// is obvious enough to spot in dev.
function lookup(dict: Dict, path: string): DictValue | undefined {
  const parts = path.split(".");
  let cur: any = dict;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in cur) {
      cur = cur[p];
    } else {
      return undefined;
    }
  }
  return cur as DictValue;
}

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
  /** Look up a translation by dotted path. Missing keys return the path. */
  t: (key: string, ...args: any[]) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  // Start with the default on the server to keep SSR markup deterministic.
  // On mount we read localStorage and switch if needed.
  const [lang, setLangState] = useState<Lang>("zh");

  useEffect(() => {
    const resolved = resolveInitialLang();
    if (resolved !== lang) setLangState(resolved);
    // lang intentionally omitted — we only want the initial reading
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror to <html lang> + persist. Done in an effect so SSR + client
  // agree on initial markup.
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    }
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, lang);
        // Also keep the legacy key in sync so older code paths still
        // observe the right language.
        window.localStorage.setItem(LEGACY_STORAGE_KEY, lang);
      } catch {
        /* ignore — language just won't persist */
      }
    }
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
  }, []);

  const toggleLang = useCallback(() => {
    setLangState((cur) => (cur === "zh" ? "en" : "zh"));
  }, []);

  const t = useCallback(
    (key: string, ...args: any[]) => {
      const dict = DICTS[lang];
      const found = lookup(dict, key);
      if (typeof found === "function") {
        try {
          return (found as (...a: any[]) => string)(...args);
        } catch {
          return key;
        }
      }
      if (typeof found === "string") return found;
      // Number / boolean / missing → fall back to the key for visibility.
      return key;
    },
    [lang],
  );

  const value = useMemo(
    () => ({ lang, setLang, toggleLang, t }),
    [lang, setLang, toggleLang, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error(
      "useI18n / useT / useLang must be called inside <I18nProvider>",
    );
  }
  return ctx;
}

/** Translation lookup. `t("nav.newChat")` etc. */
export function useT() {
  return useI18n().t;
}

/** Current language. */
export function useLang(): Lang {
  return useI18n().lang;
}

/** Switch language. */
export function useSetLang(): (lang: Lang) => void {
  return useI18n().setLang;
}

/** Flip between zh and en. */
export function useToggleLang(): () => void {
  return useI18n().toggleLang;
}
