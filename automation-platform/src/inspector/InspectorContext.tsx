import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { defaultNoteStore } from "../services/inspectorNotes";
import { manualIdentity, newSelectionId } from "./identify";
import {
  WORK_COLUMNS,
  WORK_ORIGINS,
  WORK_PRIORITIES,
  WORK_TYPES,
  type ElementIdentity,
  type NoteStore,
  type Selection,
  type WorkOrigin,
  type WorkPriority,
  type WorkStatus,
  type WorkType,
} from "./types";

export type InspectorMode = "idle" | "inspecting" | "noting";

interface InspectorState {
  mode: InspectorMode;
  workManagerOpen: boolean;
  selections: Selection[];
  activeSelectionId: string | null;
  error: string | null;
  clearError: () => void;
  toggleSelector: () => void;
  toggleWorkManager: () => void;
  closeWorkManager: () => void;
  addSelection: (identity: ElementIdentity) => void;
  saveNote: (id: string, note: string) => void;
  cancelNote: () => void;
  removeSelection: (id: string) => void;
  editItem: (id: string, fields: EditableItemFields) => void;
  createManualItem: (fields: ManualItemFields) => Promise<void>;
  clearSelections: () => void;
  setSelectionStatus: (id: string, status: WorkStatus) => void;
}

export interface EditableItemFields {
  note: string;
  type: WorkType | null;
  priority: WorkPriority;
  title: string | null;
}

export interface ManualItemFields {
  title: string;
  note: string;
  type: WorkType | null;
  priority: WorkPriority;
}

const InspectorContext = createContext<InspectorState | null>(null);

interface InspectorProviderProps {
  children: ReactNode;
  workspaceId: string | null;
  /** Persistence seam; defaults to the Tauri adapter, or a no-op in a browser. */
  store?: NoteStore;
}

