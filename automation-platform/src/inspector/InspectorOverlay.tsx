import { useEffect, useRef, useState } from "react";

import { identifyElement } from "./identify";
import { useInspector } from "./InspectorContext";
import type { ElementIdentity, Selection } from "./types";

/** Applied to the element under the cursor while inspecting. */
const HOVER_CLASS = "inspector-hover";
/** Persistent highlight on the currently selected/locked element. */
const SELECTED_CLASS = "inspector-selected";

/**
 * Live highlighting and click-to-select.
 *
 * These listeners only run in `inspecting` mode. In `noting` mode the selected
 * element is locked and the notes panel is fully interactive, so hover/click
 * capture is suspended — clicks inside the panel are never read as new
 * selections.
 */
export function InspectorOverlay() {
  const { mode, addSelection, selections } = useInspector();
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    identity: ElementIdentity;
  } | null>(null);
  // Compact tooltip shown when hovering an element that has saved work items,
  // even when the Select tool is not active.
  const [notesTooltip, setNotesTooltip] = useState<{
    x: number;
    y: number;
    items: Selection[];
  } | null>(null);

  const hoveredRef = useRef<Element | null>(null);
  const addSelectionRef = useRef(addSelection);
  addSelectionRef.current = addSelection;

  // The exact DOM element selected at click time, keyed by selector. A CSS
  // selector is not unique, so re-resolving it with `querySelector` could pick
  // a different element than the one the user actually clicked. This map pins
  // the highlight to the exact node for the rest of the session.
  const selectedElementsRef = useRef<Map<string, Element>>(new Map());

  const inspecting = mode === "inspecting";

  // Persistent highlight on every selected element. Selections stay highlighted
  // for the rest of the session, so the developer can see what has been captured.
  useEffect(() => {
    const elements: Element[] = [];

    for (const selection of selections) {
      const element =
        selectedElementsRef.current.get(selection.identity.selector) ??
        document.querySelector(selection.identity.selector);
      if (element) {
        element.classList.add(SELECTED_CLASS);
        elements.push(element);
      }
    }

    return () => elements.forEach((element) => element.classList.remove(SELECTED_CLASS));
  }, [selections]);

  useEffect(() => {
    if (!inspecting) return;

    let frame = 0;

    function clearHover() {
      const previous = hoveredRef.current;
      if (previous) {
        previous.classList.remove(HOVER_CLASS);
        hoveredRef.current = null;
      }
    }

    function onMove(event: MouseEvent) {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;

        // `elementFromPoint` never returns a `pointer-events: none` element, so
        // the overlay and tooltip are transparent to hovering.
        const hovered = document.elementFromPoint(event.clientX, event.clientY);

        if (!hovered || hovered === hoveredRef.current) return;

        clearHover();
        hovered.classList.add(HOVER_CLASS);
        hoveredRef.current = hovered;

        setTooltip({
          x: event.clientX + 12,
          y: event.clientY + 12,
          identity: identifyElement(hovered),
        });
      });
    }

    function onClick(event: MouseEvent) {
      const target = event.target as Element | null;
      if (!(target instanceof Element)) return;

      // The overlay and tooltip are the only things inspection must never
      // select.
      if (target.closest("[data-inspector-transient]")) return;

      // Select the exact element that was highlighted on hover, never a
      // re-derived child or a stale `event.target`.
      const selected = hoveredRef.current ?? target;

      // The floating Select/Manage buttons stay interactive so they can disarm
      // or toggle; everything else — the application AND the Work Manager's own
      // UI — is a selection target while inspecting.
      if (selected.closest("[data-inspector-control]")) return;

      const identity = identifyElement(selected);
      selectedElementsRef.current.set(identity.selector, selected);
      addSelectionRef.current(identity);

      event.preventDefault();
      event.stopPropagation();
    }

    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      clearHover();
      setTooltip(null);
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("click", onClick, true);
    };
  }, [inspecting]);

  // While the Select tool is NOT active, show a compact tooltip for any element
  // that already has saved work items. The tooltip is pointer-events: none, so
  // it never becomes a selection target.
  useEffect(() => {
    if (inspecting) return;
    if (selections.length === 0) return;

    let frame = 0;

    function onMove(event: MouseEvent) {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;

        const hovered = document.elementFromPoint(event.clientX, event.clientY);
        if (!hovered) {
          setNotesTooltip(null);
          return;
        }

        const identity = identifyElement(hovered);
        const items = selections.filter(
          (selection) => selection.identity.selector === identity.selector,
        );

        if (items.length > 0) {
          setNotesTooltip({ x: event.clientX + 12, y: event.clientY + 12, items });
        } else {
          setNotesTooltip(null);
        }
      });
    }

    function onLeave() {
      setNotesTooltip(null);
    }

    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("mouseleave", onLeave);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      setNotesTooltip(null);
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("mouseleave", onLeave);
    };
  }, [inspecting, selections]);

  if (!inspecting && !notesTooltip) return null;

  // Saved work items for the element currently under the cursor.
  const tooltipNotes = tooltip
    ? selections.filter((selection) => selection.identity.selector === tooltip.identity.selector)
    : [];
  const tooltipStatuses = [...new Set(tooltipNotes.map((note) => note.status))].join(", ");

  return (
    <div data-inspector-transient className="pointer-events-none fixed inset-0 z-[2200]">
      {inspecting && tooltip ? (
        <div
          data-inspector-transient
          className="bg-app-panel text-app-text border-app-border pointer-events-none fixed z-[1001] max-w-xs rounded-md border px-2 py-1.5 font-mono text-xs shadow-lg"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div>
            {tooltip.identity.component ? (
              <span className="text-app-accent font-semibold">{tooltip.identity.component}</span>
            ) : (
              tooltip.identity.tag
            )}
            {tooltip.identity.id ? ` #${tooltip.identity.id}` : ""}
            {tooltip.identity.testId ? ` [data-testid="${tooltip.identity.testId}"]` : ""}
            {tooltip.identity.classes.length > 0 ? `.${tooltip.identity.classes.join(".")}` : ""}
            {tooltip.identity.label ? ` — ${tooltip.identity.label}` : ""}
          </div>

          {tooltipNotes.length > 0 ? (
            <div className="border-app-border mt-1 space-y-0.5 border-t pt-1">
              <p className="text-app-muted text-[10px]">
                {tooltipNotes.length} {tooltipNotes.length === 1 ? "note" : "notes"}
                {tooltipStatuses ? ` · ${tooltipStatuses}` : ""}
              </p>
              {tooltipNotes
                .slice(0, 2)
                .filter((note) => note.note.trim())
                .map((note) => (
                  <p key={note.id} className="text-app-subtext truncate text-[10px]">
                    · {note.note}
                  </p>
                ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {!inspecting && notesTooltip ? (
        <div
          data-inspector-transient
          className="bg-app-panel text-app-text border-app-border pointer-events-none fixed z-[1001] max-w-xs rounded-md border px-2 py-1.5 font-mono text-xs shadow-lg"
          style={{ left: notesTooltip.x, top: notesTooltip.y }}
        >
          {notesTooltip.items[0].identity.component ?? notesTooltip.items[0].identity.tag}
          <div className="border-app-border mt-1 space-y-0.5 border-t pt-1">
            {notesTooltip.items.map((item) => (
              <p key={item.id} className="text-app-subtext truncate text-[10px]">
                <span className="text-app-muted">{item.number != null ? `#${item.number}` : "—"}</span>{" "}
                {item.note.trim() || "(no note)"}
              </p>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
