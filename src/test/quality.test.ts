import { describe, expect, it } from "vitest";
import { computeKeyMap } from "../model/keys";
import { parseMarkdown } from "../model/markdown";
import { findingCounts, overlapScore, reviewTree } from "../model/quality";
import { buildDoc, createDoc } from "../model/tree";
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

  it("flags an item with one child", () => {
    const result = review("- Root?\n  - Only branch?\n");
    expect(result.codes).toContain("SINGLE_CHILD");
  });

  it("flags an empty label", () => {
    const doc = createDoc("Root?");
    const rootId = doc.rootId as string;
    const withBlank = {
      ...doc,
      items: {
        ...doc.items,
        blank: { id: "blank", label: "   ", status: "open" as const, children: [] },
        [rootId]: { ...doc.items[rootId], children: ["blank"] },
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

  it("nudges past the soft cap and stops at the hard cap", () => {
    const nudge = review(
      ["- Root?", ...Array.from({ length: 120 }, (_, index) => `  - Item ${index}?`)].join("\n"),
    );
    expect(nudge.codes).toContain("ITEM_COUNT_HIGH");
    expect(nudge.codes).not.toContain("ITEM_COUNT_CAP");

    const capped = review(
      ["- Root?", ...Array.from({ length: 520 }, (_, index) => `  - Item ${index}?`)].join("\n"),
    );
    expect(capped.codes).toContain("ITEM_COUNT_CAP");
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
    const keys = Object.values(computeKeyMap(doc).byItem).map((info) => info.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("status checks", () => {
  it("warns when a complete item still has an open child", () => {
    const doc = parseMarkdown("- Root?\n  - Child?\n").doc;
    doc.items[doc.rootId as string].status = "complete";
    const codes = reviewTree(doc, computeKeyMap(doc)).map((finding) => finding.code);
    expect(codes).toContain("COMPLETE_WITH_OPEN_CHILD");
  });

  it("stays quiet when the whole branch is complete", () => {
    const doc = parseMarkdown("- Root?\n  - Child?\n").doc;
    for (const item of Object.values(doc.items)) item.status = "complete";
    const codes = reviewTree(doc, computeKeyMap(doc)).map((finding) => finding.code);
    expect(codes).not.toContain("COMPLETE_WITH_OPEN_CHILD");
  });
});

describe("a wide sibling group", () => {
  const wide = (count: number, same = false) => {
    const items = [{ label: "Root?", depth: 1 }];
    for (let index = 0; index < count; index += 1) {
      items.push({ label: same ? "Same wording?" : `Did branch ${index + 1} move?`, depth: 2 });
    }
    const doc = buildDoc("Wide", items);
    return reviewTree(doc, computeKeyMap(doc));
  };

  it("reports one overlap finding for the group, not one per pair", () => {
    const overlaps = wide(120).filter((finding) => finding.code === "OVERLAP_SIBLING");
    expect(overlaps).toHaveLength(1);
    // Every child of the root overlaps with every other, so all 120 are in the group.
expect(overlaps[0].detail).toContain("120 branches");
  });

  it("reports one duplicate finding for the group, naming how many are involved", () => {
    const duplicates = wide(120, true).filter((finding) => finding.code === "DUPLICATE_SIBLING");
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].title).toContain("120 branches");
    expect(duplicates[0].level).toBe("error");
  });

  it("keeps the number of findings bounded as the group grows", () => {
    // Before grouping this grew quadratically: 120 similar siblings produced 6,786.
    const total = (count: number): number => wide(count).length;
    expect(total(120)).toBeLessThan(total(10) + 10);
  });

  it("still names the two branches it is talking about", () => {
    const overlaps = wide(4).filter((finding) => finding.code === "OVERLAP_SIBLING");
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0].detail).toContain("Did branch 1 move?");
    expect(overlaps[0].itemId).toBeTruthy();
  });

  it("says nothing about a parent whose branches are distinct", () => {
    const doc = buildDoc("Distinct", [
      { label: "Root?", depth: 1 },
      { label: "Did revenue fall?", depth: 2 },
      { label: "Did cost rise?", depth: 2 },
      { label: "Did the mix shift?", depth: 2 },
    ]);
    const codes = reviewTree(doc, computeKeyMap(doc)).map((finding) => finding.code);
    expect(codes).not.toContain("OVERLAP_SIBLING");
    expect(codes).not.toContain("DUPLICATE_SIBLING");
  });
});
