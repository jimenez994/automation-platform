import { Button } from "../components/Button";
import { Notice } from "../components/Notice";
import { RecentWorkspaceList } from "../components/RecentWorkspaceList";
import { WorkspaceStatusBadge } from "../components/WorkspaceStatusBadge";
import type { RecentWorkspace } from "../types";

interface Props {
  recent: RecentWorkspace[];
  busy: boolean;
  error: string | null;
  onSelect: () => void;
  onOpen: (workspace: RecentWorkspace) => void;
  onLocate: (workspace: RecentWorkspace) => void;
  onRemove: (workspace: RecentWorkspace) => void;
}

/** Shown when no workspace is open but at least one has been used before. */
export function WorkspaceSelectPage({
  recent,
  busy,
  error,
  onSelect,
  onOpen,
  onLocate,
  onRemove,
}: Props) {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-app-text text-3xl font-semibold">Automation Platform</h1>
          <WorkspaceStatusBadge status="none" />
        </div>
        <h2 className="text-app-text text-xl">Select a Workspace</h2>
        <p className="text-app-subtext text-sm">
          Choose the folder containing your case/project folders.
        </p>
      </header>

      {error ? <Notice tone="error">{error}</Notice> : null}

      <Button variant="primary" disabled={busy} onClick={onSelect}>
        + Select Workspace
      </Button>

      <RecentWorkspaceList
        workspaces={recent}
        busy={busy}
        onOpen={onOpen}
        onLocate={onLocate}
        onRemove={onRemove}
      />
    </div>
  );
}
