/**
 * @senvori/i18n — internationalization infrastructure (D8, Founding Principle 2).
 *
 * - UI strings live in `locales/<tag>.json` as keys + ICU MessageFormat values.
 * - Zero hardcoded text: an ESLint rule blocks string literals in components.
 * - Date/number/currency formatting always goes through `Intl`, never manual.
 * - Database content translation (per-entity table) is a backend concern — see Core Domains §0.1.
 * - TMS pipeline (Tolgee/Crowdin) plugs into the `locales/` catalogs in a later phase.
 */

export const SUPPORTED_LOCALES = ["pt-BR", "en-US", "es-ES"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** Final fallback of the locale chain: user → unit → tenant → EN (D8). */
export const DEFAULT_LOCALE: Locale = "en-US";

/** Locales the architecture is prepared for (Founding Principle 2) — not yet shipped. */
export const PLANNED_LOCALES = [
  "fr-FR",
  "de-DE",
  "it-IT",
  "ja-JP",
  "ko-KR",
  "zh-CN",
  "ar-SA",
] as const;

export const isSupportedLocale = (value: string): value is Locale =>
  (SUPPORTED_LOCALES as readonly string[]).includes(value);

/** Resolves an arbitrary tag to a supported locale, applying the EN fallback. */
export const resolveLocale = (value: string | null | undefined): Locale => {
  if (!value) return DEFAULT_LOCALE;
  if (isSupportedLocale(value)) return value;
  const base = value.split("-")[0];
  const match = SUPPORTED_LOCALES.find((l) => l.startsWith(`${base}-`));
  return match ?? DEFAULT_LOCALE;
};

export type Messages = Record<string, unknown>;

/** Loads the message catalog for a locale (used by next-intl request config). */
export const loadMessages = async (locale: Locale): Promise<Messages> => {
  switch (locale) {
    case "pt-BR":
      return (await import("../locales/pt-BR.json")).default;
    case "es-ES":
      return (await import("../locales/es-ES.json")).default;
    case "en-US":
      return (await import("../locales/en-US.json")).default;
  }
};
