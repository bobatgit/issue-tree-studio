import { describe, expect, it } from "vitest";
import { cleanInline, parseMarkdown, toMarkdown } from "../model/markdown";
import { countNodes, flatten } from "../model/tree";

const shape = (doc: ReturnType<typeof parseMarkdown>["doc"]): string[] =>
  flatten(doc).map((entry) => `${"·".repeat(entry.depth - 1)}${entry.node.label}`);

describe("markdown import", () => {
  it("reads dash, star, plus and numbered lists", () => {
    const dash = parseMarkdown("- Root?\n  - A?\n  - B?\n").doc;
    const star = parseMarkdown("* Root?\n  * A?\n  * B?\n").doc;
    const plus = parseMarkdown("+ Root?\n  + A?\n  + B?\n").doc;
    const numbered = parseMarkdown("1. Root?\n   1. A?\n   2. B?\n").doc;
    for (const doc of [dash, star, plus, numbered]) {
      expect(shape(doc)).toEqual(["Root?", "·A?", "·B?"]);
    }
  });

  it("reads tab indentation and skipped levels", () => {
    const doc = parseMarkdown("- Root?\n\t- A?\n\t\t- A1?\n").doc;
    expect(shape(doc)).toEqual(["Root?", "·A?", "··A1?"]);
    const skipped = parseMarkdown("- Root?\n      - Deep?\n").doc;
    expect(shape(skipped)).toEqual(["Root?", "·Deep?"]);
  });

  it("strips inline markdown decoration from labels", () => {
    expect(cleanInline("**Price** [fell](https://example.com) `20%`")).toBe("Price fell 20%");
    expect(cleanInline("_Volume_ grew <b>fast</b>")).toBe("Volume grew fast");
    expect(cleanInline("Keep * literal")).toBe("Keep * literal");
  });

  it("joins wrapped continuation lines", () => {
    const doc = parseMarkdown("- Why did profit fall by twenty\n  percent year over year?\n  - A?\n").doc;
    expect(shape(doc)[0]).toBe("Why did profit fall by twenty percent year over year?");
  });

  it("creates a shared root when several top-level items exist", () => {
    const result = parseMarkdown("# Profit\n- A?\n- B?\n", "Tree");
    expect(result.warnings.join(" ")).toContain("shared root");
    expect(shape(result.doc)).toEqual(["Profit", "·A?", "·B?"]);
  });

  it("keeps a single top-level item as the root", () => {
    const doc = parseMarkdown("# Profit\n- Root?\n  - A?\n").doc;
    expect(shape(doc)).toEqual(["Root?", "·A?"]);
  });

  it("enforces the 100-node cap", () => {
    const lines = ["- Root?", ...Array.from({ length: 150 }, (_, index) => `  - Item ${index}?`)];
    const result = parseMarkdown(lines.join("\n"));
    expect(countNodes(result.doc)).toBe(100);
    expect(result.warnings.join(" ")).toContain("100");
  });

  it("starts a single-root tree when no list exists", () => {
    const result = parseMarkdown("# Only a heading");
    expect(countNodes(result.doc)).toBe(1);
    expect(result.warnings).toHaveLength(1);
  });

  it("leaves group nodes as questions and ends as hypotheses", () => {
    const doc = parseMarkdown("- Root?\n  - Group?\n    - Leaf?\n").doc;
    const nodes = Object.values(doc.nodes);
    expect(nodes.find((node) => node.label === "Root?")?.type).toBe("question");
    expect(nodes.find((node) => node.label === "Group?")?.type).toBe("question");
    expect(nodes.find((node) => node.label === "Leaf?")?.type).toBe("hypothesis");
  });
});

describe("markdown export", () => {
  it("round-trips structure and wording", () => {
    const original = parseMarkdown("- Why did profit fall?\n  - Did revenue fall?\n    - Did price fall?\n  - Did cost rise?\n").doc;
    const exported = toMarkdown(original);
    const reimported = parseMarkdown(exported, original.name).doc;
    expect(shape(reimported)).toEqual(shape(original));
    expect(exported).toContain("<!-- issue-tree-studio v");
  });

  it("escapes nothing that the importer would mangle", () => {
    const doc = parseMarkdown("- Root?\n  - Price: 20% (net)?\n").doc;
    const again = parseMarkdown(toMarkdown(doc)).doc;
    expect(shape(again)).toEqual(shape(doc));
  });
});
