interface Props {
  /** 0 to 1, or null while the total is still unknown. */
  fraction: number | null;
  label?: string;
}

/**
 * A determinate bar when the scanner knows the total, and an indeterminate
 * sweep while it does not — rather than a fake percentage that would have to
 * jump when the real total arrives.
 */
export function ProgressBar({ fraction, label }: Props) {
  const percent = fraction === null ? null : Math.round(fraction * 100);

  return (
    <div className="space-y-1">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        aria-label={label ?? "Scan progress"}
        className="bg-app-raised border-app-border h-2.5 w-full overflow-hidden rounded-full border"
      >
        {percent === null ? (
          <div className="bg-app-accent h-full w-1/3 animate-pulse rounded-full" />
        ) : (
          <div
            className="bg-app-accent h-full rounded-full transition-[width] duration-200 ease-out"
            style={{ width: `${percent}%` }}
          />
        )}
      </div>

      {percent !== null ? (
        <p className="text-app-muted text-right text-xs tabular-nums">{percent}%</p>
      ) : null}
    </div>
  );
}
