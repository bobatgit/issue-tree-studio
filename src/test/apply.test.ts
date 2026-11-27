import { describe, expect, it } from "vitest";
import { describeApply, hasChanges, mergeParsed, previewApply } from "../model/apply";
import { parseMarkdown, toMarkdown } from "../model/markdown";
import { countItems } from "../model/tree";
import { ITEM_CAP } from "../model/types";

const base = () => parseMarkdown("- Root?\n  - A?\n  - B?\n").doc;

describe("apply markdown", () => {
  it("keeps an item's identity, and takes the status from the outline", () => {
    const current = base();
    const a = Object.values(current.items).find((item) => item.label === "A?") as { id: string };

    const merged = mergeParsed(current, parseMarkdown("- Root?\n  - [x] A?\n  - B?\n  - C?\n").doc);
    const mergedA = Object.values(merged.items).find((item) => item.label === "A?");
    expect(mergedA?.id).toBe(a.id);
    expect(mergedA?.status).toBe("complete");
    expect(countItems(merged)).toBe(4);
  });

  it("reports additions and renames", () => {
    const current = base();
    const merged = mergeParsed(current, parseMarkdown("- Root?\n  - A2?\n  - B?\n  - C?\n").doc);
    const preview = previewApply(current, merged, ITEM_CAP);
    expect(preview.added).toBe(1);
    expect(preview.relabelled).toBe(1);
    expect(preview.overCap).toBe(false);
    expect(describeApply(preview)).toContain("renamed");
    expect(hasChanges(preview)).toBe(true);
  });

  it("round-trips its own export without changes", () => {
    const current = base();
    const merged = mergeParsed(current, parseMarkdown(toMarkdown(current), "round trip").doc);
    const preview = previewApply(current, merged, ITEM_CAP);
    expect(preview.total).toBe(countItems(current));
    expect(hasChanges(preview)).toBe(false);
  });

  it("flags an outline above the cap", () => {
    const current = base();
    const lines = ["- Root?"];
    for (let i = 0; i < ITEM_CAP; i += 1) lines.push(`  - Branch ${i}?`);
    const merged = mergeParsed(current, parseMarkdown(lines.join("\n")).doc);
    expect(previewApply(current, merged, 2).overCap).toBe(true);
  });
});
