/**
 * Position numbers.
 *
 * A number is derived from where an item sits, so it renumbers on a move and it
 * is not stored anywhere. Nothing here touches the key hash: the key is the
 * identity and the number is a reading aid.
 */

import { describe, expect, it } from "vitest";
import { itemNumbers, withNumber } from "../model/numbering";
import { parseMarkdown } from "../model/markdown";
import { moveItem } from "../model/tree";
import type { TreeDoc } from "../model/types";

function tree(): TreeDoc {
  return parseMarkdown(
    `- Root?
  - First?
    - First one?
    - First two?
      - Deep?
  - Second?
  - Third?
`,
    "Numbers",
  ).doc;
}

/** Numbers by label, which is how a reader would check them. */
function numbersByLabel(doc: TreeDoc): Record<string, string> {
  const numbers = itemNumbers(doc);
  const out: Record<string, string> = {};
  for (const [id, item] of Object.entries(doc.items)) out[item.label] = numbers[id];
  return out;
}

describe("position numbers", () => {
  it("gives the root Q0 and its children Q1 upward", () => {
    const numbers = numbersByLabel(tree());
    expect(numbers["Root?"]).toBe("Q0");
    expect(numbers["First?"]).toBe("Q1");
    expect(numbers["Second?"]).toBe("Q2");
    expect(numbers["Third?"]).toBe("Q3");
  });

  it("nests the parent number and the position among siblings", () => {
    const numbers = numbersByLabel(tree());
    expect(numbers["First one?"]).toBe("Q1.1");
    expect(numbers["First two?"]).toBe("Q1.2");
    expect(numbers["Deep?"]).toBe("Q1.2.1");
  });

  it("renumbers on a move and changes nothing else", () => {
    const doc = tree();
    const third = Object.values(doc.items).find((item) => item.label === "Third?");
    const moved = moveItem(doc, third!.id, doc.rootId as string, 0);
    const numbers = numbersByLabel(moved);
    expect(numbers["Third?"]).toBe("Q1");
    expect(numbers["First?"]).toBe("Q2");
    expect(numbers["First two?"]).toBe("Q2.2");
    expect(numbers["Deep?"]).toBe("Q2.2.1");
  });

  it("reads the position of a child, not the depth, so a new root child renumbers", () => {
    const doc = tree();
    const numbers = numbersByLabel(doc);
    expect(numbers["First one?"]).toBe("Q1.1");
    // The second child of the first child, one level deeper, is not Q1.1.
    expect(numbers["Deep?"]).not.toBe(numbers["First two?"]);
  });

  it("writes the number before the wording for a list line", () => {
    expect(withNumber("Q2.4.1", "Did price fall?")).toBe("Q2.4.1. Did price fall?");
    expect(withNumber("", "Did price fall?")).toBe("Did price fall?");
    expect(withNumber("Q1", "   ")).toBe("Q1. Untitled");
  });
});
