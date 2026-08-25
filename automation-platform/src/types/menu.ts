import type { ThemePreference } from "./theme";

/**
 * An activation of a native menu item, delivered as a `menu://action` event.
 *
 * Mirrors `MenuAction` in Rust. The menu never acts on the application itself;
 * it sends one of these and the frontend runs the same code its own buttons do.
 */
export type MenuAction =
  | { kind: "selectWorkspace" }
  | { kind: "openWorkspace" }
  | { kind: "changeWorkspace" }
  | { kind: "scanWorkspace" }
  | { kind: "closeWorkspace" }
  | { kind: "revealWorkspace" }
  | { kind: "openRecent"; workspaceId: string }
  | { kind: "showDashboard" }
  | { kind: "showCases" }
  | { kind: "refresh" }
  | { kind: "setTheme"; theme: ThemePreference }
  | { kind: "showPreferences" }
  | { kind: "showDocumentation" }
  | { kind: "showShortcuts" };
