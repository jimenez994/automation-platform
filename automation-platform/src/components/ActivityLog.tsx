import { useEffect, useRef, useState } from "react";

import { formatLogTime } from "../services/format";
import type { ActivityLine } from "../types";

interface Props {
  lines: ActivityLine[];
}

const LEVEL_TONES: Record<ActivityLine["level"], string> = {
  info: "text-app-subtext",
  warning: "text-app-warning",
  error: "text-app-error",
};

/**
 * The collapsible live log.
 *
 * Collapsed by default: this is reassurance, not the primary interface. It
 * follows the newest line while open, unless the user has scrolled up to read
 * something — pulling the view away from them would make it unusable.
 */
export function ActivityLog({ lines }: Props) {
  const [open, setOpen] = useState(false);
  const [follow, setFollow] = useState(true);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (!open || !follow) return;
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [lines, open, follow]);

  function handleScroll() {
    const list = listRef.current;
    if (!list) return;

    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 24;
    setFollow(atBottom);
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="text-app-subtext hover:text-app-text text-sm"
      >
        {open ? "Hide Details" : "Show Details"}
        {lines.length > 0 ? (
          <span className="text-app-muted"> ({lines.length})</span>
        ) : null}
      </button>

      {open ? (
        <ol
          ref={listRef}
          onScroll={handleScroll}
          className="border-app-border bg-app-input max-h-52 space-y-0.5 overflow-y-auto rounded-md border p-3 font-mono text-xs"
        >
          {lines.length === 0 ? (
            <li className="text-app-muted">Waiting for activity…</li>
          ) : (
            lines.map((line, index) => (
              <li key={`${line.timestamp}-${index}`} className={LEVEL_TONES[line.level]}>
                <span className="text-app-muted">{formatLogTime(line.timestamp)} </span>
                {line.level === "warning" ? "Warning: " : null}
                {line.level === "error" ? "Error: " : null}
                {line.message}
              </li>
            ))
          )}
        </ol>
      ) : null}
    </div>
  );
}
