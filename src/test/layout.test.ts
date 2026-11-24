import { describe, expect, it } from "vitest";
import { computeKeyMap } from "../model/keys";
import { estimateCharsPerLine, layoutTree, packSlides, wrapText } from "../model/layout";
import { parseMarkdown } from "../model/markdown";

function docFrom(markdown: string) {
  return parseMarkdown(markdown, "Layout test").doc;
}

const SAMPLE = `- Why did profit fall 20%?
  - Did revenue fall?
    - Did price fall?
      - Did we discount more?
    - Did volume fall?
      - Did churn rise?
  - Did cost rise?
    - Did input cost rise?
    - Did headcount grow?
  - Did mix shift?
    - Did low margin grow faster?
`;

describe("text wrapping", () => {
  it("wraps within the character budget and line limit", () => {
    const lines = wrapText("one two three four five six seven", 12, 3);
    expect(lines.length).toBeLessThanOrEqual(3);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(12);
  });

  it("marks truncation with an ellipsis", () => {
    const lines = wrapText("alpha beta gamma delta epsilon zeta eta theta", 10, 2);
    expect(lines).toHaveLength(2);
    expect(lines[lines.length - 1].endsWith("…")).toBe(true);
  });

  it("handles an empty label and one very long word", () => {
    expect(wrapText("", 10, 2)).toEqual([""]);
    const long = wrapText("supercalifragilisticexpialidocious", 10, 2);
    expect(long[0].length).toBeLessThanOrEqual(10);
    expect(long[0].endsWith("…")).toBe(true);
  });

  it("estimates a sensible character budget", () => {
    expect(estimateCharsPerLine(2.6, 9)).toBeGreaterThan(30);
    expect(estimateCharsPerLine(1.0, 7)).toBeGreaterThan(5);
  });
});

describe("tree layout", () => {
  it("fits inside the requested box and connects every node", () => {
    const doc = docFrom(SAMPLE);
    const layout = layoutTree(doc, computeKeyMap(doc), null, { maxWidth: 12, maxHeight: 5.5 });
    expect(layout.width).toBeLessThanOrEqual(12.001);
    expect(layout.height).toBeLessThanOrEqual(5.501);
    expect(layout.nodes).toHaveLength(Object.keys(doc.nodes).length);
    expect(layout.edges).toHaveLength(layout.nodes.length - 1);
    for (const node of layout.nodes) {
      expect(node.x + node.w).toBeLessThanOrEqual(layout.width + 0.001);
      expect(node.y + node.h).toBeLessThanOrEqual(layout.height + 0.001);
    }
  });

  it("keeps leaves on distinct rows", () => {
    const doc = docFrom(SAMPLE);
    const layout = layoutTree(doc, computeKeyMap(doc), null, { maxWidth: 12, maxHeight: 8 });
    const leafYs = layout.nodes
      .filter((node) => (doc.nodes[node.id]?.children ?? []).length === 0)
      .map((node) => Math.round(node.y * 1000));
    expect(new Set(leafYs).size).toBe(leafYs.length);
  });

  it("centres a parent between its children", () => {
    const doc = docFrom(SAMPLE);
    const layout = layoutTree(doc, computeKeyMap(doc), null, { maxWidth: 12, maxHeight: 8 });
    const byId = new Map(layout.nodes.map((node) => [node.id, node]));
    for (const node of Object.values(doc.nodes)) {
      if (node.children.length < 2) continue;
      const parent = byId.get(node.id)!;
      const children = node.children.map((childId) => byId.get(childId)!);
      const centers = children.map((child) => child.y + child.h / 2);
      const parentCenter = parent.y + parent.h / 2;
      expect(parentCenter).toBeGreaterThanOrEqual(Math.min(...centers) - 0.001);
      expect(parentCenter).toBeLessThanOrEqual(Math.max(...centers) + 0.001);
    }
  });

  it("lays out a subset when branch slides need one", () => {
    const doc = docFrom(SAMPLE);
    const rootId = doc.rootId as string;
    const branchId = doc.nodes[rootId].children[0];
    const subset = [rootId, branchId, ...Object.values(doc.nodes)
      .filter((node) => node.id !== rootId && node.id !== branchId)
      .map((node) => node.id)];
    const layout = layoutTree(doc, computeKeyMap(doc), [rootId, branchId], { maxWidth: 12, maxHeight: 5 });
    expect(layout.nodes).toHaveLength(2);
    expect(subset.length).toBeGreaterThan(2);
  });

  it("never exceeds the height even when extremely dense", () => {
    const lines = ["- Root?", ...Array.from({ length: 99 }, (_, index) => `  - Branch ${index}?`)];
    const doc = docFrom(lines.join("\n"));
    const layout = layoutTree(doc, computeKeyMap(doc), null, { maxWidth: 12, maxHeight: 4 });
    expect(layout.height).toBeLessThanOrEqual(4.001);
    expect(layout.rowPitch).toBeGreaterThan(0);
  });
});

describe("slide packing", () => {
  it("puts the whole tree on the overview slide and the branches together", () => {
    const doc = docFrom(SAMPLE);
    const groups = packSlides(doc);
    expect(groups[0].nodeIds).toHaveLength(Object.keys(doc.nodes).length);
    expect(groups.length).toBeGreaterThanOrEqual(2);
    const branchGroups = groups.slice(1);
    expect(branchGroups.length).toBeLessThan(4);
    for (const group of branchGroups) {
      expect(group.includeRoot).toBe(true);
      expect(group.title.length).toBeGreaterThan(0);
    }
  });

  it("covers every node across the branch slides", () => {
    const doc = docFrom(SAMPLE);
    const groups = packSlides(doc, { overview: false });
    const covered = new Set(groups.flatMap((group) => group.nodeIds));
    for (const id of Object.keys(doc.nodes)) expect(covered.has(id)).toBe(true);
  });

  it("splits large trees into readable groups", () => {
    const branches = Array.from({ length: 8 }, (_, branchIndex) => {
      const leaves = Array.from({ length: 8 }, (_, leafIndex) => `    - Leaf ${branchIndex}-${leafIndex}?`).join("\n");
      return `  - Branch ${branchIndex}?\n${leaves}`;
    });
    const doc = docFrom(`- Root?\n${branches.join("\n")}`);
    expect(Object.keys(doc.nodes).length).toBe(73);
    const groups = packSlides(doc, { maxNodesPerSlide: 20, maxLeavesPerSlide: 8, maxDepth: 5 });
    for (const group of groups.slice(1)) {
      expect(group.nodeIds.length).toBeLessThanOrEqual(20);
    }
    expect(groups.length).toBeGreaterThan(2);
  });

  it("skips the overview when asked", () => {
    const branches = Array.from({ length: 8 }, (_, branchIndex) => {
      const leaves = Array.from({ length: 8 }, (_, leafIndex) => `    - Leaf ${branchIndex}-${leafIndex}?`).join("\n");
      return `  - Branch ${branchIndex}?\n${leaves}`;
    });
    const doc = docFrom(`- Root?\n${branches.join("\n")}`);
    const groups = packSlides(doc, { overview: false });
    expect(groups[0].nodeIds.length).toBeLessThan(Object.keys(doc.nodes).length);
  });

  it("returns no branch slides for a single-node tree", () => {
    const doc = docFrom("- Only root?");
    const groups = packSlides(doc);
    expect(groups).toHaveLength(1);
  });
});
