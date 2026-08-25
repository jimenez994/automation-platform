import { itemTitle } from "./identify";
import type { Selection } from "./types";

/**
 * Renders the given work items as a Markdown prompt for Claude Code.
 *
 * The heading is the item's `#N` when it has one, otherwise its title.
 * Element-derived items carry Component / Source / Element / Selector; manual
 * items carry only a Title.
 */
export function generateMarkdown(selections: Selection[]): string {
  const lines: string[] = ["# UI Changes"];

  selections.forEach((selection) => {
    const { identity, number, note, title } = selection;
    const isElementItem = identity.selector.length > 0;

    lines.push("");
    lines.push(`## ${number != null ? `#${number}` : itemTitle(selection)}`);
    lines.push("");

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

    lines.push("");
    lines.push("Request:");
    lines.push(note.trim() || "(no note)");
  });

  return `${lines.join("\n")}\n`;
}
