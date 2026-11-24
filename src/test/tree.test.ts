import { describe, expect, it } from "vitest";
import { parseMarkdown } from "../model/markdown";
import {
  addChild,
  addSibling,
  atCap,
  buildDoc,
  countNodes,
  createDoc,
  flatten,
  indentNode,
  moveNode,
  outdentNode,
  removeNode,
  visibleEntries,
} from "../model/tree";
import { NODE_CAP } from "../model/types";

const labels = (doc: Parameters<typeof flatten>[0]): string[] => flatten(doc).map((entry) => entry.node.label);

describe("tree operations", () => {
  it("adds a child under the given parent", () => {
    const doc = createDoc("Tree", "Root?");
    const rootId = doc.rootId as string;
    const result = addChild(doc, rootId, "Child?");
    expect(result).not.toBeNull();
    expect(labels(result!.doc)).toEqual(["Root?", "Child?"]);
    expect(result!.doc.nodes[rootId].children).toHaveLength(1);
  });

  it("adds a sibling after the given node", () => {
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

  it("indents a node under its previous sibling and outdents it back", () => {
    const built = parseMarkdown("- Root?\n  - A?\n  - B?\n").doc;
    const [, , b] = flatten(built).map((entry) => entry.node.id);
    const indented = indentNode(built, b);
    expect(labels(indented)).toEqual(["Root?", "A?", "B?"]);
    expect(flatten(indented)[2].depth).toBe(3);

    const outdented = outdentNode(indented, b);
    expect(flatten(outdented)[2].depth).toBe(2);
  });

  it("does not outdent a node whose parent is the root-level parent", () => {
    const built = parseMarkdown("- Root?\n  - A?\n").doc;
    const childId = flatten(built)[1].node.id;
    const next = outdentNode(built, childId);
    expect(next).toBe(built);
  });

  it("refuses to move a node inside its own subtree", () => {
    const built = parseMarkdown("- Root?\n  - A?\n    - A1?\n").doc;
    const [, a, a1] = flatten(built).map((entry) => entry.node.id);
    const attempt = moveNode(built, a, a1, 0);
    expect(attempt).toBe(built);
  });

  it("moves a node with its children between parents", () => {
    const built = parseMarkdown("- Root?\n  - A?\n    - A1?\n  - B?\n").doc;
    const ids = flatten(built).map((entry) => entry.node.id);
    const moved = moveNode(built, ids[1], ids[3], 0);
    const flat = flatten(moved);
    expect(flat.map((entry) => entry.node.label)).toEqual(["Root?", "B?", "A?", "A1?"]);
    expect(flat[2].depth).toBe(3);
  });

  it("removes a subtree, not just the node", () => {
    const built = parseMarkdown("- Root?\n  - A?\n    - A1?\n    - A2?\n  - B?\n").doc;
    const aId = flatten(built)[1].node.id;
    const pruned = removeNode(built, aId);
    expect(labels(pruned)).toEqual(["Root?", "B?"]);
    expect(countNodes(pruned)).toBe(2);
  });

  it("treats deleting the root as an empty tree", () => {
    const doc = createDoc("Tree", "Root?");
    const empty = removeNode(doc, doc.rootId as string);
    expect(empty.rootId).toBeNull();
    expect(countNodes(empty)).toBe(0);
  });

  it("enforces the 100-node cap", () => {
    const doc = createDoc("Tree", "Root?");
    let current = doc;
    for (let index = 0; index < NODE_CAP - 1; index += 1) {
      const result = addChild(current, doc.rootId as string, `Item ${index}?`);
      expect(result).not.toBeNull();
      current = result!.doc;
    }
    expect(countNodes(current)).toBe(NODE_CAP);
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
  it("hides the descendants of a collapsed node", () => {
    const doc = parseMarkdown("- Root?\n  - A?\n    - A1?\n  - B?\n").doc;
    const a = Object.values(doc.nodes).find((node) => node.label === "A?")?.id as string;
    const visible = visibleEntries(doc, new Set([a]));
    expect(visible.map((entry) => entry.node.label)).toEqual(["Root?", "A?", "B?"]);
  });

  it("keeps everything visible when nothing is collapsed", () => {
    const doc = parseMarkdown("- Root?\n  - A?\n").doc;
    expect(visibleEntries(doc, new Set()).length).toBe(countNodes(doc));
  });
});
