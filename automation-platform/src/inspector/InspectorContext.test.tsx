import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, expect, it } from "vitest";

import { InspectorProvider, useInspector } from "./InspectorContext";
import type {
  ElementIdentity,
  InspectorNote,
  NoteStore,
  WorkPriority,
  WorkType,
} from "./types";

/**
 * An in-memory store with an auto-incrementing counter, mirroring the backend's
 * `#N` assignment. Injected through the `store` prop so the state machine is
 * exercised against a real seam rather than a mocked module.
 */
function inMemoryNoteStore(seed: InspectorNote[] = []): NoteStore {
  const notes = new Map<number, InspectorNote>(seed.map((note) => [note.id, note]));
  let nextId = seed.reduce((max, note) => Math.max(max, note.id), 0);

  return {
    async list() {
      return [...notes.values()];
    },
    async create(input) {
      nextId += 1;
      const note: InspectorNote = {
        id: nextId,
        note: input.note,
        identity: input.identity ? (JSON.stringify(input.identity) ?? null) : null,
        status: input.status,
        origin: input.origin,
        type: input.type,
        priority: input.priority,
        title: input.title,
        updatedAt: new Date().toISOString(),
      };
      notes.set(nextId, note);
      return nextId;
    },
    async update(id, edit) {
      const note = notes.get(id);
      if (note) {
        notes.set(id, { ...note, ...edit, updatedAt: new Date().toISOString() });
      }
    },
    async setStatus(id, status) {
      const note = notes.get(id);
      if (note) {
        notes.set(id, { ...note, status, updatedAt: new Date().toISOString() });
      }
    },
    async remove(id) {
      notes.delete(id);
    },
    async clear() {
      notes.clear();
    },
  };
}

/**
 * A store whose mutations reject, used to exercise failure paths. `list`
 * resolves to the given seed (or `[]`) unless `failList` is set, which makes
 * `load` fail too.
 */
function failingStore(options: { seed?: InspectorNote[]; failList?: boolean } = {}): NoteStore {
  const fail = () => Promise.reject(new Error("boom"));
  return {
    list: options.failList ? fail : () => Promise.resolve(options.seed ?? []),
    create: fail,
    update: fail,
    setStatus: fail,
    remove: fail,
    clear: fail,
  };
}

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

function renderHarness(
  workspaceId: string | null = null,
  seed: InspectorNote[] = [],
  store?: NoteStore,
) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  const resolvedStore = store ?? inMemoryNoteStore(seed);
  let state: ReturnType<typeof useInspector> | null = null;

  function Harness() {
    state = useInspector();
    return null;
  }

  act(() => {
    root.render(
      <InspectorProvider workspaceId={workspaceId} store={resolvedStore}>
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

  it("keeps a stable id across save while assigning a number", async () => {
    const harness = renderHarness();
    act(() => harness.get().toggleSelector());
    act(() => harness.get().addSelection(identity("div.a", "A")));
    const id = harness.get().activeSelectionId!;

    await act(async () => {
      await harness.get().saveNote(id, "hello");
    });

    const saved = harness.get().selections[0];
    expect(saved.id).toBe(id);
    expect(saved.number).toBe(1);

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

  it("coerces unknown priority and type on load", async () => {
    const seed: InspectorNote[] = [
      {
        id: 1,
        note: "bad priority",
        identity: null,
        status: "Backlog",
        origin: "App",
        type: "Bug",
        priority: "Blocker" as unknown as WorkPriority,
        title: null,
        updatedAt: "t1",
      },
      {
        id: 2,
        note: "bad type",
        identity: null,
        status: "Backlog",
        origin: "App",
        type: "Chore" as unknown as WorkType,
        priority: "High",
        title: null,
        updatedAt: "t2",
      },
      {
        id: 3,
        note: "valid",
        identity: null,
        status: "Backlog",
        origin: "App",
        type: "Feature",
        priority: "Urgent",
        title: null,
        updatedAt: "t3",
      },
    ];

    const harness = renderHarness("ws", seed);

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    const selections = harness.get().selections;
    expect(selections).toHaveLength(3);
    expect(selections[0].priority).toBe("Normal");
    expect(selections[1].type).toBeNull();
    expect(selections[2].priority).toBe("Urgent");
    expect(selections[2].type).toBe("Feature");

    harness.unmount();
  });

  it("saveNote failure keeps the modal open and sets error", async () => {
    const harness = renderHarness(null, [], failingStore());

    act(() => harness.get().toggleSelector());
    act(() => harness.get().addSelection(identity("div.a", "A")));
    const id = harness.get().activeSelectionId!;

    await act(async () => {
      await harness.get().saveNote(id, "hello");
    });

    expect(harness.get().mode).toBe("noting");
    expect(harness.get().activeSelectionId).toBe(id);
    expect(harness.get().error).not.toBeNull();

    harness.unmount();
  });

  it("createManualItem failure rejects and sets error", async () => {
    const harness = renderHarness(null, [], failingStore());

    await act(async () => {
      await expect(
        harness.get().createManualItem({ title: "T", note: "", type: null, priority: "Normal" }),
      ).rejects.toThrow("boom");
    });

    expect(harness.get().error).not.toBeNull();

    harness.unmount();
  });

  it("removeSelection failure restores the removed selection and sets error", async () => {
    const seed: InspectorNote[] = [
      { id: 1, note: "x", identity: null, status: "Backlog", origin: "App", type: null, priority: "Normal", title: "T", updatedAt: "t1" },
    ];
    const harness = renderHarness("ws", [], failingStore({ seed }));

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    const id = harness.get().selections[0].id;

    act(() => harness.get().removeSelection(id));
    expect(harness.get().selections).toHaveLength(0);

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    expect(harness.get().selections).toHaveLength(1);
    expect(harness.get().error).not.toBeNull();

    harness.unmount();
  });

  it("editItem failure reverts the field and sets error", async () => {
    const seed: InspectorNote[] = [
      { id: 1, note: "original", identity: null, status: "Backlog", origin: "App", type: null, priority: "Normal", title: "T", updatedAt: "t1" },
    ];
    const harness = renderHarness("ws", [], failingStore({ seed }));

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    const id = harness.get().selections[0].id;

    act(() =>
      harness.get().editItem(id, { note: "changed", type: null, priority: "High", title: "T" }),
    );
    expect(harness.get().selections[0].note).toBe("changed");

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    expect(harness.get().selections[0].note).toBe("original");
    expect(harness.get().error).not.toBeNull();

    harness.unmount();
  });

  it("setSelectionStatus failure reverts the status and sets error", async () => {
    const seed: InspectorNote[] = [
      { id: 1, note: "x", identity: null, status: "Backlog", origin: "App", type: null, priority: "Normal", title: "T", updatedAt: "t1" },
    ];
    const harness = renderHarness("ws", [], failingStore({ seed }));

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    const id = harness.get().selections[0].id;

    act(() => harness.get().setSelectionStatus(id, "In Progress"));
    expect(harness.get().selections[0].status).toBe("In Progress");

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    expect(harness.get().selections[0].status).toBe("Backlog");
    expect(harness.get().error).not.toBeNull();

    harness.unmount();
  });

  it("load failure sets error", async () => {
    const harness = renderHarness("ws", [], failingStore({ failList: true }));

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    expect(harness.get().error).not.toBeNull();

    harness.unmount();
  });
});
