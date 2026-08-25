/** Native menu activations, delivered from Rust as events. */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import type { MenuAction } from "../types";

const MENU_EVENT = "menu://action";

export function onMenuAction(handler: (action: MenuAction) => void): Promise<UnlistenFn> {
  return listen<MenuAction>(MENU_EVENT, (event) => handler(event.payload));
}

/**
 * Rebuilds the native menu from the current application state.
 *
 * Called after anything that changes what should be selectable. Most commands
 * already do this on the Rust side; this covers the cases the frontend knows
 * about first.
 */
export function refreshMenu(): Promise<void> {
  return invoke<void>("refresh_menu");
}
