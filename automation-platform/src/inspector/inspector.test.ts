import { describe, expect, it } from "vitest";

import {
  buildSelector,
  identifyElement,
  identityLabel,
  selectionTitle,
} from "./identify";
import { generateMarkdown } from "./markdown";
import type { Selection } from "./types";

function element(html: string): Element {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host.firstElementChild as Element;
}

function selection(overrides: Partial<Selection> = {}): Selection {
  return {
    id: "sel-1",
    number: null,
    identity: {
      tag: "table",
      id: null,
      classes: ["case-table"],
      testId: null,
      label: null,
      text: null,
      selector: "table.case-table",
      component: null,
      sourceFile: null,
      hierarchy: [],
      isDeveloperTool: false,
    },
    title: null,
    origin: "App",
    type: null,
    priority: "Normal",
    note: "",
    addedAt: "2026-08-23T00:00:00Z",
    status: "Backlog",
    ...overrides,
  };
}

describe("identifyElement", () => {
  it("captures tag, id, class, testid and label", () => {
    const el = element(
      '<button id="scan" class="btn primary" data-testid="scan-workspace" aria-label="Scan the workspace">Scan</button>',
    );

    expect(identifyElement(el)).toEqual({
      tag: "button",
      id: "scan",
      classes: ["btn", "primary"],
      testId: "scan-workspace",
      label: "Scan the workspace",
      text: "Scan",
      selector: "#scan",
      component: null,
      sourceFile: null,
      hierarchy: [],
      isDeveloperTool: false,
    });
  });

  it("reads the nearest DevInfo marker as component identity", () => {
    const el = element(
      '<div data-dev-name="CaseTable" data-dev-file="src/components/CaseTable.tsx"><div class="filter"><input data-testid="case-filter"></div></div>',
    );

    const input = el.querySelector("input")!;
    const identity = identifyElement(input);

    expect(identity.component).toBe("CaseTable");
    expect(identity.sourceFile).toBe("src/components/CaseTable.tsx");
    expect(identity.hierarchy).toEqual(["CaseTable"]);
  });

  it("collects the ancestor hierarchy outer-to-inner", () => {
    const el = element(
      '<main data-dev-name="Dashboard"><section data-dev-name="CaseTable"><div data-dev-name="FilterBar"><button>Filter</button></div></section></main>',
    );

    const identity = identifyElement(el.querySelector("button")!);

    expect(identity.component).toBe("FilterBar");
    expect(identity.hierarchy).toEqual(["Dashboard", "CaseTable", "FilterBar"]);
  });

  it("does not guess a component from a CSS class", () => {
    const el = element('<div class="flex flex-wrap"><button>Hi</button></div>');
    const identity = identifyElement(el.querySelector("button")!);

    expect(identity.component).toBeNull();
    expect(identity.sourceFile).toBeNull();
    expect(identity.hierarchy).toEqual([]);
  });

  it("identifies the Developer Inspector's own UI", () => {
    const el = element(
      '<div data-dev-name="InspectorPanel" data-dev-file="src/inspector/InspectorPanel.tsx" data-dev-inspector="true"><button data-testid="copy-for-claude">Copy for Claude</button></div>',
    );

    const identity = identifyElement(el.querySelector("button")!);

    expect(identity.isDeveloperTool).toBe(true);
    expect(identity.component).toBe("DeveloperInspector");
    expect(identity.sourceFile).toBe("src/inspector/InspectorPanel.tsx");
    expect(identity.hierarchy).toEqual(["InspectorPanel"]);
  });
});

describe("buildSelector", () => {
  it("prefers id, then testid, then class, then tag", () => {
    expect(buildSelector(element('<div id="main"></div>'))).toBe("#main");
    expect(buildSelector(element('<div data-testid="x"></div>'))).toBe('div[data-testid="x"]');
    expect(buildSelector(element('<div class="a b"></div>'))).toBe("div.a.b");
    expect(buildSelector(element("<div></div>"))).toBe("div");
  });
});

describe("identityLabel", () => {
  it("follows component → testid → label → text → id → tag", () => {
    expect(
      identityLabel({
        tag: "table",
        id: null,
        classes: ["case-table"],
        testId: null,
        label: null,
        text: null,
        selector: "table.case-table",
        component: "CaseTable",
        sourceFile: null,
        hierarchy: ["CaseTable"],
        isDeveloperTool: false,
      }),
    ).toBe("CaseTable");

    expect(
      identityLabel({
        tag: "div",
        id: null,
        classes: [],
        testId: "case-filter",
        label: null,
        text: null,
        selector: "div",
        component: null,
        sourceFile: null,
        hierarchy: [],
        isDeveloperTool: false,
      }),
    ).toBe("case-filter");

    expect(
      identityLabel({
        tag: "button",
        id: null,
        classes: [],
        testId: null,
        label: null,
        text: "Save",
        selector: "button",
        component: null,
        sourceFile: null,
        hierarchy: [],
        isDeveloperTool: false,
      }),
    ).toBe("Save");
  });
});

describe("selectionTitle", () => {
  it("combines component with a subordinate label", () => {
    const identity = {
      tag: "div",
      id: null,
      classes: ["filter"],
      testId: "case-filter",
      label: null,
      text: null,
      selector: "div.filter",
      component: "FilterBar",
      sourceFile: null,
      hierarchy: ["Dashboard", "CaseTable", "FilterBar"],
      isDeveloperTool: false,
    };

    expect(selectionTitle(identity)).toBe("FilterBar case-filter");
  });
});

describe("generateMarkdown", () => {
  it("uses the work-item id as the heading", () => {
    const markdown = generateMarkdown([
      selection({
        number: 12,
        identity: {
          tag: "input",
          id: null,
          classes: ["search"],
          testId: null,
          label: null,
          text: null,
          selector: "input.search",
          component: "DashboardPage",
          sourceFile: "src/pages/DashboardPage.tsx",
          hierarchy: ["DashboardPage"],
          isDeveloperTool: false,
        },
        note: "Make the search input wider.",
      }),
    ]);

    expect(markdown).toContain("# UI Changes");
    expect(markdown).toContain("## #12");
    expect(markdown).toContain("Component: `DashboardPage`");
    expect(markdown).toContain("Source: `src/pages/DashboardPage.tsx`");
    expect(markdown).toContain("Element: `input`");
    expect(markdown).toContain("Selector: `input.search`");
    expect(markdown).toContain("Request:");
    expect(markdown).toContain("Make the search input wider.");
  });

  it("omits element and selector for manual items", () => {
    const markdown = generateMarkdown([
      selection({
        number: 12,
        title: "Do the thing",
        identity: {
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
        },
        note: "Manual note.",
      }),
    ]);

    expect(markdown).toContain("## #12");
    expect(markdown).toContain("Title: `Do the thing`");
    expect(markdown).not.toContain("Element:");
    expect(markdown).not.toContain("Selector:");
  });

  it("omits component and source when unknown", () => {
    const markdown = generateMarkdown([selection({ number: 12, note: "One" })]);

    expect(markdown).toContain("## #12");
    expect(markdown).not.toContain("Component:");
    expect(markdown).not.toContain("Source:");
  });

  it("falls back to a title when there is no id, and fills an empty note", () => {
    const markdown = generateMarkdown([
      selection({ note: "One" }),
      selection({ id: "sel-2", note: "   " }),
    ]);

    expect(markdown).toContain("## table");
    expect(markdown).toContain("(no note)");
  });
});
