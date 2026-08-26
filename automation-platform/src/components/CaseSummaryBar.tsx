import { DevInfo } from "dev-inspector";
import type { CaseSummary } from "../types";

interface Props {
  summary: CaseSummary;
}

const STATUS_TONES: Record<string, string> = {
  Initiated: "text-app-info",
  Submitted: "text-app-info",
  "Need Info": "text-app-warning",
  Ready: "text-app-success",
  Schedule: "text-app-mauve",
  "Fail Inspection": "text-app-error",
  Completed: "text-app-muted",
};

/** The Total counter plus one tile per status. */
export function CaseSummaryBar({ summary }: Props) {
  const tiles: Array<{ label: string; value: number; tone: string }> = [
    { label: "Total Cases", value: summary.total, tone: "text-app-text" },
    ...summary.statuses.map((entry) => ({
      label: entry.status,
      value: entry.count,
      tone: STATUS_TONES[entry.status] ?? "text-app-subtext",
    })),
  ];

  return (
    <DevInfo name="CaseSummaryBar" file="src/components/CaseSummaryBar.tsx">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="border-app-border bg-app-panel rounded-lg border px-3 py-2.5"
          >
            <dt className="text-app-muted truncate text-xs tracking-wide uppercase">{tile.label}</dt>
            <dd className={`mt-1 text-xl font-semibold tabular-nums ${tile.tone}`}>{tile.value}</dd>
          </div>
        ))}
      </dl>
    </DevInfo>
  );
}
