/** Formatting helpers shared by the views. */

/**
 * Parses a timestamp produced by either side of the application.
 *
 * SQLite's `datetime('now')` returns `YYYY-MM-DD HH:MM:SS` in UTC but without a
 * zone marker, which `Date` would otherwise read as local time and shift by the
 * offset. The Rust helpers return proper ISO-8601 with a `Z`.
 */
export function parseTimestamp(value: string | null | undefined): Date | null {
  if (!value) return null;

  const normalised = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalised);

  return Number.isNaN(date.getTime()) ? null : date;
}

/** Formats a timestamp in the user's locale, or a dash when there is none. */
export function formatTimestamp(value: string | null | undefined): string {
  const date = parseTimestamp(value);
  if (!date) return "—";

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Formats a duration in milliseconds compactly. */
export function formatDuration(milliseconds: number): string {
  if (milliseconds < 1000) return `${milliseconds} ms`;
  return `${(milliseconds / 1000).toFixed(1)} s`;
}

/** Formats a duration as `mm:ss`, for elapsed and remaining scan time. */
export function formatClock(milliseconds: number): string {
  const total = Math.max(0, Math.round(milliseconds / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** Formats an ISO timestamp as a clock time, for the activity log. */
export function formatLogTime(value: string): string {
  const date = parseTimestamp(value);
  if (!date) return "--:--:--";

  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** Turns an unknown thrown value into something displayable. */
export function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return String(error);
}
