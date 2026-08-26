import { useMemo, useState } from "react";

import { DevInfo } from "dev-inspector";
import { formatTimestamp, parseTimestamp } from "../services/format";
import type { Case } from "../types";
import { PriorityBadge, StatusBadge } from "./Badges";

type SortKey = "caseNumber" | "name" | "status" | "priority" | "documentCount" | "lastScannedAt";
type Direction = "asc" | "desc";

interface Props {
  cases: Case[];
  onSelect: (id: number) => void;
}

const COLUMNS: Array<{ key: SortKey; label: string; numeric?: boolean }> = [
  { key: "caseNumber", label: "Case Number" },
  { key: "name", label: "Name" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "documentCount", label: "Documents", numeric: true },
  { key: "lastScannedAt", label: "Last Scanned" },
];

/** Priorities sort by urgency rather than alphabetically. */
const PRIORITY_ORDER: Record<string, number> = { Low: 0, Normal: 1, High: 2, Urgent: 3 };

function compare(a: Case, b: Case, key: SortKey): number {
  switch (key) {
    case "documentCount":
      return a.documentCount - b.documentCount;
    case "priority":
      return (PRIORITY_ORDER[a.priority] ?? -1) - (PRIORITY_ORDER[b.priority] ?? -1);
    case "lastScannedAt": {
      // Never-scanned cases sort as the oldest.
      const left = parseTimestamp(a.lastScannedAt)?.getTime() ?? 0;
      const right = parseTimestamp(b.lastScannedAt)?.getTime() ?? 0;
      return left - right;
    }
    default:
      return a[key].localeCompare(b[key], undefined, { numeric: true });
  }
}

export function CaseTable({ cases, onSelect }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("caseNumber");
  const [direction, setDirection] = useState<Direction>("asc");

  const sorted = useMemo(() => {
    const factor = direction === "asc" ? 1 : -1;
    return [...cases].sort((a, b) => compare(a, b, sortKey) * factor);
  }, [cases, sortKey, direction]);

  function toggle(key: SortKey) {
    if (key === sortKey) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setDirection("asc");
    }
  }

  if (cases.length === 0) {
    return (
      <p className="border-app-border bg-app-panel text-app-muted rounded-lg border px-4 py-8 text-center text-sm">
        No cases to show.
      </p>
    );
  }

  return (
    <DevInfo name="CaseTable" file="src/components/CaseTable.tsx">
      <div className="border-app-border overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-app-raised text-app-muted text-xs tracking-wide uppercase">
          <tr>
            {COLUMNS.map((column) => (
              <th key={column.key} scope="col" className="font-medium">
                <button
                  type="button"
                  onClick={() => toggle(column.key)}
                  aria-sort={
                    sortKey === column.key
                      ? direction === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                  className={`hover:text-app-text flex w-full items-center gap-1 px-4 py-3 ${
                    column.numeric ? "justify-end" : ""
                  }`}
                >
                  {column.label}
                  <span aria-hidden className="text-app-border-strong">
                    {sortKey === column.key ? (direction === "asc" ? "▲" : "▼") : ""}
                  </span>
                </button>
              </th>
            ))}
          </tr>
        </thead>

        <tbody className="divide-app-border divide-y">
          {sorted.map((value) => (
            <tr
              key={value.id}
              onClick={() => onSelect(value.id)}
              className="bg-app-panel hover:bg-app-raised cursor-pointer"
            >
              <td className="text-app-accent px-4 py-3 font-mono">{value.caseNumber}</td>
              <td className="text-app-text px-4 py-3">{value.name}</td>
              <td className="px-4 py-3">
                <StatusBadge status={value.status} />
              </td>
              <td className="px-4 py-3">
                <PriorityBadge priority={value.priority} />
              </td>
              <td className="text-app-subtext px-4 py-3 text-right tabular-nums">
                {value.documentCount}
              </td>
              <td className="text-app-muted px-4 py-3">{formatTimestamp(value.lastScannedAt)}</td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>
    </DevInfo>
  );
}
