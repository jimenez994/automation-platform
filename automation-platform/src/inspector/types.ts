/** Identifying information captured from a DOM element. */
export interface ElementIdentity {
  tag: string;
  id: string | null;
  /** First few classes, for a compact, stable label. */
  classes: string[];
  testId: string | null;
  /** aria-label, title, alt, placeholder or button text — whatever is most useful. */
  label: string | null;
  /** Short snippet of visible text, if any. */
  text: string | null;
  /** A CSS-ish path built from tag/id/class/testid. */
  selector: string;
  /**
   * The React component this element belongs to, when a `DevInfo` wrapper is
   * in the DOM. `null` otherwise — never guessed from classes.
   */
  component: string | null;
  /** Source file for `component`, when it was declared. */
  sourceFile: string | null;
  /** Ancestor component names, outer → inner, from `DevInfo` markers. */
  hierarchy: string[];
  /** True when the element is part of the Developer Inspector itself. */
  isDeveloperTool: boolean;
}

/** The Developer Work Manager's three stages. */
export const WORK_COLUMNS = ["Backlog", "In Progress", "Completed"] as const;

export type WorkStatus = (typeof WORK_COLUMNS)[number];

/** Where a work item came from. */
export const WORK_ORIGINS = ["App", "Inspector", "Manual"] as const;
export type WorkOrigin = (typeof WORK_ORIGINS)[number];

/** Optional work-item classification. */
export const WORK_TYPES = ["Task", "Feature", "Bug"] as const;
export type WorkType = (typeof WORK_TYPES)[number];

/** Work-item priority. */
export const WORK_PRIORITIES = ["Low", "Normal", "High", "Urgent"] as const;
export type WorkPriority = (typeof WORK_PRIORITIES)[number];

/** One element the developer has selected, plus their note. */
export interface Selection {
  /** Unique in-memory key: a uuid for unsaved items, `String(number)` once saved. */
  id: string;
  /** The auto-increment work-item number (`#N`), null until saved. */
  number: number | null;
  identity: ElementIdentity;
  /** Manual item title; null for element-derived items. */
  title: string | null;
  origin: WorkOrigin;
  type: WorkType | null;
  priority: WorkPriority;
  note: string;
  addedAt: string;
  status: WorkStatus;
}

/** A persisted inspector note, mirroring `InspectorNote` in Rust. */
export interface InspectorNote {
  id: number;
  note: string;
  /** JSON-encoded element identity; null for manually created items. */
  identity: string | null;
  status: WorkStatus;
  origin: WorkOrigin;
  type: WorkType | null;
  priority: WorkPriority;
  title: string | null;
  updatedAt: string;
}

/** The fields for a note being created. */
export interface CreateNote {
  note: string;
  identity: ElementIdentity | null;
  status: WorkStatus;
  origin: WorkOrigin;
  type: WorkType | null;
  priority: WorkPriority;
  title: string | null;
}

/** The editable fields of an existing note. */
export interface UpdateNote {
  note: string;
  type: WorkType | null;
  priority: WorkPriority;
  title: string | null;
}

/**
 * Where inspector notes are persisted. The application uses the Tauri adapter;
 * tests inject an in-memory one, so the state machine is exercised without a
 * backend.
 */
export interface NoteStore {
  list(): Promise<InspectorNote[]>;
  create(input: CreateNote): Promise<number>;
  update(id: number, edit: UpdateNote): Promise<void>;
  setStatus(id: number, status: WorkStatus): Promise<void>;
  remove(id: number): Promise<void>;
  clear(): Promise<void>;
}
