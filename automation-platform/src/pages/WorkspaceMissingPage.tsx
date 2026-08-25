import { Button } from "../components/Button";
import { Notice } from "../components/Notice";
import { WorkspaceStatusBadge } from "../components/WorkspaceStatusBadge";
import type { RecentWorkspace } from "../types";

interface Props {
  workspace: RecentWorkspace;
  busy: boolean;
  error: string | null;
  onLocate: () => void;
  onChooseAnother: () => void;
  onRemove: () => void;
}

/**
 * Recovery screen for a workspace that has been moved or renamed.
 *
 * `Locate Workspace` reconnects to the same workspace at its new location: the
 * workspace id stored in the folder is what identifies it, so no second
 * database or duplicate entry is created. The scan starts again once it is
 * reconnected.
 */
export function WorkspaceMissingPage({
  workspace,
  busy,
  error,
  onLocate,
  onChooseAnother,
  onRemove,
}: Props) {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-app-text text-3xl font-semibold">Workspace Not Found</h1>
          <WorkspaceStatusBadge status="missing" />
        </div>
        <p className="text-app-subtext">We could not find:</p>
        <p className="text-app-warning font-mono text-sm break-all">{workspace.path}</p>
        <p className="text-app-subtext text-sm">The workspace may have been moved or renamed.</p>
      </header>

      {error ? <Notice tone="error">{error}</Notice> : null}

      <div className="flex flex-wrap gap-3">
        <Button variant="primary" disabled={busy} onClick={onLocate}>
          Locate Workspace
        </Button>
        <Button variant="secondary" disabled={busy} onClick={onChooseAnother}>
          Choose Another Workspace
        </Button>
        <Button variant="danger" disabled={busy} onClick={onRemove}>
          Remove From Recent
        </Button>
      </div>

      <Notice>
        Removing it from the recent list only forgets the entry. Your case folders and their
        database are left untouched.
      </Notice>
    </div>
  );
}
