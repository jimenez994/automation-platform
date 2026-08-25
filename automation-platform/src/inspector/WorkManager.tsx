import { useEffect, useRef, useState } from "react";

import { Notice } from "../components/Notice";
import { DevInfo } from "../dev/DevInfo";
import { copyText } from "./clipboard";
import { itemTitle } from "./identify";
import { useInspector } from "./InspectorContext";
import { generateMarkdown } from "./markdown";
import {
  WORK_COLUMNS,
  WORK_PRIORITIES,
  WORK_TYPES,
  type Selection,
  type WorkOrigin,
  type WorkPriority,
  type WorkStatus,
  type WorkType,
} from "./types";

const MANAGER_SELECTED_CLASS = "inspector-manager-selected";

const STAGE_TONES: Record<WorkStatus, { dot: string; count: string }> = {
  Backlog: { dot: "bg-app-info", count: "text-app-info" },
  "In Progress": { dot: "bg-app-mauve", count: "text-app-mauve" },
  Completed: { dot: "bg-app-success", count: "text-app-success" },
};

const ORIGIN_TONES: Record<WorkOrigin, { dot: string; text: string; label: string }> = {
  App: { dot: "bg-app-info", text: "text-app-info", label: "App" },
  Inspector: { dot: "bg-app-mauve", text: "text-app-mauve", label: "Inspector" },
  Manual: { dot: "bg-app-warning", text: "text-app-warning", label: "Manual" },
};

const PRIORITY_TONES: Record<WorkPriority, string> = {
  Low: "text-app-muted",
  Normal: "text-app-subtext",
  High: "text-app-warning",
  Urgent: "text-app-error",
};

function moveStatus(status: WorkStatus, delta: number): WorkStatus {
  const index = WORK_COLUMNS.indexOf(status);
  const next = index + delta;
  if (next < 0 || next >= WORK_COLUMNS.length) return status;
  return WORK_COLUMNS[next];
}

interface EditingState {
  id: string;
  note: string;
  type: WorkType | null;
  priority: WorkPriority;
}

interface CardProps {
  selection: Selection;
  selected: boolean;
  editing: boolean;
  editDraft: EditingState;
  onToggleSelect: () => void;
  onStartEdit: () => void;
  onEditDraftChange: (draft: EditingState) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onOpenMenu: (x: number, y: number, selection: Selection) => void;
}

