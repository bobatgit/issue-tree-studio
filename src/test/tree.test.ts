import { describe, expect, it } from "vitest";
import { parseMarkdown } from "../model/markdown";
import type { TreeDoc } from "../model/types";
import {
  addChild,
  addSibling,
  atCap,
  buildDoc,
  countItems,
  dropRetiredFields,
  createDoc,
  flatten,
  indentItem,
  moveItem,
  outdentItem,
  removeItem,
  visibleEntries,
} from "../model/tree";
import { ITEM_CAP } from "../model/types";

const labels = (doc: Parameters<typeof flatten>[0]): string[] => flatten(doc).map((entry) => entry.item.label);

describe("tree operations", () => {
  it("adds a child under the given parent", () => {
    const doc = createDoc("Tree", "Root?");
    const rootId = doc.rootId as string;
    const result = addChild(doc, rootId, "Child?");
    expect(result).not.toBeNull();
    expect(labels(result!.doc)).toEqual(["Root?", "Child?"]);
    expect(result!.doc.items[rootId].children).toHaveLength(1);
  });

  it("adds a sibling after the given item", () => {
    const doc = createDoc("Tree", "Root?");
    const rootId = doc.rootId as string;
    const first = addChild(doc, rootId, "A?")!;
    const second = addSibling(first.doc, first.id, "B?")!;
    expect(labels(second.doc)).toEqual(["Root?", "A?", "B?"]);
  });

  it("adds a child when a sibling is requested for the root", () => {
    const doc = createDoc("Tree", "Root?");
    const result = addSibling(doc, doc.rootId as string, "Only branch?")!;
    expect(labels(result.doc)).toEqual(["Root?", "Only branch?"]);
  });

  it("indents an item under its previous sibling and outdents it back", () => {
    const built = parseMarkdown("- Root?\n  - A?\n  - B?\n").doc;
    const [, , b] = flatten(built).map((entry) => entry.item.id);
    const indented = indentItem(built, b);
    expect(labels(indented)).toEqual(["Root?", "A?", "B?"]);
    expect(flatten(indented)[2].depth).toBe(3);

    const outdented = outdentItem(indented, b);
    expect(flatten(outdented)[2].depth).toBe(2);
  });

  it("does not outdent an item whose parent is the root-level parent", () => {
    const built = parseMarkdown("- Root?\n  - A?\n").doc;
    const childId = flatten(built)[1].item.id;
    const next = outdentItem(built, childId);
    expect(next).toBe(built);
  });

  it("refuses to move an item inside its own subtree", () => {
    const built = parseMarkdown("- Root?\n  - A?\n    - A1?\n").doc;
    const [, a, a1] = flatten(built).map((entry) => entry.item.id);
    const attempt = moveItem(built, a, a1, 0);
    expect(attempt).toBe(built);
  });

  it("moves an item with its children between parents", () => {
    const built = parseMarkdown("- Root?\n  - A?\n    - A1?\n  - B?\n").doc;
    const ids = flatten(built).map((entry) => entry.item.id);
    const moved = moveItem(built, ids[1], ids[3], 0);
    const flat = flatten(moved);
    expect(flat.map((entry) => entry.item.label)).toEqual(["Root?", "B?", "A?", "A1?"]);
    expect(flat[2].depth).toBe(3);
  });

  it("removes a subtree, not just the item", () => {
    const built = parseMarkdown("- Root?\n  - A?\n    - A1?\n    - A2?\n  - B?\n").doc;
    const aId = flatten(built)[1].item.id;
    const pruned = removeItem(built, aId);
    expect(labels(pruned)).toEqual(["Root?", "B?"]);
    expect(countItems(pruned)).toBe(2);
  });

  it("treats deleting the root as an empty tree", () => {
    const doc = createDoc("Tree", "Root?");
    const empty = removeItem(doc, doc.rootId as string);
    expect(empty.rootId).toBeNull();
    expect(countItems(empty)).toBe(0);
  });

  it("enforces the 100-item cap", () => {
    const doc = createDoc("Tree", "Root?");
    let current = doc;
    for (let index = 0; index < ITEM_CAP - 1; index += 1) {
      const result = addChild(current, doc.rootId as string, `Item ${index}?`);
      expect(result).not.toBeNull();
      current = result!.doc;
    }
    expect(countItems(current)).toBe(ITEM_CAP);
    expect(atCap(current)).toBe(true);
    expect(addChild(current, doc.rootId as string, "Over the cap?")).toBeNull();
  });
});

describe("buildDoc", () => {
  it("builds a tree from a depth list", () => {
    const doc = buildDoc("Test", [
      { label: "Root?", depth: 1 },
      { label: "A?", depth: 2 },
      { label: "A1?", depth: 3 },
      { label: "B?", depth: 2 },
    ]);
    expect(labels(doc)).toEqual(["Root?", "A?", "A1?", "B?"]);
    expect(flatten(doc)[2].depth).toBe(3);
  });

  it("adds a synthetic root for several top-level items", () => {
    const doc = buildDoc("Test", [
      { label: "A?", depth: 1 },
      { label: "B?", depth: 1 },
    ], { syntheticRoot: "Shared root?" });
    expect(labels(doc)).toEqual(["Shared root?", "A?", "B?"]);
  });
});

describe("collapsed branches", () => {
  it("hides the descendants of a collapsed item", () => {
    const doc = parseMarkdown("- Root?\n  - A?\n    - A1?\n  - B?\n").doc;
    const a = Object.values(doc.items).find((item) => item.label === "A?")?.id as string;
    const visible = visibleEntries(doc, new Set([a]));
    expect(visible.map((entry) => entry.item.label)).toEqual(["Root?", "A?", "B?"]);
  });

  it("keeps everything visible when nothing is collapsed", () => {
    const doc = parseMarkdown("- Root?\n  - A?\n").doc;
    expect(visibleEntries(doc, new Set()).length).toBe(countItems(doc));
  });
});

describe("retired fields", () => {
  /** A document as 0.10.x wrote it, with the two fields 0.11.0 removed. */
  const legacy = () => {
    const doc = buildDoc("Legacy", [
      { label: "Root?", depth: 1 },
      { label: "A?", depth: 2 },
    ]);
    const rootId = doc.rootId as string;
    const childId = doc.items[rootId].children[0];
    const raw = JSON.parse(JSON.stringify(doc)) as {
      items: Record<string, Record<string, unknown>>;
    };
    raw.items[childId].note = "evidence";
    raw.items[childId].mece = { exhaustive: true, exclusive: false };
    return { raw: raw as unknown as TreeDoc, rootId, childId };
  };

  it("drops a note and MECE flags, and alters nothing else", () => {
    const { raw, rootId, childId } = legacy();
    const before = raw.items[rootId];

    const cleaned = dropRetiredFields(raw);
    const item = cleaned.items[childId];

    expect("note" in item).toBe(false);
    expect("mece" in item).toBe(false);
    expect(item.label).toBe("A?");
    expect(item.status).toBe("open");
    expect(cleaned.items[rootId].children).toEqual(before.children);
    expect(cleaned.name).toBe(raw.name);
    expect(cleaned.version).toBe(raw.version);
  });

  it("returns the same document when there is nothing to drop", () => {
    const doc = buildDoc("Clean", [{ label: "Root?", depth: 1 }]);
    expect(dropRetiredFields(doc)).toBe(doc);
  });
});
