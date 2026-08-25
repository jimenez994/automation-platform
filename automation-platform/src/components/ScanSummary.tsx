import { useState } from "react";

import { formatDuration } from "../services/format";
import type { ScanReport } from "../types";

interface Props {
  report: ScanReport;
  onDismiss?: () => void;
}

/** The result of a scan, with the warnings available on demand. */
export function ScanSummary({ report, onDismiss }: Props) {
  const [showWarnings, setShowWarnings] = useState(false);

  const counts = [
    `${report.casesFound} ${report.casesFound === 1 ? "case" : "cases"} found`,
    `${report.created} new`,
    `${report.updated} updated`,
    `${report.skipped} skipped`,
    `${report.missing} missing`,
    `${report.warnings.length} ${report.warnings.length === 1 ? "warning" : "warnings"}`,
  ];

  return (
    <section className="border-app-border bg-app-panel rounded-lg border p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-app-text font-medium">Scan Complete</h3>
          <p className="text-app-subtext mt-1 text-sm">{counts.join(" · ")}</p>
          <p className="text-app-muted mt-1 text-xs">
            {report.foldersFound} folders inspected in {formatDuration(report.durationMs)}
          </p>
        </div>

        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss the scan summary"
            className="text-app-muted hover:text-app-text"
          >
            ✕
          </button>
        ) : null}
      </div>

      {report.warnings.length > 0 ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowWarnings((open) => !open)}
            className="text-app-warning hover:text-app-text text-sm"
          >
            {showWarnings ? "Hide" : "Inspect"} {report.warnings.length} warning
            {report.warnings.length === 1 ? "" : "s"}
          </button>

          {showWarnings ? (
            <ul className="border-app-border bg-app-input mt-2 max-h-56 space-y-1 overflow-y-auto rounded-md border p-3 text-xs">
              {report.warnings.map((warning, index) => (
                <li key={`${warning.folder ?? "workspace"}-${index}`} className="text-app-subtext">
                  {warning.folder ? (
                    <span className="text-app-text font-mono">{warning.folder}: </span>
                  ) : null}
                  {warning.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
