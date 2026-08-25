import { DevInfo } from "../dev/DevInfo";
import { InspectorOverlay } from "./InspectorOverlay";
import { InspectorProvider, useInspector } from "./InspectorContext";
import { QuickNoteModal } from "./QuickNoteModal";
import { WorkManager } from "./WorkManager";

function CrosshairIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-4 w-4"
      aria-hidden
    >
      <circle cx="12" cy="12" r="6" />
      <path strokeLinecap="round" d="M12 2v4m0 12v4M2 12h4m12 0h4" />
    </svg>
  );
}

function BoardIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-4 w-4"
      aria-hidden
    >
      <rect x="3" y="4" width="5" height="16" rx="1" />
      <rect x="10" y="4" width="4" height="9" rx="1" />
      <rect x="16" y="4" width="5" height="13" rx="1" />
    </svg>
  );
}

/**
 * The two bottom-right controls.
 *
 *   - Select (crosshair) — arms/disarms the selector, so hovering + clicking
 *     picks an element and opens the quick-note modal.
 *   - Manage (board) — opens the Developer Work Manager Kanban.
 */
function InspectorControls() {
  const { mode, workManagerOpen, toggleSelector, toggleWorkManager } = useInspector();
  const selecting = mode === "inspecting";
  const noting = mode === "noting";

  const base =
    "inline-flex items-center justify-center rounded-full border p-2 shadow-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div className="fixed right-4 bottom-4 z-[2100] flex items-center gap-2">
      <DevInfo name="InspectorSelectButton" file="src/inspector/Inspector.tsx" kind="developer-tool">
        <button
          type="button"
          data-inspector-control
          onClick={toggleSelector}
          disabled={noting}
          title={noting ? "Save or cancel the note first" : selecting ? "Stop selecting" : "Select an element"}
          aria-label={noting ? "Save or cancel the note first" : selecting ? "Stop selecting" : "Select an element"}
          aria-pressed={selecting}
          className={`${base} ${
            selecting
              ? "bg-app-accent text-app-on-accent border-app-accent-hover"
              : "bg-app-panel text-app-subtext border-app-border hover:text-app-text hover:border-app-border-strong"
          }`}
        >
          <CrosshairIcon />
        </button>
      </DevInfo>

      <DevInfo name="WorkManagerButton" file="src/inspector/Inspector.tsx" kind="developer-tool">
        <button
          type="button"
          data-inspector-control
          onClick={toggleWorkManager}
          title={workManagerOpen ? "Close the Work Manager" : "Open the Work Manager"}
          aria-label={workManagerOpen ? "Close the Work Manager" : "Open the Work Manager"}
          aria-pressed={workManagerOpen}
          className={`${base} ${
            workManagerOpen
              ? "bg-app-accent text-app-on-accent border-app-accent-hover"
              : "bg-app-panel text-app-subtext border-app-border hover:text-app-text hover:border-app-border-strong"
          }`}
        >
          <BoardIcon />
        </button>
      </DevInfo>
    </div>
  );
}

/** The Developer Inspector. Available in every build, including release. */
export function Inspector({ workspaceId }: { workspaceId: string | null }) {
  return (
    <InspectorProvider workspaceId={workspaceId}>
      <InspectorOverlay />
      <InspectorControls />
      <QuickNoteModal />
      <WorkManager />
    </InspectorProvider>
  );
}
