export const THEME_PREFERENCES = ["system", "light", "dark"] as const;

/** What the user chose. `system` follows the operating system. */
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/** What is actually applied to the document. */
export type ResolvedTheme = "light" | "dark";

export const THEME_LABELS: Record<ThemePreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};
