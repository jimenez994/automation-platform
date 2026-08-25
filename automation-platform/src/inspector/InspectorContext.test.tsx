import { createRoot } from "react-dom/client";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InspectorProvider, useInspector } from "./InspectorContext";
import type { ElementIdentity } from "./types";
import { createInspectorNote } from "../services/inspectorNotes";

// Mock the persistence layer with an auto-incrementing counter, mirroring the
// backend's `#N` assignment.
vi.mock("../services/inspectorNotes", () => ({
  listInspectorNotes: vi.fn(async () => []),
  createInspectorNote: vi.fn(async () => 1),
  updateInspectorNote: vi.fn(async () => {}),
  setInspectorNoteStatus: vi.fn(async () => {}),
  removeInspectorNote: vi.fn(async () => {}),
  clearInspectorNotes: vi.fn(async () => {}),
}));

beforeEach(() => {
  let counter = 0;
  vi.mocked(createInspectorNote).mockImplementation(async () => {
    counter += 1;
    return counter;
  });
});

function identity(selector: string, label: string): ElementIdentity {
  return {
    tag: "div",
    id: null,
    classes: ["test"],
    testId: null,
    label,
    text: label,
    selector,
    component: null,
    sourceFile: null,
    hierarchy: [],
    isDeveloperTool: false,
  };
}

function renderHarness(workspaceId: string | null = null) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  let state: ReturnType<typeof useInspector> | null = null;

  function Harness() {
    state = useInspector();
    return null;
  }

  act(() => {
    root.render(
      <InspectorProvider workspaceId={workspaceId}>
        <Harness />
      </InspectorProvider>,
    );
  });

  return {
    get: () => state!,
    unmount: () => act(() => root.unmount()),
  };
}

/** Selects an element and saves its note, as the quick-note modal does. */
async function selectAndSave(
  harness: ReturnType<typeof renderHarness>,
  identity: ElementIdentity,
  note: string,
) {
  act(() => {
    harness.get().toggleSelector();
    harness.get().addSelection(identity);
  });
  const id = harness.get().activeSelectionId!;
  await act(async () => {
    await harness.get().saveNote(id, note);
  });
}

describe("Inspector state machine", () => {
  it("starts idle with no selections", () => {
    const harness = renderHarness();

    expect(harness.get().mode).toBe("idle");
    expect(harness.get().selections).toHaveLength(0);
    expect(harness.get().workManagerOpen).toBe(false);

    harness.unmount();
  });

  it("the selector arms and disarms", () => {
    const harness = renderHarness();

    act(() => harness.get().toggleSelector());
    expect(harness.get().mode).toBe("inspecting");

    act(() => harness.get().toggleSelector());
    expect(harness.get().mode).toBe("idle");

    harness.unmount();
  });

  it("selecting an element locks it into noting", () => {
    const harness = renderHarness();

    act(() => harness.get().toggleSelector());
    act(() => harness.get().addSelection(identity("div.a", "A")));

    expect(harness.get().mode).toBe("noting");
    expect(harness.get().activeSelectionId).not.toBeNull();
    expect(harness.get().selections).toHaveLength(1);
    expect(harness.get().selections[0].status).toBe("Backlog");
    expect(harness.get().selections[0].number).toBeNull();

    harness.unmount();
  });

  it("save commits the note, assigns a number, and returns to idle", async () => {
    const harness = renderHarness();

    act(() => harness.get().toggleSelector());
    act(() => harness.get().addSelection(identity("div.a", "A")));
    await act(async () => {
      await harness.get().saveNote(harness.get().activeSelectionId!, "hello");
    });

    expect(harness.get().mode).toBe("idle");
    expect(harness.get().activeSelectionId).toBeNull();
    expect(harness.get().selections).toHaveLength(1);
    expect(harness.get().selections[0].note).toBe("hello");
    expect(harness.get().selections[0].number).toBe(1);

    harness.unmount();
  });

  it("cancel discards only the new selection and returns to idle", () => {
    const harness = renderHarness();

    act(() => harness.get().toggleSelector());
    act(() => harness.get().addSelection(identity("div.a", "A")));
    act(() => harness.get().cancelNote());

    expect(harness.get().mode).toBe("idle");
    expect(harness.get().activeSelectionId).toBeNull();
    expect(harness.get().selections).toHaveLength(0);

    harness.unmount();
  });

  it("the selector is locked while noting", () => {
    const harness = renderHarness();

    act(() => harness.get().toggleSelector());
    act(() => harness.get().addSelection(identity("div.a", "A")));
    const lockedId = harness.get().activeSelectionId;

    act(() => harness.get().toggleSelector());
    expect(harness.get().mode).toBe("noting");
    expect(harness.get().activeSelectionId).toBe(lockedId);

    harness.unmount();
  });

  it("an element can hold multiple notes with distinct numbers", async () => {
    const harness = renderHarness();

    await selectAndSave(harness, identity("div.a", "A"), "wider");
    await selectAndSave(harness, identity("div.a", "A"), "padding");

    const selections = harness.get().selections;
    expect(selections).toHaveLength(2);
    expect(selections.every((s) => s.identity.selector === "div.a")).toBe(true);
    expect(selections.map((s) => s.number)).toEqual([1, 2]);
    expect(selections.map((s) => s.note)).toEqual(["wider", "padding"]);

    harness.unmount();
  });

  it("cancelling a new note keeps older notes for the same element", async () => {
    const harness = renderHarness();

    await selectAndSave(harness, identity("div.a", "A"), "first");

    act(() => harness.get().toggleSelector());
    act(() => harness.get().addSelection(identity("div.a", "A")));
    act(() => harness.get().cancelNote());

    const selections = harness.get().selections;
    expect(selections).toHaveLength(1);
    expect(selections[0].note).toBe("first");

    harness.unmount();
  });

  it("setSelectionStatus moves a card between stages", async () => {
    const harness = renderHarness();

    await selectAndSave(harness, identity("div.a", "A"), "x");
    const id = harness.get().selections[0].id;

    act(() => harness.get().setSelectionStatus(id, "In Progress"));
    expect(harness.get().selections[0].status).toBe("In Progress");

    act(() => harness.get().setSelectionStatus(id, "Completed"));
    expect(harness.get().selections[0].status).toBe("Completed");

    harness.unmount();
  });

  it("remove and clear empty the selection list", async () => {
    const harness = renderHarness();

    await selectAndSave(harness, identity("div.a", "A"), "x");
    const id = harness.get().selections[0].id;

    act(() => harness.get().removeSelection(id));
    expect(harness.get().selections).toHaveLength(0);

    harness.unmount();
  });

  it("the work manager toggles open and closed", () => {
    const harness = renderHarness();

    act(() => harness.get().toggleWorkManager());
    expect(harness.get().workManagerOpen).toBe(true);

    act(() => harness.get().closeWorkManager());
    expect(harness.get().workManagerOpen).toBe(false);

    harness.unmount();
  });
});
