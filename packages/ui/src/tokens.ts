/**
 * Senvori design tokens — the TypeScript mirror of `styles.css` (@theme).
 *
 * Visual north star (Founding Principle 10): Linear, Stripe, Notion, Vercel —
 * restrained neutrals, one confident accent, generous whitespace, crisp type.
 * Components consume tokens; nothing hardcodes a raw value.
 */

export const colors = {
  // Neutral ramp (cool gray, Linear-like)
  neutral: {
    0: "oklch(100% 0 0)",
    50: "oklch(98.4% 0.002 260)",
    100: "oklch(96.5% 0.003 260)",
    200: "oklch(92.5% 0.004 260)",
    300: "oklch(86.5% 0.006 260)",
    400: "oklch(71% 0.01 260)",
    500: "oklch(55.5% 0.012 260)",
    600: "oklch(44.5% 0.012 260)",
    700: "oklch(37% 0.011 260)",
    800: "oklch(26.5% 0.009 260)",
    900: "oklch(20.5% 0.008 260)",
    950: "oklch(14.5% 0.007 260)",
  },
  // Brand accent (Senvori indigo-violet)
  brand: {
    50: "oklch(97% 0.014 285)",
    100: "oklch(93.5% 0.03 285)",
    200: "oklch(88% 0.06 285)",
    300: "oklch(80.5% 0.1 285)",
    400: "oklch(71.5% 0.15 285)",
    500: "oklch(62% 0.2 285)",
    600: "oklch(54.5% 0.22 285)",
    700: "oklch(48% 0.2 285)",
    800: "oklch(41.5% 0.17 285)",
    900: "oklch(36% 0.14 285)",
    950: "oklch(25.5% 0.1 285)",
  },
  // Semantic
  success: "oklch(64% 0.15 155)",
  warning: "oklch(76% 0.16 75)",
  danger: "oklch(58% 0.21 27)",
  info: "oklch(64% 0.14 240)",
} as const;

/** 4px-base spacing scale. */
export const spacing = {
  0: "0",
  1: "0.25rem",
  2: "0.5rem",
  3: "0.75rem",
  4: "1rem",
  5: "1.25rem",
  6: "1.5rem",
  8: "2rem",
  10: "2.5rem",
  12: "3rem",
  16: "4rem",
  20: "5rem",
  24: "6rem",
} as const;

export const typography = {
  fontSans:
    'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  fontMono: 'ui-monospace, "SF Mono", SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace',
  size: {
    xs: "0.75rem",
    sm: "0.875rem",
    base: "1rem",
    lg: "1.125rem",
    xl: "1.25rem",
    "2xl": "1.5rem",
    "3xl": "1.875rem",
    "4xl": "2.25rem",
  },
  weight: {
    regular: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
  },
  leading: {
    tight: "1.25",
    normal: "1.5",
    relaxed: "1.625",
  },
} as const;

export const radius = {
  sm: "0.25rem",
  md: "0.375rem",
  lg: "0.5rem",
  xl: "0.75rem",
  full: "9999px",
} as const;

export const shadows = {
  sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
  md: "0 2px 8px -2px rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.06)",
  lg: "0 8px 24px -6px rgb(0 0 0 / 0.12), 0 2px 6px -2px rgb(0 0 0 / 0.08)",
} as const;
