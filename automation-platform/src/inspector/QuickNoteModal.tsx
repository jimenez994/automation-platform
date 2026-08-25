import { useEffect, useState } from "react";

import { Notice } from "../components/Notice";
import { DevInfo } from "../dev/DevInfo";
import { selectionTitle } from "./identify";
import { useInspector } from "./InspectorContext";
import type { Selection } from "./types";

/** Compact identity readout for the selected element. */
function IdentityFields({ selection }: { selection: Selection }) {
  const { identity } = selection;

  const rows: Array<[string, string]> = [];
  if (identity.component) rows.push(["Component", identity.component]);
  if (identity.sourceFile) rows.push(["Source", identity.sourceFile]);
  rows.push(["Element", identity.selector]);
  if (identity.hierarchy.length > 0) rows.push(["Hierarchy", identity.hierarchy.join(" → ")]);

  return (
    <dl className="space-y-0.5">
      {rows.map(([label, value]) => (
        <div key={label} className="flex gap-2 text-xs">
          <dt className="text-app-muted w-20 shrink-0">{label}</dt>
          <dd className="text-app-subtext min-w-0 truncate font-mono">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The quick-note modal, shown immediately after an element is selected. Save
 * commits the note as a new Backlog work item; Cancel discards the selection.
 */
export function QuickNoteModal() {
  const { mode, selections, activeSelectionId, saveNote, cancelNote, error } = useInspector();
  const [draft, setDraft] = useState("");

  const activeSelection = activeSelectionId
    ? selections.find((selection) => selection.id === activeSelectionId)
    : null;

  // Start each note fresh from the selected element's existing note (usually "").
  useEffect(() => {
    setDraft(activeSelection?.note ?? "");
  }, [activeSelection?.id]);

  if (mode !== "noting" || !activeSelection) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-6">
      <DevInfo name="QuickNoteModal" file="src/inspector/QuickNoteModal.tsx" kind="developer-tool">
        <div className="bg-app-panel border-app-border w-full max-w-md space-y-4 rounded-lg border p-5 shadow-2xl">
          <div>
            <p className="text-app-muted text-[10px] font-medium tracking-wide uppercase">
              New work item
            </p>
            <h2 className="text-app-text text-base font-semibold">
              {selectionTitle(activeSelection.identity)}
            </h2>
            <div className="mt-2">
              <IdentityFields selection={activeSelection} />
            </div>
          </div>

          <label className="block space-y-1">
            <span className="text-app-muted text-xs">Note</span>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Describe the change…"
              rows={3}
              autoFocus
              className="border-app-border bg-app-input text-app-text placeholder:text-app-muted focus:border-app-accent w-full resize-y rounded-md border px-2 py-1.5 text-sm focus:outline-none"
            />
          </label>

          {error ? <Notice tone="error">{error}</Notice> : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={cancelNote}
              className="text-app-subtext hover:text-app-text rounded-md px-3 py-1.5 text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => saveNote(activeSelection.id, draft)}
              className="bg-app-accent text-app-on-accent hover:bg-app-accent-hover rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      </DevInfo>
    </div>
  );
}
