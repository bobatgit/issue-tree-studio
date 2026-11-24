import { describe, expect, it } from "vitest";
import { diffSnapshots } from "../model/diff";
import { computeKeyMap } from "../model/keys";
import { parseMarkdown } from "../model/markdown";
import { addChild, flatten, moveNode, removeNode, snapshotOf } from "../model/tree";
import type { TreeDoc } from "../model/types";

function snap(doc: TreeDoc) {
  const map = computeKeyMap(doc);
  return {
    snapshot: snapshotOf(doc),
    keys: Object.fromEntries(Object.entries(map.byNode).map(([id, info]) => [id, info.key])),
  };
}

describe("version diff", () => {
  it("detects an added branch", () => {
    const before = parseMarkdown("- Root?\n  - A?\n").doc;
    const after = addChild(before, before.rootId as string, "B?")!.doc;
    const diff = diffSnapshots(snap(before), snap(after));
    expect(diff.added.map((entry) => entry.label)).toEqual(["B?"]);
    expect(diff.summary).toContain("1 added");
  });

  it("detects a removed branch", () => {
    const before = parseMarkdown("- Root?\n  - A?\n  - B?\n").doc;
    const bId = flatten(before).find((entry) => entry.node.label === "B?")!.node.id;
    const after = removeNode(before, bId);
    const diff = diffSnapshots(snap(before), snap(after));
    expect(diff.removed.map((entry) => entry.label)).toEqual(["B?"]);
    expect(diff.summary).toContain("1 removed");
  });

  it("detects a relabel and the key change it causes", () => {
    const before = parseMarkdown("- Root?\n  - A?\n  - B?\n").doc;
    const aId = flatten(before)[1].node.id;
    const after: TreeDoc = {
      ...before,
      nodes: { ...before.nodes, [aId]: { ...before.nodes[aId], label: "A changed?" } },
    };
    const diff = diffSnapshots(snap(before), snap(after));
    expect(diff.relabelled).toHaveLength(1);
    expect(diff.relabelled[0].from).toBe("A?");
    expect(diff.rekeyed).toHaveLength(1);
    expect(diff.summary).toContain("relabelled");
    expect(diff.summary).toContain("keys changed");
  });

  it("detects a move to a different parent", () => {
    const before = parseMarkdown("- Root?\n  - A?\n  - B?\n").doc;
    const ids = flatten(before).map((entry) => entry.node.id);
    const moved = moveNode(before, ids[2], ids[1], 0);
    const diff = diffSnapshots(snap(before), snap(moved));
    expect(diff.moved).toHaveLength(1);
    expect(diff.moved[0].from).toBe("Root?");
    expect(diff.moved[0].to).toBe("Root? / A?");
    expect(diff.summary).toContain("moved");
  });

  it("reports no visible change for identical snapshots", () => {
    const doc = parseMarkdown("- Root?\n  - A?\n").doc;
    const diff = diffSnapshots(snap(doc), snap(doc));
    expect(diff.summary).toBe("no visible change");
    expect(diff.rekeyed).toHaveLength(0);
  });
});
