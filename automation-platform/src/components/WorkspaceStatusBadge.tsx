export type WorkspaceStatus = "ready" | "scanning" | "missing" | "none";

const STATUS: Record<WorkspaceStatus, { label: string; tone: string }> = {
  ready: { label: "Workspace Ready", tone: "text-app-success border-app-success/40" },
  scanning: { label: "Scanning…", tone: "text-app-info border-app-info/40" },
  missing: { label: "Workspace Not Found", tone: "text-app-error border-app-error/40" },
  none: { label: "No Workspace Selected", tone: "text-app-muted border-app-border-strong" },
};

/** Small, always-visible statement of what state the workspace is in. */
export function WorkspaceStatusBadge({ status }: { status: WorkspaceStatus }) {
  const { label, tone } = STATUS[status];

  return (
    <span
      className={`bg-app-raised inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${tone}`}
    >
      <span aria-hidden className="text-[0.6rem]">
        ●
      </span>
      {label}
    </span>
  );
}
