/**
 * Theme preference and application.
 *
 * The preference is stored by Rust alongside the other application settings, so
 * it survives a restart and the native View → Theme menu and the UI always
 * agree. Only `light` or `dark` is ever written to the document; `system` is
 * resolved here.
 */
import { invoke } from "@tauri-apps/api/core";

import type { ResolvedTheme, ThemePreference } from "../types";

const DARK_QUERY = "(prefers-color-scheme: dark)";

export function getTheme(): Promise<ThemePreference> {
  return invoke<ThemePreference>("get_theme");
}

export function setTheme(theme: ThemePreference): Promise<void> {
  return invoke<void>("set_theme", { theme });
}

/** What the operating system is currently asking for. */
export function systemTheme(): ResolvedTheme {
  return window.matchMedia?.(DARK_QUERY).matches ? "dark" : "light";
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? systemTheme() : preference;
}

/** Writes the resolved theme to `<html data-theme>`, which is what the CSS reads. */
export function applyTheme(theme: ResolvedTheme): void {
  document.documentElement.setAttribute("data-theme", theme);
}

/**
 * Calls `onChange` when the operating system switches appearance.
 *
 * Returns an unsubscribe function. Only useful while the preference is
 * `system`; the caller stops listening otherwise.
 */
export function watchSystemTheme(onChange: (theme: ResolvedTheme) => void): () => void {
  const query = window.matchMedia?.(DARK_QUERY);
  if (!query) return () => {};

  const handler = (event: MediaQueryListEvent) => onChange(event.matches ? "dark" : "light");
  query.addEventListener("change", handler);

  return () => query.removeEventListener("change", handler);
}
