/**
 * Persistence for Developer Inspector notes.
 *
 * Notes are saved to the open workspace's SQLite database via the Tauri
 * backend. Outside a real Tauri window (e.g. the unit-test jsdom environment)
 * every function resolves silently, so the inspector state machine can be
 * exercised without a backend.
 */
import { invoke } from "@tauri-apps/api/core";

import type {
  ElementIdentity,
  WorkOrigin,
  WorkPriority,
  WorkStatus,
  WorkType,
} from "../inspector/types";

/** A persisted inspector note, mirroring `InspectorNote` in Rust. */
export interface InspectorNote {
  id: number;
  note: string;
  identity: string | null;
  status: WorkStatus;
  origin: WorkOrigin;
  type: WorkType | null;
  priority: WorkPriority;
  title: string | null;
  updatedAt: string;
}

/** True when running inside the Tauri webview (not a plain browser or jsdom). */
function hasTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function listInspectorNotes(): Promise<InspectorNote[]> {
  if (!hasTauri()) return [];
  return invoke<InspectorNote[]>("list_inspector_notes");
}

/** Creates a note and returns its new `#N`. */
export async function createInspectorNote(
  note: string,
  identity: ElementIdentity | null,
  status: WorkStatus,
  origin: WorkOrigin,
  type: WorkType | null,
  priority: WorkPriority,
  title: string | null,
): Promise<number> {
  if (!hasTauri()) return 0;
  return invoke<number>("create_inspector_note", {
    note,
    identity: identity ? JSON.stringify(identity) : null,
    status,
    origin,
    type,
    priority,
    title,
  });
}

export async function updateInspectorNote(
  id: number,
  note: string,
  type: WorkType | null,
  priority: WorkPriority,
  title: string | null,
): Promise<void> {
  if (!hasTauri()) return;
  await invoke("update_inspector_note", { id, note, type, priority, title });
}

export async function setInspectorNoteStatus(
  id: number,
  status: WorkStatus,
): Promise<void> {
  if (!hasTauri()) return;
  await invoke("set_inspector_note_status", { id, status });
}

export async function removeInspectorNote(id: number): Promise<void> {
  if (!hasTauri()) return;
  await invoke("remove_inspector_note", { id });
}

export async function clearInspectorNotes(): Promise<void> {
  if (!hasTauri()) return;
  await invoke("clear_inspector_notes");
}
