import { cloneElement, isValidElement, type ReactElement } from "react";

interface DevInfoProps {
  /** Stable, human-readable component name, e.g. "CaseTable". */
  name: string;
  /** Source file, relative to the project root, e.g. "src/components/CaseTable.tsx". */
  file?: string;
  /**
   * When `"developer-tool"`, marks the element as part of a developer tool
   * (rather than the application) via `data-dev-inspector`. Used by the
   * Developer Inspector to identify its own UI.
   */
  kind?: "developer-tool";
  /** The single DOM element this component's root renders. */
  children: ReactElement;
}

/**
 * Exposes a React component's identity to development tooling.
 *
 * In development this attaches two data attributes to the child element it
 * wraps:
 *
 *   - `data-dev-name` — the component name
 *   - `data-dev-file` — the source file (when provided)
 *
 * The Developer Inspector reads these from the DOM to attach an application-level
 * identity (component, source, hierarchy) to a selected element. The attributes
 * are inert in every browser; they carry no behaviour.
 *
 * This component renders *no wrapper element* — it clones the single child, so
 * flex/grid layouts are not disturbed. In production it returns the child
 * untouched and the attributes never appear in the bundle's DOM.
 *
 * Reusable: copy `src/dev/DevInfo.tsx` into any React project and wrap a
 * component's root element to make it inspector-visible. No build step or
 * transform involved.
 */
export function DevInfo({ name, file, kind, children }: DevInfoProps) {
  if (!isValidElement(children)) return children;

  // The markers are inert `data-*` attributes: they carry no behaviour, only
  // identity for the inspector. They render in every build so the inspector
  // works in the release application too, not just under the dev server.
  const marker: Record<string, string> = { "data-dev-name": name };
  if (file) marker["data-dev-file"] = file;
  if (kind === "developer-tool") marker["data-dev-inspector"] = "true";

  return cloneElement(children, marker);
}
