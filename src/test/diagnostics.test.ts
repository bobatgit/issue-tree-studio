import { describe, expect, it } from "vitest";
import { buildDiagnostics, treeJsonFromDiagnostics, type DiagnosticsMeta } from "../model/diagnostics";
import { computeKeyMap } from "../model/keys";
import { parseMarkdown } from "../model/markdown";

const meta: DiagnosticsMeta = {
  appVersion: "0.2.0",
  buildSha: "c861e80",
  url: "https://bobatgit.github.io/issue-tree-studio/",
  userAgent: "vitest",
  viewport: "1440 × 900",
  now: new Date("2026-11-24T12:00:00Z"),
};

function sample() {
  return parseMarkdown(
    "- Why did profit fall?\n  - Did revenue fall?\n  - Did cost rise?\n",
    "Test tree",
  ).doc;
}

describe("diagnostics block", () => {
  it("names the build, the environment and the counts", () => {
    const doc = sample();
    const text = buildDiagnostics(doc, computeKeyMap(doc), meta);
    expect(text).toContain("### Issue Tree Studio diagnostics");
    expect(text).toContain("build: 0.2.0 (c861e80)");
    expect(text).toContain("2026-11-24T12:00:00.000Z");
    expect(text).toContain("nodes: 3 / 100, depth 2");
    expect(text).toContain("question 1, hypothesis 2, issue 0");
    expect(text).toContain("keys: length 4, promoted 0, collisions 0");
    expect(text).toContain("page: https://bobatgit.github.io/issue-tree-studio/");
  });

  it("embeds a tree that parses back", () => {
    const doc = sample();
    const text = buildDiagnostics(doc, computeKeyMap(doc), meta);
    const json = treeJsonFromDiagnostics(text);
    expect(json).not.toBeNull();
    const parsed = JSON.parse(json as string) as { name: string; nodes: Record<string, unknown>; version: number };
    expect(parsed.name).toBe("Test tree");
    expect(parsed.version).toBe(1);
    expect(Object.keys(parsed.nodes)).toHaveLength(3);
  });

  it("survives labels that contain markdown fences", () => {
    const doc = parseMarkdown("- Does ``` break the block?\n  - A?\n", "Odd tree").doc;
    const text = buildDiagnostics(doc, computeKeyMap(doc), meta);
    const json = treeJsonFromDiagnostics(text);
    expect(json).not.toBeNull();
    expect(JSON.parse(json as string)).toBeTruthy();
  });

  it("returns null when no tree block is present", () => {
    expect(treeJsonFromDiagnostics("just prose")).toBeNull();
  });
});
