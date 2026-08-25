import { formatTimestamp } from "../services/format";
import type { RecentWorkspace } from "../types";
import { Button } from "./Button";

interface Props {
  workspaces: RecentWorkspace[];
  busy: boolean;
  onOpen: (workspace: RecentWorkspace) => void;
  onLocate: (workspace: RecentWorkspace) => void;
  onRemove: (workspace: RecentWorkspace) => void;
}

/**
 * The recent-workspaces list.
 *
 * A workspace whose folder is gone is marked unavailable and offers to be
 * relocated; it is never removed on the user's behalf.
 */
export function RecentWorkspaceList({ workspaces, busy, onOpen, onLocate, onRemove }: Props) {
  if (workspaces.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-app-muted text-sm font-medium tracking-wide uppercase">
        Recent Workspaces
      </h2>

      <ul className="space-y-2">
        {workspaces.map((workspace) => (
          <li
            key={workspace.workspaceId}
            className="border-app-border bg-app-panel flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-app-text flex items-center gap-2">
                {workspace.workspaceName}
                {!workspace.available ? (
                  <span className="border-app-warning/40 bg-app-raised text-app-warning rounded-full border px-2 py-0.5 text-xs">
                    Unavailable
                  </span>
                ) : null}
              </p>
              <p className="text-app-muted font-mono text-xs break-all">{workspace.path}</p>
              <p className="text-app-muted mt-1 text-xs">
                {workspace.caseCount} {workspace.caseCount === 1 ? "case" : "cases"} · last opened{" "}
                {formatTimestamp(workspace.lastOpenedAt)}
              </p>
            </div>

            <div className="flex shrink-0 gap-2">
              {workspace.available ? (
                <Button variant="primary" disabled={busy} onClick={() => onOpen(workspace)}>
                  Open
                </Button>
              ) : (
                <Button variant="secondary" disabled={busy} onClick={() => onLocate(workspace)}>
                  Locate
                </Button>
              )}
              <Button variant="ghost" disabled={busy} onClick={() => onRemove(workspace)}>
                Remove
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
