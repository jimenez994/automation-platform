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

import {
  clearInspectorNotes,
  createInspectorNote,
  listInspectorNotes,
  removeInspectorNote,
  setInspectorNoteStatus,
  updateInspectorNote,
} from "../services/inspectorNotes";
import { manualIdentity, newSelectionId } from "./identify";
import {
  WORK_COLUMNS,
  WORK_ORIGINS,
  type ElementIdentity,
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
}

export function InspectorProvider({ children, workspaceId }: InspectorProviderProps) {
  const [mode, setMode] = useState<InspectorMode>("idle");
  const [workManagerOpen, setWorkManagerOpen] = useState(false);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [activeSelectionId, setActiveSelectionId] = useState<string | null>(null);

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
      const number = await createInspectorNote(
        note,
        target.identity,
        target.status,
        target.origin,
        target.type,
        target.priority,
        target.title,
      );
      setSelections((current) =>
        current.map((selection) =>
          selection.id === id
            ? { ...selection, note, number, id: String(number) }
            : selection,
        ),
      );
    } catch (error) {
      console.error("Could not save the inspector note:", error);
    }

    setActiveSelectionId(null);
    setMode("idle");
  }, []);

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
    const target = selectionsRef.current.find((selection) => selection.id === id);
    if (target?.number != null) {
      void removeInspectorNote(target.number).catch(() => {});
    }
    setSelections((current) => current.filter((selection) => selection.id !== id));
    setActiveSelectionId((current) => (current === id ? null : current));
  }, []);

  // Edits a saved work item's fields.
  const editItem = useCallback((id: string, fields: EditableItemFields) => {
    const target = selectionsRef.current.find((selection) => selection.id === id);
    if (target?.number != null) {
      void updateInspectorNote(
        target.number,
        fields.note,
        fields.type,
        fields.priority,
        fields.title,
      ).catch(() => {});
    }
    setSelections((current) =>
      current.map((selection) =>
        selection.id === id ? { ...selection, ...fields } : selection,
      ),
    );
  }, []);

  // Creates a manual work item directly (no element involved).
  const createManualItem = useCallback(async (fields: ManualItemFields) => {
    try {
      const number = await createInspectorNote(
        fields.note,
        null,
        "Backlog",
        "Manual",
        fields.type,
        fields.priority,
        fields.title,
      );
      setSelections((current) => [
        ...current,
        {
          id: String(number),
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
      console.error("Could not create the manual work item:", error);
    }
  }, []);

  const clearSelections = useCallback(() => {
    setSelections([]);
    setActiveSelectionId(null);
    void clearInspectorNotes().catch(() => {});
  }, []);

  const setSelectionStatus = useCallback((id: string, status: WorkStatus) => {
    const target = selectionsRef.current.find((selection) => selection.id === id);
    if (target?.number != null) {
      void setInspectorNoteStatus(target.number, status).catch(() => {});
    }
    setSelections((current) =>
      current.map((selection) =>
        selection.id === id ? { ...selection, status } : selection,
      ),
    );
  }, []);

  // Load the persisted notes for the open workspace.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!workspaceId) return;

      try {
        const notes = await listInspectorNotes();

        if (cancelled) return;

        const columns = WORK_COLUMNS as readonly string[];
        const origins = WORK_ORIGINS as readonly string[];

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
              type: note.type,
              priority: note.priority,
              note: note.note,
              addedAt: note.updatedAt,
              status: columns.includes(note.status) ? (note.status as WorkStatus) : "Backlog",
            };
          }),
        );
      } catch (error) {
        console.error("Could not load the inspector notes:", error);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const value = useMemo(
    () => ({
      mode,
      workManagerOpen,
      selections,
      activeSelectionId,
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
