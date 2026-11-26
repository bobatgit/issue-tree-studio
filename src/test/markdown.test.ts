import { describe, expect, it } from "vitest";
import { cleanInline, parseMarkdown, toMarkdown } from "../model/markdown";
import { computeKeyMap } from "../model/keys";
import { countItems, flatten } from "../model/tree";

const shape = (doc: ReturnType<typeof parseMarkdown>["doc"]): string[] =>
  flatten(doc).map((entry) => `${"·".repeat(entry.depth - 1)}${entry.item.label}`);

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

  it("enforces the 500-item cap", () => {
    const lines = ["- Root?", ...Array.from({ length: 600 }, (_, index) => `  - Item ${index}?`)];
    const result = parseMarkdown(lines.join("\n"));
    expect(countItems(result.doc)).toBe(500);
    expect(result.warnings.join(" ")).toContain("500");
  });

  it("starts a single-root tree when no list exists", () => {
    const result = parseMarkdown("# Only a heading");
    expect(countItems(result.doc)).toBe(1);
    expect(result.warnings).toHaveLength(1);
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

describe("markdown status", () => {
  it("reads task-list checkboxes and writes them back", () => {
    const doc = parseMarkdown("- Root?\n  - [x] Done?\n  - [ ] Still open?\n").doc;
    const byLabel = (label: string) => Object.values(doc.items).find((item) => item.label === label);
    expect(byLabel("Root?")?.status).toBe("open");
    expect(byLabel("Done?")?.status).toBe("complete");
    expect(byLabel("Still open?")?.status).toBe("open");

    const md = toMarkdown(doc);
    expect(md).toContain("- [ ] Q0. Root?");
    expect(md).toContain("  - [x] Q1. Done?");
    expect(md).toContain("  - [ ] Q2. Still open?");
  });

  it("no longer strips a key prefix an older release wrote", () => {
    // Version compatibility is not a concern, so the old shape stays as wording.
    const doc = parseMarkdown("- K7M2 · Root?\n  - B8YV · Child?\n").doc;
    expect(shape(doc)).toEqual(["K7M2 · Root?", "·B8YV · Child?"]);
  });
});

/** The text without the version stamp, which carries a timestamp by design. */
const withoutStamp = (md: string): string =>
  md
    .split("\n")
    .filter((line) => !line.startsWith("<!--"))
    .join("\n");

describe("the number, the key and no heading", () => {
  it("writes the number, then the wording, then the key at the end", () => {
    const doc = parseMarkdown("- Root?\n  - Did revenue fall?\n").doc;
    const keys = computeKeyMap(doc);
    const md = toMarkdown(doc, 1, { keys: (id) => keys.byItem[id].key });
    const order = flatten(doc).map((entry) => entry.item.id);
    const lines = withoutStamp(md).trim().split("\n");
    expect(lines[0]).toBe(`- [ ] Q0. Root? {[${keys.byItem[order[0]].key}]}`);
    expect(lines[1]).toBe(`  - [ ] Q1. Did revenue fall? {[${keys.byItem[order[1]].key}]}`);
  });

  it("writes no heading, so the root is the first list line", () => {
    const doc = parseMarkdown("# Why did profit fall?\n\n- Why did profit fall?\n  - Did revenue fall?\n").doc;
    const md = toMarkdown(doc);
    expect(md).not.toContain("# ");
    expect(withoutStamp(md).trim().split("\n")[0]).toBe("- [ ] Q0. Why did profit fall?");
  });

  it("round-trips byte for byte apart from the stamp", () => {
    const original = parseMarkdown(
      "- Why did profit fall?\n  - Did revenue fall?\n    - Did price fall?\n  - Did cost rise?\n",
    ).doc;
    const first = computeKeyMap(original);
    const once = toMarkdown(original, 1, { keys: (id) => first.byItem[id].key });
    const reimported = parseMarkdown(once, original.name).doc;
    const second = computeKeyMap(reimported);
    const again = toMarkdown(reimported, 1, { keys: (id) => second.byItem[id].key });
    expect(withoutStamp(again)).toBe(withoutStamp(once));
  });

  it("drops a trailing key token whether or not it resolves", () => {
    const resolves = parseMarkdown("- Root? {[2GK-882]}\n").doc;
    const doesNot = parseMarkdown("- Root? {[ZZZ-ZZZ]}\n").doc;
    expect(Object.values(resolves.items)[0].label).toBe("Root?");
    expect(Object.values(doesNot.items)[0].label).toBe("Root?");

    // The undashed five-character form is no longer a key, so it stays as wording.
    const older = parseMarkdown("- Root? {[2GK88]}\n").doc;
    expect(Object.values(older.items)[0].label).toBe("Root? {[2GK88]}");
  });

  it("keeps a key-shaped word in single brackets", () => {
    const doc = parseMarkdown("- Did the trend move? [TREND]\n").doc;
    expect(Object.values(doc.items)[0].label).toBe("Did the trend move? [TREND]");
  });

  it("drops a key token on a line that also carries a pasted number", () => {
    const result = parseMarkdown("- Root? {[2GK-882]}\n  - a) Child? {[ABC-DEF]}\n");
    expect(shape(result.doc)).toEqual(["Root?", "·Child?"]);
    expect(result.stripped.map((entry) => entry.prefix)).toEqual(["a)"]);
  });
});
