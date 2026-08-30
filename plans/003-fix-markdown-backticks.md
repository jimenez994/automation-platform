# Plan 003: Escape backticks in `generateMarkdown` inline code

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 794dd9c..HEAD -- automation-platform/src/inspector/markdown.ts automation-platform/src/inspector/inspector.test.ts`
> If either file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch, treat
> it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `794dd9c`, 2026-08-24
- **Issue**: —

## Why this matters

`generateMarkdown` (`automation-platform/src/inspector/markdown.ts`) turns
inspector selections into a Markdown prompt that the user copies into Claude
Code. It wraps several fields in backtick code spans — `title`, `component`,
`sourceFile`, `tag`, `selector` — but never escapes backticks in those values.
A user-typed manual title like `Widen `filter` input` (backticks are legal in
an input field) breaks the code span and corrupts the generated Markdown; an
element `id` containing a backtick does the same to the `selector`. The bug is
silent (no crash), so it ships bad prompts.

The fix is a small escaping helper, plus a regression test so it can't regress.

## Current state

- `automation-platform/src/inspector/markdown.ts` — the generator. The five
  backtick-wrapped fields (lines 22-34), none of which escape their value:
  ```ts
  if (title && number != null) {
    lines.push(`Title: \`${title}\``);
  }
  if (identity.component) {
    lines.push(`Component: \`${identity.component}\``);
  }
  if (identity.sourceFile) {
    lines.push(`Source: \`${identity.sourceFile}\``);
  }
  if (isElementItem) {
    lines.push(`Element: \`${identity.tag}\``);
    lines.push(`Selector: \`${identity.selector}\``);
  }
  ```
- The heading `## ${number != null ? \`#${number}\` : itemTitle(selection)}`
  needs no change: `#${number}` is a number, and `itemTitle` is heading text,
  not a code span.
- `automation-platform/src/inspector/inspector.test.ts` already has a
  `describe("generateMarkdown", ...)` block (lines 195-272) with a `selection()`
  fixture factory at the top of the file. The existing tests only use safe
  strings, so none exercises backticks.
- Conventions: the repo tests live in `*.test.ts(x)` under `src/`, colocated
  with the code (vitest `include: ["src/**/*.test.{ts,tsx}"]`). Pure string
  logic tests use `describe`/`it`/`expect` from `vitest`, no DOM.

## Commands you will need

Run all commands from the `automation-platform/` directory.

| Purpose | Command | Expected on success |
|---|---|---|
| Single test file | `npx vitest run src/inspector/inspector.test.ts` | all pass, incl. new cases |
| Frontend tests | `npm run test:unit` | all pass |
| Typecheck | `npx tsc --noEmit` | exit 0, no errors |

## Scope

**In scope** (the only files you should modify):
- `automation-platform/src/inspector/markdown.ts`
- `automation-platform/src/inspector/inspector.test.ts`

**Out of scope** (do NOT touch):
- `automation-platform/src/inspector/identify.ts` and `clipboard.ts` — unrelated
  to this fix; `clipboard.ts` has no test and none is being added here.
- Any change to `generateMarkdown`'s output structure beyond the escaping (keep
  headings, section labels, and line ordering exactly as they are).

## Git workflow

- Branch: `advisor/003-fix-markdown-backticks`
- Commit message: `Escape backticks in generated inspector Markdown` (imperative
  sentence, matching repo style).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add an escaping helper to `markdown.ts`

Add this function just above `generateMarkdown` (order matters: escape
backslashes first, then backticks):

```ts
/** Escapes characters that would otherwise terminate the surrounding backtick code span. */
function inlineCode(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/`/g, "\\`");
}
```

### Step 2: Apply it to the five backtick-wrapped fields

Change the five `lines.push` calls in `generateMarkdown` to pass their value
through `inlineCode`, leaving the surrounding backticks and labels untouched:

```ts
  if (title && number != null) {
    lines.push(`Title: \`${inlineCode(title)}\``);
  }
  if (identity.component) {
    lines.push(`Component: \`${inlineCode(identity.component)}\``);
  }
  if (identity.sourceFile) {
    lines.push(`Source: \`${inlineCode(identity.sourceFile)}\``);
  }
  if (isElementItem) {
    lines.push(`Element: \`${inlineCode(identity.tag)}\``);
    lines.push(`Selector: \`${inlineCode(identity.selector)}\``);
  }
```

Do **not** change the heading line or the `Request:`/note lines.

**Verify**: `npx tsc --noEmit` → exit 0, no errors.

### Step 3: Add regression tests

Inside the existing `describe("generateMarkdown", ...)` block in
`automation-platform/src/inspector/inspector.test.ts`, add two tests that reuse
the existing `selection()` helper.

Test 1 — a manual item title with backticks stays a single code span:

```ts
it("escapes backticks in a manual title", () => {
  const markdown = generateMarkdown([
    selection({ number: 7, title: "Widen `filter` input", note: "x" }),
  ]);

  expect(markdown).toContain("Title: `Widen \\`filter\\` input`");
  expect(markdown).not.toContain("Title: `Widen `filter` input`");
});
```

Test 2 — element-derived fields escape backticks too:

```ts
it("escapes backticks in component, source and selector", () => {
  const markdown = generateMarkdown([
    selection({
      number: 1,
      identity: {
        tag: "div",
        id: null,
        classes: ["x"],
        testId: null,
        label: null,
        text: null,
        selector: "div.x`y",
        component: "Badge`",
        sourceFile: "src/`weird`.tsx",
        hierarchy: [],
        isDeveloperTool: false,
      },
      note: "x",
    }),
  ]);

  expect(markdown).toContain("Component: `Badge\\``");
  expect(markdown).toContain("Source: `src/\\`weird\\`.tsx`");
  expect(markdown).toContain("Selector: `div.x\\`y`");
});
```

Note the expected strings use double quotes; a backtick inside a double-quoted
JS string is literal, and `\\` is one backslash. The escaped sequence in the
output is backslash-backtick (`\``) before each closing backtick.

**Verify**: `npx vitest run src/inspector/inspector.test.ts` → all pass,
including the 2 new tests.

### Step 4: Run the full frontend suite and typecheck

**Verify**:
- `npm run test:unit` → all tests pass.
- `npx tsc --noEmit` → exit 0.

## Test plan

- File: `automation-platform/src/inspector/inspector.test.ts` (extend the
  existing `generateMarkdown` describe block).
- Cases: backticks in a manual `title`; backticks in `component`, `sourceFile`,
  `selector`. Assert the escaped form is present and the unescaped form is
  absent (for the title case).
- Structural pattern: the existing `generateMarkdown` tests in the same file,
  reusing the `selection()` fixture factory.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `inlineCode` helper added to `markdown.ts` and applied to all five
      backtick-wrapped fields (title, component, sourceFile, tag, selector)
- [ ] `npm run test:unit` exits 0, including the 2 new markdown tests
- [ ] `npx tsc --noEmit` exits 0
- [ ] `git status` shows only `markdown.ts` and `inspector.test.ts` changed
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `markdown.ts` or `inspector.test.ts` no longer matches the "Current state"
  excerpts (drift).
- The `generateMarkdown` describe block was moved or renamed.
- The `selection()` fixture factory signature changed (its `overrides` argument
  no longer merges into `identity` as shown).

## Maintenance notes

- If `generateMarkdown` ever wraps another field in backticks (e.g. a future
  `hierarchy` line), it must go through `inlineCode`.
- Deferred, out of scope: rendering `note` through a Markdown-sanitizing path —
  the note is intentionally emitted raw as free-form text; escaping it is a
  separate, larger decision (it changes the intended output).
