/**
 * Persistence for Developer Inspector notes, via the Tauri backend.
 *
 * The state machine talks to a [`NoteStore`] interface, not to this module:
 * [`tauriNoteStore`] is the real adapter, [`noopNoteStore`] covers running
 * outside a Tauri window (a plain browser or jsdom), and [`defaultNoteStore`]
 * picks between them once instead of branching on every call.
 */
import { invoke } from "@tauri-apps/api/core";

import type {
  CreateNote,
  InspectorNote,
  NoteStore,
  UpdateNote,
  WorkStatus,
} from "dev-inspector";

/** True when running inside the Tauri webview (not a plain browser or jsdom). */
function hasTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** The real adapter: forwards each call to the Rust backend. */
export const tauriNoteStore: NoteStore = {
  async list() {
    return invoke<InspectorNote[]>("list_inspector_notes");
  },

  async create(input: CreateNote) {
    return invoke<number>("create_inspector_note", {
      note: input.note,
      identity: input.identity ? JSON.stringify(input.identity) : null,
      status: input.status,
      origin: input.origin,
      type: input.type,
      priority: input.priority,
      title: input.title,
    });
  },

  async update(id: number, edit: UpdateNote) {
    await invoke("update_inspector_note", {
      id,
      note: edit.note,
      type: edit.type,
      priority: edit.priority,
      title: edit.title,
    });
  },

  async setStatus(id: number, status: WorkStatus) {
    await invoke("set_inspector_note_status", { id, status });
  },

  async remove(id: number) {
    await invoke("remove_inspector_note", { id });
  },

  async clear() {
    await invoke("clear_inspector_notes");
  },
};

/**
 * The fallback used outside a Tauri window. Every call resolves silently,
 * exactly as the old per-call `hasTauri()` guards did, so the inspector state
 * machine can run under `npm run dev` (browser) or jsdom without a backend.
 */
export const noopNoteStore: NoteStore = {
  async list() {
    return [];
  },
  async create() {
    return 0;
  },
  async update() {},
  async setStatus() {},
  async remove() {},
  async clear() {},
};

/** The store the application should use, chosen once rather than per call. */
export function defaultNoteStore(): NoteStore {
  return hasTauri() ? tauriNoteStore : noopNoteStore;
}
