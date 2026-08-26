import { useCallback, useEffect, useState } from "react";

import { DevInfo } from "dev-inspector";
import { CaseSummaryBar } from "../components/CaseSummaryBar";
import { CaseTable } from "../components/CaseTable";
import { Notice } from "../components/Notice";
import { ScanSummary } from "../components/ScanSummary";
import { caseSummary, listCases } from "../services/cases";
import { errorMessage, formatTimestamp } from "../services/format";
import type { Case, CaseSummary, ScanReport, WorkspaceState } from "../types";

interface Props {
  workspace: WorkspaceState;
  /** Result of the last scan in this session, if there was one. */
  lastReport: ScanReport | null;
  /** Bumped by the caller to force a reload — the View → Refresh menu item. */
  refreshToken: number;
  onOpenCase: (id: number) => void;
}

const EMPTY_SUMMARY: CaseSummary = {
  total: 0,
  statuses: [],
};

export function DashboardPage({
  workspace,
  lastReport,
  refreshToken,
  onOpenCase,
}: Props) {
  const [cases, setCases] = useState<Case[]>([]);
  const [summary, setSummary] = useState<CaseSummary>(EMPTY_SUMMARY);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [dismissedReport, setDismissedReport] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The search runs in SQLite rather than over the loaded rows, so the table
  // and the query can never disagree about what matches.
  const load = useCallback(async (term: string) => {
    setError(null);
    try {
      const [rows, counts] = await Promise.all([listCases(term), caseSummary()]);
      setCases(rows);
      setSummary(counts);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(search), 200);
    return () => clearTimeout(timer);
  }, [search, load, refreshToken]);

  useEffect(() => {
    setDismissedReport(false);
  }, [lastReport]);

  return (
    <DevInfo name="DashboardPage" file="src/pages/DashboardPage.tsx">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-app-text text-2xl font-semibold">Automation Platform</h1>

        <h2 className="text-app-muted text-xs tracking-wide uppercase">Workspace</h2>
        <p className="text-app-text text-lg">{workspace.workspaceName}</p>
        <p className="text-app-muted font-mono text-xs break-all">{workspace.path}</p>
        <p className="text-app-muted text-xs">
          {workspace.hasBeenScanned
            ? `Last scanned ${formatTimestamp(workspace.lastScanAt)}`
            : "Not scanned yet"}
        </p>
      </header>

      {error ? <Notice tone="error">{error}</Notice> : null}

      {lastReport && !dismissedReport ? (
        <ScanSummary report={lastReport} onDismiss={() => setDismissedReport(true)} />
      ) : null}

      <section className="space-y-3">
        <h2 className="text-app-muted text-xs tracking-wide uppercase">Summary</h2>
        <CaseSummaryBar summary={summary} />
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-app-muted text-xs tracking-wide uppercase">Cases</h2>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search case number or name"
            aria-label="Search cases"
            className="border-app-border bg-app-input text-app-text placeholder:text-app-muted focus:border-app-accent w-64 rounded-md border px-3 py-2 text-sm focus:outline-none"
          />
        </div>

        {loading ? (
          <p className="text-app-muted text-sm">Loading…</p>
        ) : cases.length === 0 && summary.total === 0 ? (
          <Notice>
            No cases yet. Use <span className="text-app-text">Scan Cases</span> — or File → Scan
            Current Workspace — to read the case folders in this workspace.
          </Notice>
        ) : (
          <CaseTable cases={cases} onSelect={onOpenCase} />
        )}
      </section>
      </div>
    </DevInfo>
  );
}
