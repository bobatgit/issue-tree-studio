import { describe, expect, it } from "vitest";
import {
  buildDiagnostics,
  noteStripping,
  resetStripping,
  strippedThisSession,
  strippingNote,
  treeJsonFromDiagnostics,
  type DiagnosticsMeta,
} from "../model/diagnostics";
import { computeKeyMap } from "../model/keys";
import { parseMarkdown } from "../model/markdown";
import type { StrippedPrefix } from "../model/markdown";

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
    expect(text).toContain("items: 3 / 500, depth 2");
    expect(text).toContain("keys: length 5, promoted 0, collisions 0");
    expect(text).toContain("status: open 3, complete 0");
    expect(text).toContain("page: https://bobatgit.github.io/issue-tree-studio/");
  });

  it("embeds a tree that parses back", () => {
    const doc = sample();
    const text = buildDiagnostics(doc, computeKeyMap(doc), meta);
    const json = treeJsonFromDiagnostics(text);
    expect(json).not.toBeNull();
    const parsed = JSON.parse(json as string) as { name: string; items: Record<string, unknown>; version: number };
    expect(parsed.name).toBe("Test tree");
    expect(parsed.version).toBe(1);
    expect(Object.keys(parsed.items)).toHaveLength(3);
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

describe("the pasted-number report", () => {
  it("records nothing when the paste was already clean", () => {
    resetStripping();
    const parsed = parseMarkdown("- Why did profit fall?\n");
    noteStripping(parsed.stripped);
    expect(strippedThisSession()).toEqual([]);
    expect(buildDiagnostics(parsed.doc, computeKeyMap(parsed.doc), meta)).toContain(
      "pasted numbers removed this session: 0",
    );
  });

  it("names every removal, with the number the item received", () => {
    resetStripping();
    const parsed = parseMarkdown("- Root?\n  - a) Did revenue fall?\n  - 2. Did cost rise?\n");
    noteStripping(parsed.stripped);
    expect(strippedThisSession()).toEqual([
      "a) Did revenue fall?  ->  Q1 Did revenue fall?",
      "2. Did cost rise?  ->  Q2 Did cost rise?",
    ]);

    const text = buildDiagnostics(parsed.doc, computeKeyMap(parsed.doc), meta);
    expect(text).toContain("pasted numbers removed this session: 2");
    expect(text).toContain("<summary>Pasted numbers removed</summary>");
    expect(text).toContain("a) Did revenue fall?  ->  Q1 Did revenue fall?");
  });

  it("summarises two lines for the toast and counts the rest", () => {
    const entries: StrippedPrefix[] = [
      { pasted: "a) One?", prefix: "a)", number: "Q1", label: "One?" },
      { pasted: "b) Two?", prefix: "b)", number: "Q2", label: "Two?" },
      { pasted: "c) Three?", prefix: "c)", number: "Q3", label: "Three?" },
    ];
    expect(strippingNote(entries)).toContain("Cleaned 3 pasted numbers");
    expect(strippingNote(entries)).toContain("and 1 more");
    expect(strippingNote(entries)).toContain("Copy diagnostics");
  });
});
