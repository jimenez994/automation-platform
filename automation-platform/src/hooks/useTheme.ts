import { useCallback, useEffect, useState } from "react";

import {
  applyTheme,
  getTheme,
  resolveTheme,
  setTheme as persistTheme,
  watchSystemTheme,
} from "../services/theme";
import type { ThemePreference } from "../types";

/**
 * Keeps the document's theme in step with the stored preference.
 *
 * The preference lives in Rust so it survives restarts and the native
 * View → Theme menu stays in agreement. `system` is followed live: if the user
 * switches appearance while the application is open, this follows without a
 * restart.
 */
export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>("system");

  useEffect(() => {
    let cancelled = false;

    getTheme()
      .then((stored) => {
        if (cancelled) return;
        setPreference(stored);
      })
      .catch((error) => {
        // A theme we cannot read is not worth blocking startup over; the
        // default already matches the operating system.
        console.error("Could not read the theme preference:", error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    applyTheme(resolveTheme(preference));

    if (preference !== "system") return;
    return watchSystemTheme(applyTheme);
  }, [preference]);

  /** Chooses a theme and stores it. */
  const chooseTheme = useCallback(async (next: ThemePreference) => {
    setPreference(next);
    try {
      await persistTheme(next);
    } catch (error) {
      console.error("Could not save the theme preference:", error);
    }
  }, []);

  /**
   * Adopts a theme chosen elsewhere — the native menu, which has already
   * stored it. Saving again here would be a redundant write.
   */
  const adoptTheme = useCallback((next: ThemePreference) => {
    setPreference(next);
  }, []);

  // The theme actually applied right now. Exposed so callers (e.g. a
  // light/dark toggle) can reason about the effective appearance without
  // re-deriving it from `preference` + the system setting.
  const resolved = resolveTheme(preference);

  return { preference, resolved, chooseTheme, adoptTheme };
}
