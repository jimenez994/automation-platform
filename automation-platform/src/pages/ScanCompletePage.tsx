import { ActivityLog } from "../components/ActivityLog";
import { Button } from "../components/Button";
import { Notice } from "../components/Notice";
import { formatClock } from "../services/format";
import type { ActivityLine, ScanFinished, WorkspaceState } from "../types";

interface Props {
  workspace: WorkspaceState;
  finished: ScanFinished;
  activity: ActivityLine[];
  onContinue: () => void;
  onRetry: () => void;
}

const HEADINGS: Record<string, string> = {
  completed: "Workspace Ready",
  cancelled: "Scan Cancelled",
  failed: "Scan Failed",
};

/**
 * The summary shown between a finished scan and the dashboard.
 *
 * A cancelled or failed scan lands here too: the outcome is always stated,
 * never skipped past.
 */
export function ScanCompletePage({ workspace, finished, activity, onContinue, onRetry }: Props) {
  const report = finished.outcome?.report ?? null;
  const heading = HEADINGS[finished.status] ?? "Scan Finished";

  const rows: Array<[string, string]> = report
    ? [
        ["Cases scanned", `${report.casesFound}`],
        ["New cases", `${report.created}`],
        ["Updated", `${report.updated}`],
        ["Unchanged", `${report.unchanged}`],
        ["Skipped folders", `${report.skipped}`],
        ["Missing folders", `${report.missing}`],
        ["Documents found", `${report.documentsFound}`],
        ["Warnings", `${report.warnings.length}`],
        ["Errors", `${report.errors}`],
        ["Elapsed time", formatClock(report.durationMs)],
      ]
    : [];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-app-text text-2xl font-semibold">{heading}</h1>
        <p className="text-app-text text-lg">{workspace.workspaceName}</p>
        <p className="text-app-muted font-mono text-xs break-all">{workspace.path}</p>
      </header>

      {finished.error ? <Notice tone="error">{finished.error}</Notice> : null}

      {finished.status === "cancelled" ? (
        <Notice>
          The scan stopped early. Everything it had already read was saved and no case records were
          removed — run another scan whenever you are ready.
        </Notice>
      ) : null}

      {report ? (
        <section className="border-app-border bg-app-panel space-y-3 rounded-lg border p-5">
          <h2 className="text-app-text font-medium">
            {finished.status === "completed" ? "Scan Complete" : "What was done"}
          </h2>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-app-muted">{label}</dt>
                <dd className="text-app-text tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>

          {report.warnings.length > 0 ? (
            <ul className="border-app-border bg-app-input max-h-44 space-y-1 overflow-y-auto rounded-md border p-3 text-xs">
              {report.warnings.map((warning, index) => (
                <li key={`${warning.folder ?? "workspace"}-${index}`} className="text-app-warning">
                  {warning.folder ? (
                    <span className="text-app-text font-mono">{warning.folder}: </span>
                  ) : null}
                  {warning.message}
                </li>
              ))}
            </ul>
          ) : null}

          <ActivityLog lines={activity} />
        </section>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button variant="primary" onClick={onContinue}>
          Continue
        </Button>
        {finished.status !== "completed" ? (
          <Button variant="secondary" onClick={onRetry}>
            Scan Again
          </Button>
        ) : null}
      </div>
    </div>
  );
}