export function InspectorProvider({
  children,
  workspaceId,
  store = defaultNoteStore(),
}: InspectorProviderProps) {
  const [mode, setMode] = useState<InspectorMode>("idle");
  const [workManagerOpen, setWorkManagerOpen] = useState(false);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [activeSelectionId, setActiveSelectionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const activeSelectionIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeSelectionIdRef.current = activeSelectionId;
  }, [activeSelectionId]);

  const selectionsRef = useRef<Selection[]>([]);
  useEffect(() => {
    selectionsRef.current = selections;
  }, [selections]);

  const toggleSelector = useCallback(() => {
    setMode((current) => {
      if (current === "noting") return current;
      return current === "inspecting" ? "idle" : "inspecting";
    });
  }, []);

  const toggleWorkManager = useCallback(() => {
    setWorkManagerOpen((open) => !open);
  }, []);

  const closeWorkManager = useCallback(() => {
    setWorkManagerOpen(false);
  }, []);

  // Selecting an element locks it in the quick-note modal. Origin is derived
  // from whether the element belongs to the inspector's own UI.
  const addSelection = useCallback((identity: ElementIdentity) => {
    const id = newSelectionId();

    setSelections((current) => [
      ...current,
      {
        id,
        number: null,
        identity,
        title: null,
        origin: identity.isDeveloperTool ? "Inspector" : "App",
        type: null,
        priority: "Normal",
        note: "",
        addedAt: new Date().toISOString(),
        status: "Backlog",
      },
    ]);

    setActiveSelectionId(id);
    setMode("noting");
  }, []);

  const saveNote = useCallback(async (id: string, note: string) => {
    const target = selectionsRef.current.find((selection) => selection.id === id);
    if (!target) return;

    try {
      const number = await store.create({
        note,
        identity: target.identity,
        status: target.status,
        origin: target.origin,
        type: target.type,
        priority: target.priority,
        title: target.title,
      });
      setSelections((current) =>
        current.map((selection) =>
          selection.id === id
            ? { ...selection, note, number }
            : selection,
        ),
      );
      setActiveSelectionId(null);
      setMode("idle");
    } catch (error) {
      setError("Could not save the work item. Please try again.");
    }
  }, [store]);

  // Cancel discards only the current (unsaved) work item.
  const cancelNote = useCallback(() => {
    const id = activeSelectionIdRef.current;
    if (id !== null) {
      setSelections((current) => current.filter((selection) => selection.id !== id));
    }
    setActiveSelectionId(null);
    setMode("idle");
  }, []);

  const removeSelection = useCallback((id: string) => {
    const index = selectionsRef.current.findIndex((selection) => selection.id === id);
    if (index < 0) return;
    const removed = selectionsRef.current[index];

    setSelections((current) => current.filter((selection) => selection.id !== id));
    setActiveSelectionId((current) => (current === id ? null : current));

    if (removed.number != null) {
      void store.remove(removed.number).catch(() => {
        setSelections((current) => {
          const next = [...current];
          next.splice(Math.min(index, next.length), 0, removed);
          return next;
        });
        setError("Could not delete the work item.");
      });
    }
  }, [store]);

  // Edits a saved work item's fields.
  const editItem = useCallback((id: string, fields: EditableItemFields) => {
    const target = selectionsRef.current.find((selection) => selection.id === id);
    if (!target) return;

    setSelections((current) =>
      current.map((selection) =>
        selection.id === id ? { ...selection, ...fields } : selection,
      ),
    );

    if (target.number != null) {
      void store
        .update(target.number, {
          note: fields.note,
          type: fields.type,
          priority: fields.priority,
          title: fields.title,
        })
        .catch(() => {
          setSelections((current) =>
            current.map((selection) =>
              selection.id === id ? target : selection,
            ),
          );
          setError("Could not save the changes.");
        });
    }
  }, [store]);

  // Creates a manual work item directly (no element involved).
  const createManualItem = useCallback(async (fields: ManualItemFields) => {
    try {
      const number = await store.create({
        note: fields.note,
        identity: null,
        status: "Backlog",
        origin: "Manual",
        type: fields.type,
        priority: fields.priority,
        title: fields.title,
      });
      setSelections((current) => [
        ...current,
        {
          id: newSelectionId(),
          number,
          identity: manualIdentity(),
          title: fields.title,
          origin: "Manual",
          type: fields.type,
          priority: fields.priority,
          note: fields.note,
          addedAt: new Date().toISOString(),
          status: "Backlog",
        },
      ]);
    } catch (error) {
      setError("Could not create the work item. Please try again.");
      throw error;
    }
  }, [store]);

  const clearSelections = useCallback(() => {
    const previous = selectionsRef.current;
    setSelections([]);
    setActiveSelectionId(null);

    void store.clear().catch(() => {
      setSelections(previous);
      setError("Could not clear the work items.");
    });
  }, [store]);

  const setSelectionStatus = useCallback((id: string, status: WorkStatus) => {
    const target = selectionsRef.current.find((selection) => selection.id === id);
    if (!target) return;

    setSelections((current) =>
      current.map((selection) =>
        selection.id === id ? { ...selection, status } : selection,
      ),
    );

    if (target.number != null) {
      void store.setStatus(target.number, status).catch(() => {
        setSelections((current) =>
          current.map((selection) =>
            selection.id === id ? { ...selection, status: target.status } : selection,
          ),
        );
        setError("Could not move the work item.");
      });
    }
  }, [store]);

  // Load the persisted notes for the open workspace.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!workspaceId) return;

      try {
        const notes = await store.list();

        if (cancelled) return;

        const columns = WORK_COLUMNS as readonly string[];
        const origins = WORK_ORIGINS as readonly string[];
        const priorities = WORK_PRIORITIES as readonly string[];
        const types = WORK_TYPES as readonly string[];

        setSelections(
          notes.map((note) => {
            const identity = note.identity
              ? (JSON.parse(note.identity) as ElementIdentity)
              : manualIdentity();

            return {
              id: String(note.id),
              number: note.id,
              identity,
              title: note.title,
              origin: origins.includes(note.origin) ? (note.origin as WorkOrigin) : "App",
              type: note.type != null && types.includes(note.type) ? (note.type as WorkType) : null,
              priority: priorities.includes(note.priority) ? (note.priority as WorkPriority) : "Normal",
              note: note.note,
              addedAt: note.updatedAt,
              status: columns.includes(note.status) ? (note.status as WorkStatus) : "Backlog",
            };
          }),
        );
      } catch (error) {
        setError("Could not load the work items.");
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, store]);

  const value = useMemo(
    () => ({
      mode,
      workManagerOpen,
      selections,
      activeSelectionId,
      error,
      clearError,
      toggleSelector,
      toggleWorkManager,
      closeWorkManager,
      addSelection,
      saveNote,
      cancelNote,
      removeSelection,
      editItem,
      createManualItem,
      clearSelections,
      setSelectionStatus,
    }),
    [
      mode,
      workManagerOpen,
      selections,
      activeSelectionId,
      error,
      clearError,
      toggleSelector,
      toggleWorkManager,
      closeWorkManager,
      addSelection,
      saveNote,
      cancelNote,
      removeSelection,
      editItem,
      createManualItem,
      clearSelections,
      setSelectionStatus,
    ],
  );

  return (
    <InspectorContext.Provider value={value}>{children}</InspectorContext.Provider>
  );
}

export function useInspector(): InspectorState {
  const context = useContext(InspectorContext);
  if (!context) {
    throw new Error("useInspector must be used within an InspectorProvider");
  }

  return context;
}
