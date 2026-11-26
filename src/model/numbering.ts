/**
 * Position numbers: Q0, Q1, Q2.4.1.
 *
 * A number is derived on every render from where an item sits. It is never
 * stored, never enters the key hash, and never reaches a version snapshot or a
 * diff, so an undo after a reorder has nothing to restore and folding cannot
 * renumber anything.
 *
 * The key stays the identity. The number is a reading aid, so two people can
 * settle a branch by saying "look at Q2.4.1".
 */

import { flatten } from "./tree";
import type { TreeDoc } from "./types";

/**
 * The number of every item in a document, by item id.
 *
 * The root is `Q0`. A child of the root is `Q` and its position among its
 * siblings, counting from one. Anything deeper appends a dot and its position
 * to its parent's number, so a third-level item under `Q2`'s fourth child is
 * `Q2.4.1`.
 */
export function itemNumbers(doc: TreeDoc): Record<string, string> {
  const numbers: Record<string, string> = {};
  for (const entry of flatten(doc)) {
    if (entry.depth === 1) {
      numbers[entry.item.id] = "Q0";
      continue;
    }
    const position = entry.index + 1;
    if (entry.depth === 2) {
      numbers[entry.item.id] = `Q${position}`;
      continue;
    }
    const parent = entry.parentId ? numbers[entry.parentId] : undefined;
    numbers[entry.item.id] = `${parent ?? "Q0"}.${position}`;
  }
  return numbers;
}

/**
 * A line that carries both: the number, a period, then the label. Used by the
 * markdown export, where the root reads `Q0. Why did profit fall?`.
 */
export function withNumber(number: string, label: string): string {
  const wording = label.trim() || "Untitled";
  return number ? `${number}. ${wording}` : wording;
}
