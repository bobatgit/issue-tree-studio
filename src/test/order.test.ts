/**
 * Item order comes from the tree, never from object key order.
 *
 * `newId()` returns a slice of a UUID, so about one id in fifty is all digits. JavaScript orders
 * integer-like object keys first, in numeric order, so on those runs `Object.keys(doc.items)` and
 * `Object.values(doc.items)` return a different order from the tree. The deck reads that map to
 * choose which items share a slide, so a slide could quietly show a different set of branches on
 * one run than the next, from the same document, with nothing reporting it.
 *
 * It was found by accident, when a test that read the map passed locally twice and failed in CI.
 */
import { describe, expect, it } from "vitest";
import { overviewIds } from "../export/pptx";
import { packSlides } from "../model/layout";
import { parseMarkdown } from "../model/markdown";
import { flatten } from "../model/tree";
import type { TreeDoc, TreeItem } from "../model/types";

const SAMPLE = `- Why did profit fall?
  - Did revenue fall?
    - Did price fall?
  - Did cost rise?
    - Did input prices rise?
    - Did yield worsen?
`;

/**
 * The same tree with integer-like ids, numbered so that key order is the reverse of the tree.
 *
 * That is the worst case a random id can produce, and it makes the hazard visible rather than
 * relying on a one-in-fifty run to reveal it.
 */
function withIntegerIds(doc: TreeDoc): TreeDoc {
  const preorder = flatten(doc).map((entry) => entry.item.id);
  const renamed = new Map(
    preorder.map((id, index) => [id, String(10000000 + (preorder.length - index) * 7)]),
  );

  const items: Record<string, TreeItem> = {};
  for (const [id, item] of Object.entries(doc.items)) {
    const next = renamed.get(id) ?? id;
    items[next] = {
      ...item,
      id: next,
      children: item.children.map((childId) => renamed.get(childId) ?? childId),
    };
  }

  const rootId = doc.rootId ? renamed.get(doc.rootId) ?? doc.rootId : null;
  return { ...doc, rootId, items };
}

describe("item order", () => {
  it("comes from the tree even when the ids look like array indexes", () => {
    const doc = withIntegerIds(parseMarkdown(SAMPLE).doc);
    const preorder = flatten(doc).map((entry) => entry.item.id);

    // The map really is in a different order. This is the hazard, and it is why the rest matters.
    expect(Object.keys(doc.items)).not.toEqual(preorder);

    // The map keeps whatever order JavaScript gives it; the stored shape is not changing. What
    // changes is that nothing reads it for order: every consumer goes through `flatten`.
    expect(packSlides(doc)[0].itemIds).toEqual(preorder);
    expect(overviewIds(doc).ids).toEqual(preorder);
  });

  it("leaves an ordinary document's slides exactly as they were", () => {
    const doc = parseMarkdown(SAMPLE).doc;
    const preorder = flatten(doc).map((entry) => entry.item.id);

    // Nothing is claimed about the map's own key order. A document built with `newId` can still
    // hold an all-digit id by chance - one did while this test was being written, `76800518` - and
    // asserting it is the flaky test that started this issue. What must hold is that the consumers
    // use the tree's order, and that the deck's slide count is unchanged.
    expect(overviewIds(doc).ids).toEqual(preorder);
    expect(packSlides(doc).length).toBe(2);
  });
});
