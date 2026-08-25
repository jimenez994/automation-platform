import { ActivityLog } from "../components/ActivityLog";
import { Button } from "../components/Button";
import { Notice } from "../components/Notice";
import { PhaseChecklist } from "../components/PhaseChecklist";
import { ProgressBar } from "../components/ProgressBar";
import { formatClock } from "../services/format";
import { SCAN_PHASE_LABELS, type ActivityLine, type ScanProgress, type WorkspaceState } from "../types";

interface Props {
  workspace: WorkspaceState;
  progress: ScanProgress | null;
  activity: ActivityLine[];
  cancelling: boolean;
  error: string | null;
  onCancel: () => void;
}

/**
 * Shown while a workspace is being opened and scanned.
 *
 * Every number here comes from the scanner's own progress events. Where the
 * scanner cannot yet say something — the total before discovery finishes, the
 * remaining time before there are enough samples — this shows that honestly
 * rather than inventing a value.
 */
export function WorkspaceLoadingPage({
  workspace,
  progress,
  activity,
  cancelling,
  error,
  onCancel,
}: Props) {
  const phase = progress?.phase ?? "initializing";
  const total = progress?.totalCases ?? 0;
  const index = progress?.currentIndex ?? 0;
  const fraction = total > 0 ? Math.min(index / total, 1) : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-app-text text-2xl font-semibold">Loading Workspace</h1>
        <p className="text-app-text text-lg">{workspace.workspaceName}</p>
        <p className="text-app-muted font-mono text-xs break-all">{workspace.path}</p>
      </header>

      {error ? <Notice tone="error">{error}</Notice> : null}

      <section className="border-app-border bg-app-panel space-y-4 rounded-lg border p-5">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-app-text font-medium">
            {cancelling ? "Cancelling scan…" : "Scanning workspace…"}
          </h2>
          <span className="text-app-muted text-xs tabular-nums">
            Elapsed: {formatClock(progress?.elapsedMs ?? 0)}
          </span>
        </div>

        <PhaseChecklist phase={phase} />

        <ProgressBar fraction={fraction} label="Workspace scan progress" />

        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <dt className="text-app-muted">Current phase</dt>
          <dd className="text-app-text">{SCAN_PHASE_LABELS[phase]}</dd>

          <dt className="text-app-muted">Current case</dt>
          <dd className="text-app-text truncate font-mono text-xs">
            {progress?.currentCase ?? "—"}
          </dd>

          <dt className="text-app-muted">Progress</dt>
          <dd className="text-app-text tabular-nums">
            {total > 0 ? `${index} / ${total} cases` : "Counting case folders…"}
          </dd>

          <dt className="text-app-muted">Documents found</dt>
          <dd className="text-app-text tabular-nums">{progress?.filesDiscovered ?? 0}</dd>

          <dt className="text-app-muted">Remaining</dt>
          <dd className="text-app-text tabular-nums">
            {progress?.estimatedRemainingMs != null
              ? formatClock(progress.estimatedRemainingMs)
              : "Calculating remaining time…"}
          </dd>
        </dl>

        {progress && (progress.warnings > 0 || progress.errors > 0) ? (
          <p className="text-app-warning text-xs">
            {progress.warnings} warning{progress.warnings === 1 ? "" : "s"}
            {progress.errors > 0 ? `, ${progress.errors} error${progress.errors === 1 ? "" : "s"}` : ""}{" "}
            so far — details below.
          </p>
        ) : null}

        <ActivityLog lines={activity} />
      </section>

      <Button variant="ghost" disabled={cancelling} onClick={onCancel}>
        {cancelling ? "Cancelling…" : "Cancel Scan"}
      </Button>
    </div>
  );
}
