import { useCallback, useEffect, useState } from "react";

import { PriorityBadge, StatusBadge } from "../components/Badges";
import { Button } from "../components/Button";
import { Notice } from "../components/Notice";
import { ScanSummary } from "../components/ScanSummary";
import { getCase, listCaseFiles, openCaseFolder, scanCase, updateCase } from "../services/cases";
import { errorMessage, formatTimestamp } from "../services/format";
import {
  CASE_PRIORITIES,
  CASE_STATUSES,
  type Case,
  type CaseEdit,
  type CaseFile,
  type ScanReport,
} from "../types";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  caseId: number;
  onBack: () => void;
}

const FIELD_CLASS =
  "border-app-border bg-app-input text-app-text focus:border-app-accent w-full rounded-md border px-3 py-2 text-sm focus:outline-none";

function toEdit(value: Case): CaseEdit {
  return {
    name: value.name,
    jurisdiction: value.jurisdiction,
    status: value.status,
    priority: value.priority,
  };
}

export function CaseDetailPage({ caseId, onBack }: Props) {
  const [value, setValue] = useState<Case | null>(null);
  const [draft, setDraft] = useState<CaseEdit | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [report, setReport] = useState<ScanReport | null>(null);
  const [files, setFiles] = useState<CaseFile[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const found = await getCase(caseId);
      setValue(found);
      if (!found) {
        setError(`Case ${caseId} no longer exists.`);
      } else {
        try {
          setFiles(await listCaseFiles(caseId));
        } catch {
          setFiles([]);
        }
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      setValue(await updateCase(caseId, draft));
      setDraft(null);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function rescan() {
    setError(null);
    try {
      setReport(await scanCase(caseId));
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function reveal() {
    setError(null);
    try {
      await openCaseFolder(caseId);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  if (loading) {
    return <p className="text-app-muted mx-auto max-w-3xl text-sm">Loading…</p>;
  }

  if (!value) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Button variant="ghost" onClick={onBack}>
          ← Back to cases
        </Button>
        <Notice tone="error">{error ?? "This case could not be loaded."}</Notice>
      </div>
    );
  }

  const fields: Array<[string, React.ReactNode]> = [
    ["Case Number", <span className="text-app-accent font-mono">{value.caseNumber}</span>],
    ["Name", value.name],
    ["Jurisdiction", value.jurisdiction ?? "—"],
    ["Status", <StatusBadge status={value.status} />],
    ["Priority", <PriorityBadge priority={value.priority} />],
    ["Folder Path", <span className="font-mono text-xs break-all">{value.absolutePath ?? "—"}</span>],
    ["Document Count", value.documentCount],
    ["Created", formatTimestamp(value.createdAt)],
    ["Updated", formatTimestamp(value.updatedAt)],
    ["Last Scanned", formatTimestamp(value.lastScannedAt)],
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button variant="ghost" onClick={onBack}>
        ← Back to cases
      </Button>

      <header>
        <h1 className="text-app-accent font-mono text-2xl font-semibold">{value.caseNumber}</h1>
        <p className="text-app-text text-lg">{value.name}</p>
      </header>

      {error ? <Notice tone="error">{error}</Notice> : null}

      {report ? <ScanSummary report={report} onDismiss={() => setReport(null)} /> : null}

      <dl className="border-app-border bg-app-panel grid grid-cols-[10rem_1fr] gap-x-6 gap-y-2 rounded-lg border p-4 text-sm">
        {fields.map(([label, content]) => (
          <div key={label} className="contents">
            <dt className="text-app-muted">{label}</dt>
            <dd className="text-app-text">{content}</dd>
          </div>
        ))}
      </dl>

      <section className="space-y-2">
        <h2 className="text-app-muted text-xs tracking-wide uppercase">Files</h2>
        {files.length === 0 ? (
          <p className="text-app-muted text-sm">No files found in this folder.</p>
        ) : (
          <ul className="border-app-border bg-app-panel divide-app-border divide-y rounded-lg border">
            {files.map((file) => (
              <li
                key={file.path}
                className="flex items-center justify-between gap-3 px-4 py-2"
              >
                <span className="text-app-subtext min-w-0 truncate font-mono text-xs">
                  {file.path}
                </span>
                <span className="text-app-muted shrink-0 text-xs tabular-nums">
                  {formatSize(file.size)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap gap-3">
        <Button onClick={reveal}>Open Case Folder</Button>
        <Button onClick={rescan}>Scan Case</Button>
        <Button
          variant={draft ? "ghost" : "primary"}
          onClick={() => setDraft(draft ? null : toEdit(value))}
        >
          {draft ? "Cancel Edit" : "Edit Case"}
        </Button>
      </div>

      {draft ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
          className="border-app-border bg-app-panel space-y-4 rounded-lg border p-4"
        >
          <h2 className="text-app-text font-medium">Edit Case</h2>
          <p className="text-app-muted text-xs">
            These fields belong to you — scanning never overwrites them.
          </p>

          <label className="block space-y-1">
            <span className="text-app-subtext text-sm">Name</span>
            <input
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              className={FIELD_CLASS}
            />
          </label>

          <label className="block space-y-1">
            <span className="text-app-subtext text-sm">Jurisdiction</span>
            <input
              value={draft.jurisdiction ?? ""}
              onChange={(event) =>
                setDraft({ ...draft, jurisdiction: event.target.value || null })
              }
              className={FIELD_CLASS}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-app-subtext text-sm">Status</span>
              <select
                value={draft.status}
                onChange={(event) => setDraft({ ...draft, status: event.target.value })}
                className={FIELD_CLASS}
              >
                {CASE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-app-subtext text-sm">Priority</span>
              <select
                value={draft.priority}
                onChange={(event) => setDraft({ ...draft, priority: event.target.value })}
                className={FIELD_CLASS}
              >
                {CASE_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