function WorkCard({
  selection,
  selected,
  editing,
  editDraft,
  onToggleSelect,
  onStartEdit,
  onEditDraftChange,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onOpenMenu,
}: CardProps) {
  const { identity, number, origin, type, priority } = selection;
  const originTone = ORIGIN_TONES[origin];

  return (
    <div
      draggable={!editing}
      onDragStart={(event) => event.dataTransfer.setData("text/plain", selection.id)}
      onClick={onToggleSelect}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onOpenMenu(event.clientX, event.clientY, selection);
      }}
      className={`bg-app-input space-y-1 rounded-md border p-2.5 ${
        selected ? "border-app-mauve" : "border-app-border"
      } ${editing ? "" : "cursor-grab active:cursor-grabbing"}`}
    >
      <div className="flex items-center gap-1.5">
        <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${originTone.dot}`} />
        <p className="text-app-text min-w-0 flex-1 truncate text-sm font-medium">
          <span className="text-app-muted">{number != null ? `#${number}` : "—"}</span>{" "}
          {itemTitle(selection)}
        </p>
        <span
          aria-hidden
          className={`h-2 w-2 shrink-0 rounded-full ${
            selected ? "bg-app-mauve" : "bg-transparent"
          }`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`text-[10px] font-medium ${originTone.text}`}>{originTone.label}</span>
        {type ? (
          <span className="border-app-border text-app-subtext rounded border px-1 text-[10px]">
            {type}
          </span>
        ) : null}
        <span className={`text-[10px] font-medium ${PRIORITY_TONES[priority]}`}>{priority}</span>
      </div>

      {identity.component ? (
        <p className="text-app-muted truncate text-xs">{identity.component}</p>
      ) : null}

      {identity.selector ? (
        <p className="text-app-muted truncate font-mono text-[10px]">
          {identity.tag} · {identity.selector}
        </p>
      ) : null}

      {editing ? (
        <div className="space-y-1.5 pt-1">
          <textarea
            value={editDraft.note}
            onChange={(event) => onEditDraftChange({ ...editDraft, note: event.target.value })}
            rows={2}
            autoFocus
            onClick={(event) => event.stopPropagation()}
            className="border-app-border bg-app-panel text-app-text placeholder:text-app-muted focus:border-app-accent w-full resize-y rounded-md border px-2 py-1 text-xs focus:outline-none"
          />
          <div className="flex gap-2">
            <select
              value={editDraft.type ?? ""}
              onChange={(event) =>
                onEditDraftChange({
                  ...editDraft,
                  type: (event.target.value || null) as WorkType | null,
                })
              }
              onClick={(event) => event.stopPropagation()}
              className="border-app-border bg-app-panel text-app-text rounded-md border px-1.5 py-1 text-xs focus:outline-none"
            >
              <option value="">No type</option>
              {WORK_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              value={editDraft.priority}
              onChange={(event) =>
                onEditDraftChange({ ...editDraft, priority: event.target.value as WorkPriority })
              }
              onClick={(event) => event.stopPropagation()}
              className="border-app-border bg-app-panel text-app-text rounded-md border px-1.5 py-1 text-xs focus:outline-none"
            >
              {WORK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onCancelEdit();
              }}
              className="text-app-subtext hover:text-app-text text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onSaveEdit();
              }}
              className="text-app-accent hover:text-app-accent-hover text-xs font-medium"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <p className="text-app-subtext line-clamp-2 text-xs">
          {selection.note.trim() || "(no note)"}
        </p>
      )}

      {!editing && identity.sourceFile ? (
        <p className="text-app-muted truncate font-mono text-[10px]">{identity.sourceFile}</p>
      ) : null}

      {!editing ? (
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onStartEdit();
            }}
            className="text-app-muted hover:text-app-text text-[10px]"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
            className="text-app-muted hover:text-app-error text-[10px]"
          >
            Delete
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Column({
  status,
  selections,
  selectedIds,
  editingId,
  editDraft,
  onDrop,
  onToggleSelect,
  onStartEdit,
  onEditDraftChange,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onOpenMenu,
}: {
  status: WorkStatus;
  selections: Selection[];
  selectedIds: Set<string>;
  editingId: string | null;
  editDraft: EditingState;
  onDrop: (id: string, status: WorkStatus) => void;
  onToggleSelect: (id: string) => void;
  onStartEdit: (selection: Selection) => void;
  onEditDraftChange: (draft: EditingState) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: (id: string) => void;
  onOpenMenu: (x: number, y: number, selection: Selection) => void;
}) {
  const tone = STAGE_TONES[status];
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);

  return (
    <div
      onDragEnter={() => {
        dragDepth.current += 1;
        setDragOver(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => {
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) setDragOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setDragOver(false);
        const id = event.dataTransfer.getData("text/plain");
        if (id) onDrop(id, status);
      }}
      className={`bg-app-panel flex min-w-56 flex-1 flex-col rounded-lg border ${
        dragOver ? "border-app-accent ring-2 ring-app-accent/40" : "border-app-border"
      }`}
    >
      <header className="border-app-border flex items-center gap-2 border-b px-3 py-2">
        <span aria-hidden className={`h-2 w-2 rounded-full ${tone.dot}`} />
        <h3 className="text-app-text flex-1 text-xs font-semibold tracking-wide uppercase">
          {status}
        </h3>
        <span className={`text-xs tabular-nums ${tone.count}`}>{selections.length}</span>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {selections.length === 0 ? (
          <p className="text-app-muted p-3 text-center text-xs">Drop cards here</p>
        ) : (
          selections.map((selection) => (
            <WorkCard
              key={selection.id}
              selection={selection}
              selected={selectedIds.has(selection.id)}
              editing={editingId === selection.id}
              editDraft={editDraft}
              onToggleSelect={() => onToggleSelect(selection.id)}
              onStartEdit={() => onStartEdit(selection)}
              onEditDraftChange={onEditDraftChange}
              onSaveEdit={onSaveEdit}
              onCancelEdit={onCancelEdit}
              onDelete={() => onDelete(selection.id)}
              onOpenMenu={onOpenMenu}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface MenuState {
  x: number;
  y: number;
  selection: Selection;
}

/** Form for creating a manual work item. */
function ManualItemForm({ onClose }: { onClose: () => void }) {
  const { createManualItem } = useInspector();
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [type, setType] = useState<WorkType | null>(null);
  const [priority, setPriority] = useState<WorkPriority>("Normal");

  async function save() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    try {
      await createManualItem({ title: trimmedTitle, note, type, priority });
      onClose();
    } catch {
      // the error is already surfaced through context
    }
  }

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/50 p-6" onClick={onClose}>
      <div
        className="bg-app-panel border-app-border w-full max-w-md space-y-3 rounded-lg border p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="text-app-text text-base font-semibold">New work item</h3>

        <label className="block space-y-1">
          <span className="text-app-muted text-xs">Title</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            autoFocus
            className="border-app-border bg-app-input text-app-text placeholder:text-app-muted focus:border-app-accent w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-app-muted text-xs">Note</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            className="border-app-border bg-app-input text-app-text placeholder:text-app-muted focus:border-app-accent w-full resize-y rounded-md border px-2 py-1.5 text-sm focus:outline-none"
          />
        </label>

        <div className="flex gap-2">
          <label className="flex-1 space-y-1">
            <span className="text-app-muted text-xs">Type</span>
            <select
              value={type ?? ""}
              onChange={(event) => setType((event.target.value || null) as WorkType | null)}
              className="border-app-border bg-app-input text-app-text w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none"
            >
              <option value="">No type</option>
              {WORK_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="flex-1 space-y-1">
            <span className="text-app-muted text-xs">Priority</span>
            <select
              value={priority}
              onChange={(event) => setPriority(event.target.value as WorkPriority)}
              className="border-app-border bg-app-input text-app-text w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none"
            >
              {WORK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="text-app-subtext hover:text-app-text rounded-md px-3 py-1.5 text-sm">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!title.trim()}
            className="bg-app-accent text-app-on-accent hover:bg-app-accent-hover disabled:opacity-50 rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The Developer Work Manager: a three-stage Kanban board of work items.
 */
export function WorkManager() {
  const {
    mode,
    workManagerOpen,
    closeWorkManager,
    selections,
    setSelectionStatus,
    removeSelection,
    editItem,
    error,
    clearError,
  } = useInspector();
  const [copied, setCopied] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditingState>({ id: "", note: "", type: null, priority: "Normal" });
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [showManualForm, setShowManualForm] = useState(false);

  useEffect(() => {
    if (!workManagerOpen) setSelectedIds(new Set());
  }, [workManagerOpen]);

  useEffect(() => {
    const elements: Element[] = [];
    for (const id of selectedIds) {
      const selection = selections.find((item) => item.id === id);
      if (!selection) continue;
      const element = document.querySelector(selection.identity.selector);
      if (element) {
        element.classList.add(MANAGER_SELECTED_CLASS);
        elements.push(element);
      }
    }
    return () => elements.forEach((element) => element.classList.remove(MANAGER_SELECTED_CLASS));
  }, [selectedIds, selections]);

  if (!workManagerOpen) return null;

  const selecting = mode === "inspecting";
  const selectedSelections = selections.filter((selection) => selectedIds.has(selection.id));

  function toggleSelect(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function startEdit(selection: Selection) {
    setEditingId(selection.id);
    setEditDraft({ id: selection.id, note: selection.note, type: selection.type, priority: selection.priority });
  }

  function saveEdit() {
    if (editingId != null) {
      editItem(editingId, {
        note: editDraft.note,
        type: editDraft.type,
        priority: editDraft.priority,
        title: selections.find((s) => s.id === editingId)?.title ?? null,
      });
    }
    setEditingId(null);
  }

  async function copySelected() {
    try {
      await copyText(generateMarkdown(selectedSelections));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Could not copy the notes:", error);
    }
  }

  return (
    <div
      className={`fixed inset-0 z-[2000] flex items-center justify-center p-6 ${
        selecting ? "bg-black/10" : "bg-black/50"
      }`}
      onClick={selecting ? undefined : closeWorkManager}
    >
      <DevInfo name="WorkManager" file="src/inspector/WorkManager.tsx" kind="developer-tool">
        <div
          className="bg-app-bg border-app-border flex h-[85vh] w-full max-w-6xl flex-col rounded-xl border shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <header className="border-app-border flex items-center justify-between border-b px-5 py-4">
            <h2 className="text-app-text text-lg font-semibold">Developer Work Manager</h2>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowManualForm(true)}
                className="bg-app-panel text-app-text border-app-border hover:border-app-border-strong rounded-md border px-3 py-1.5 text-sm font-medium transition-colors"
              >
                + New
              </button>
              <button
                type="button"
                onClick={copySelected}
                disabled={selectedSelections.length === 0}
                className="bg-app-panel text-app-text border-app-border hover:border-app-border-strong disabled:opacity-50 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors"
              >
                {copied ? "Copied ✓" : "Copy Selected"}
              </button>
              <button
                type="button"
                onClick={closeWorkManager}
                aria-label="Close"
                className="text-app-muted hover:text-app-text text-lg leading-none"
              >
                ✕
              </button>
            </div>
          </header>

          {error ? (
            <div className="border-app-border flex items-start justify-between gap-2 border-b px-5 py-3">
              <Notice tone="error">{error}</Notice>
              <button
                type="button"
                onClick={clearError}
                className="text-app-muted hover:text-app-text text-xs"
              >
                Dismiss
              </button>
            </div>
          ) : null}

          <div className="flex flex-1 gap-3 overflow-x-auto p-4">
            {WORK_COLUMNS.map((column) => (
              <Column
                key={column}
                status={column}
                selections={selections.filter((selection) => selection.status === column)}
                selectedIds={selectedIds}
                editingId={editingId}
                editDraft={editDraft}
                onDrop={setSelectionStatus}
                onToggleSelect={toggleSelect}
                onStartEdit={startEdit}
                onEditDraftChange={setEditDraft}
                onSaveEdit={saveEdit}
                onCancelEdit={() => setEditingId(null)}
                onDelete={removeSelection}
                onOpenMenu={(x, y, selection) => setMenu({ x, y, selection })}
              />
            ))}
          </div>
        </div>
      </DevInfo>

      {menu ? (
        <div
          className="fixed inset-0 z-[2900]"
          onClick={() => setMenu(null)}
          onContextMenu={(event) => {
            event.preventDefault();
            setMenu(null);
          }}
        >
          <div
            className="bg-app-panel border-app-border absolute flex w-44 flex-col rounded-md border py-1 text-sm shadow-xl"
            style={{ left: menu.x, top: menu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              disabled={menu.selection.status === "Completed"}
              onClick={() => {
                setSelectionStatus(menu.selection.id, moveStatus(menu.selection.status, 1));
                setMenu(null);
              }}
              className="text-app-text hover:bg-app-raised disabled:opacity-40 px-3 py-1.5 text-left"
            >
              Move to next
            </button>
            <button
              type="button"
              disabled={menu.selection.status === "Backlog"}
              onClick={() => {
                setSelectionStatus(menu.selection.id, moveStatus(menu.selection.status, -1));
                setMenu(null);
              }}
              className="text-app-text hover:bg-app-raised disabled:opacity-40 px-3 py-1.5 text-left"
            >
              Move back
            </button>
            <div className="border-app-border my-1 border-t" />
            <button
              type="button"
              onClick={() => {
                startEdit(menu.selection);
                setMenu(null);
              }}
              className="text-app-text hover:bg-app-raised px-3 py-1.5 text-left"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => {
                removeSelection(menu.selection.id);
                setMenu(null);
              }}
              className="text-app-error hover:bg-app-raised px-3 py-1.5 text-left"
            >
              Delete
            </button>
          </div>
        </div>
      ) : null}

      {showManualForm ? <ManualItemForm onClose={() => setShowManualForm(false)} /> : null}
    </div>
  );
}
