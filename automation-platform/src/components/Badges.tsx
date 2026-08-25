/**
 * Status and priority pills.
 *
 * Both draw on the theme tokens only, so they read correctly in either theme
 * without a second set of colours.
 */

const STATUS_TONES: Record<string, string> = {
  Initiated: "text-app-info border-app-info/40",
  Submitted: "text-app-info border-app-info/40",
  "Need Info": "text-app-warning border-app-warning/40",
  Ready: "text-app-success border-app-success/40",
  Schedule: "text-app-mauve border-app-mauve/40",
  "Fail Inspection": "text-app-error border-app-error/40",
  Completed: "text-app-muted border-app-border-strong",
};

const PRIORITY_TONES: Record<string, string> = {
  Low: "text-app-muted",
  Normal: "text-app-subtext",
  High: "text-app-warning",
  Urgent: "text-app-error",
};

const UNKNOWN_TONE = "text-app-subtext border-app-border-strong";

/** Falls back to a neutral tone for values this build predates. */
export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`bg-app-raised inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${
        STATUS_TONES[status] ?? UNKNOWN_TONE
      }`}
    >
      {status}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={`text-sm ${PRIORITY_TONES[priority] ?? "text-app-subtext"}`}>{priority}</span>
  );
}
