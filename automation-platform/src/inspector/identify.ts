import type { ElementIdentity, Selection } from "./types";

/** Characters we read for an element's accessible/visible name. */
const MAX_TEXT_LENGTH = 40;

/** Data attribute the `DevInfo` component stamps onto a component's root. */
const DEV_NAME_ATTR = "data-dev-name";
const DEV_FILE_ATTR = "data-dev-file";
/** Marks an element as part of a developer tool rather than the application. */
const DEV_INSPECTOR_ATTR = "data-dev-inspector";

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Builds a CSS selector for an element. Prefers the most stable, human-meaningful
 * hook first: id, then data-testid, then tag.class, then bare tag.
 */
export function buildSelector(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const id = element.id;
  const testId = element.getAttribute("data-testid");

  if (id) return `#${id}`;

  if (testId) return `${tag}[data-testid="${testId}"]`;

  const classes = Array.from(element.classList).slice(0, 2);
  if (classes.length > 0) return `${tag}.${classes.join(".")}`;

  return tag;
}

/** Closest ancestor (or the element itself) carrying a `DevInfo` name. */
function closestDevInfo(element: Element): Element | null {
  return element.closest(`[${DEV_NAME_ATTR}]`);
}

/** All `DevInfo` names from the outermost ancestor down to the element. */
function buildHierarchy(element: Element): string[] {
  const names: string[] = [];
  let current: Element | null = element.closest(`[${DEV_NAME_ATTR}]`);

  while (current) {
    const name = current.getAttribute(DEV_NAME_ATTR);
    if (name) names.unshift(name);

    current = current.parentElement?.closest(`[${DEV_NAME_ATTR}]`) ?? null;
  }

  return names;
}

/** Reads the identifying fields from a DOM element. */
export function identifyElement(element: Element): ElementIdentity {
  const tag = element.tagName.toLowerCase();
  const id = element.id || null;
  const testId = element.getAttribute("data-testid");
  const classes = Array.from(element.classList).slice(0, 2);

  const label =
    element.getAttribute("aria-label") ||
    element.getAttribute("title") ||
    element.getAttribute("alt") ||
    element.getAttribute("placeholder") ||
    null;

  // Visible text for elements that carry it (buttons, links, headings), and
  // nothing for big containers where it would just be noise.
  const text = collapse(element.textContent ?? "");
  const textValue =
    text.length > 0 && text.length <= MAX_TEXT_LENGTH ? text : null;

  const dev = closestDevInfo(element);
  const isDeveloperTool = element.closest(`[${DEV_INSPECTOR_ATTR}]`) !== null;

  return {
    tag,
    id,
    classes,
    testId: testId || null,
    label,
    text: textValue,
    selector: buildSelector(element),
    // Developer-tool UI identifies itself as the inspector; otherwise use the
    // `DevInfo` name of the closest application component.
    component: isDeveloperTool ? "DeveloperInspector" : (dev?.getAttribute(DEV_NAME_ATTR) ?? null),
    sourceFile: isDeveloperTool
      ? (dev?.getAttribute(DEV_FILE_ATTR) ?? "src/inspector/Inspector.tsx")
      : (dev?.getAttribute(DEV_FILE_ATTR) ?? null),
    hierarchy: buildHierarchy(element),
    isDeveloperTool,
  };
}

/**
 * The best available human-readable name, per the fallback order:
 * component name → data-testid → accessible label → visible text → id →
 * generic element.
 */
export function identityLabel(identity: ElementIdentity): string {
  if (identity.component) return identity.component;
  if (identity.testId) return identity.testId;
  if (identity.label) return identity.label;
  if (identity.text) return identity.text;
  if (identity.id) return identity.id;
  return identity.tag;
}

/**
 * A descriptive title combining the component name with a subordinate label,
 * e.g. "CaseTable Filter Bar". Falls back to `identityLabel`.
 */
export function selectionTitle(identity: ElementIdentity): string {
  const component = identity.component;
  const detail = identity.testId || identity.label || identity.text;

  if (component && detail && detail !== component) {
    return `${component} ${detail}`;
  }

  return identityLabel(identity);
}

/** The one-line element description shown in the tooltip and panel. */
export function identitySummary(identity: ElementIdentity): string {
  return identity.selector;
}

/** The display title of a work item: manual title, else the element's name. */
export function itemTitle(selection: Selection): string {
  return selection.title || selectionTitle(selection.identity);
}

/** Placeholder identity for manually created work items. */
export function manualIdentity(): ElementIdentity {
  return {
    tag: "manual",
    id: null,
    classes: [],
    testId: null,
    label: null,
    text: null,
    selector: "",
    component: null,
    sourceFile: null,
    hierarchy: [],
    isDeveloperTool: false,
  };
}

/** Generates a unique id for a work item. */
export function newSelectionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `sel-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
