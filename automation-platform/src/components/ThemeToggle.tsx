import type { ResolvedTheme } from "../types";

interface Props {
  /** What is actually rendered right now. */
  resolved: ResolvedTheme;
  /** Flips Light ↔ Dark, and stores the choice. */
  onToggle: () => void;
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path
        strokeLinecap="round"
        d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}

/**
 * Compact Light ↔ Dark toggle for the application header.
 *
 * This is a convenience, not a second theme system: it flips between the two
 * explicit themes through the same `chooseTheme` path the Preferences overlay
 * and the native View → Theme menu use, so the stored preference and the menu
 * checkmark stay in sync. `System` remains available there and in Preferences.
 */
export function ThemeToggle({ resolved, onToggle }: Props) {
  const target = resolved === "dark" ? "light" : "dark";
  const label = resolved === "dark" ? "Switch to light theme" : "Switch to dark theme";

  return (
    <button
      type="button"
      onClick={onToggle}
      title={label}
      aria-label={label}
      className="bg-app-inverse-bg text-app-inverse-text inline-flex items-center gap-2 rounded-full border border-transparent px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-90"
    >
      {resolved === "dark" ? <SunIcon /> : <MoonIcon />}
      <span className="hidden sm:inline">{target === "dark" ? "Dark" : "Light"}</span>
    </button>
  );
}
