import { SCAN_PHASE_LABELS, SCAN_PHASE_SEQUENCE, type ScanPhase } from "../types";

interface Props {
  phase: ScanPhase;
}

/**
 * The ✓ / → checklist on the loading screen.
 *
 * Position is derived from the phase the scanner actually reports, so a step
 * only ticks over once that work is genuinely done.
 */
export function PhaseChecklist({ phase }: Props) {
  const terminal = phase === "completed" || phase === "cancelled" || phase === "failed";
  const activeIndex = terminal ? SCAN_PHASE_SEQUENCE.length : SCAN_PHASE_SEQUENCE.indexOf(phase);

  return (
    <ul className="space-y-1.5 text-sm">
      {SCAN_PHASE_SEQUENCE.map((step, index) => {
        const done = index < activeIndex;
        const active = index === activeIndex;

        return (
          <li
            key={step}
            className={`flex items-center gap-2 ${
              done ? "text-app-success" : active ? "text-app-text" : "text-app-muted"
            }`}
          >
            <span aria-hidden className="w-4 text-center">
              {done ? "✓" : active ? "→" : "·"}
            </span>
            <span className={active ? "font-medium" : undefined}>{SCAN_PHASE_LABELS[step]}</span>
          </li>
        );
      })}
    </ul>
  );
}
