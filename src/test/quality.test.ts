import { describe, expect, it } from "vitest";
import { computeKeyMap } from "../model/keys";
import { parseMarkdown } from "../model/markdown";
import { findingCounts, overlapScore, reviewTree } from "../model/quality";
import { createDoc, setType } from "../model/tree";
import { generateTree } from "./testUtils";

function review(markdown: string) {
  const doc = parseMarkdown(markdown, "Quality test").doc;
  const findings = reviewTree(doc, computeKeyMap(doc));
  return { doc, findings, codes: findings.map((finding) => finding.code) };
}

describe("quality checks", () => {
  it("flags two siblings with the same wording", () => {
    const result = review("- Root?\n  - Other?\n  - Other?\n");
    expect(result.codes).toContain("DUPLICATE_SIBLING");
    expect(result.findings.find((finding) => finding.code === "DUPLICATE_SIBLING")?.level).toBe("error");
  });

  it("flags siblings that share most of their wording", () => {
    const result = review(
      "- Root?\n  - Did raw material input prices rise?\n  - Did raw material input prices increase?\n",
    );
    expect(result.codes).toContain("OVERLAP_SIBLING");
  });

  it("flags a root that is a topic rather than a question", () => {
    const result = review("- Profit decline\n  - A?\n  - B?\n");
    expect(result.codes).toContain("ROOT_NOT_QUESTION");
  });

  it("flags a node with one child", () => {
    const result = review("- Root?\n  - Only branch?\n");
    expect(result.codes).toContain("SINGLE_CHILD");
  });

  it("flags a hypothesis that has children", () => {
    const doc = parseMarkdown("- Root?\n  - Group?\n    - Leaf?\n").doc;
    const groupId = Object.values(doc.nodes).find((node) => node.label === "Group?")?.id as string;
    const typed = setType(doc, groupId, "hypothesis");
    const codes = reviewTree(typed, computeKeyMap(typed)).map((finding) => finding.code);
    expect(codes).toContain("HYPOTHESIS_WITH_CHILDREN");
  });

  it("flags an empty label", () => {
    const doc = createDoc("Root?");
    const rootId = doc.rootId as string;
    const withBlank = {
      ...doc,
      nodes: {
        ...doc.nodes,
        blank: { id: "blank", label: "   ", type: "hypothesis" as const, children: [] },
        [rootId]: { ...doc.nodes[rootId], children: ["blank"] },
      },
    };
    const codes = reviewTree(withBlank, computeKeyMap(withBlank)).map((finding) => finding.code);
    expect(codes).toContain("EMPTY_LABEL");
  });

  it("notes uneven depth", () => {
    const result = review(`- Root?
  - Deep?
    - Deeper?
      - Deepest?
        - End?
  - Shallow?
`);
    expect(result.codes).toContain("DEPTH_IMBALANCE");
  });

  it("reports no errors for a clean split", () => {
    const result = review("- Why did profit fall?\n  - Did revenue fall?\n  - Did cost rise?\n");
    expect(result.findings.filter((finding) => finding.level === "error")).toHaveLength(0);
  });

  it("stops at the node cap and says so", () => {
    const lines = ["- Root?", ...Array.from({ length: 120 }, (_, index) => `  - Item ${index}?`)];
    const result = review(lines.join("\n"));
    expect(result.codes).toContain("NODE_COUNT_CAP");
  });

  it("counts findings by severity", () => {
    const counts = findingCounts(review("- Root?\n  - Other?\n  - Other?\n").findings);
    expect(counts.error).toBeGreaterThan(0);
    expect(counts.error + counts.warn + counts.info).toBeGreaterThan(0);
  });

  it("scores wording overlap sensibly", () => {
    expect(overlapScore("price fell", "price fell")).toBe(1);
    expect(overlapScore("price fell", "volume rose")).toBe(0);
    expect(overlapScore("input prices rose", "input prices increased")).toBeCloseTo(0.5, 5);
  });

  it("generates distinct keys for a large tree", () => {
    const doc = generateTree(60);
    const keys = Object.values(computeKeyMap(doc).byNode).map((info) => info.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
