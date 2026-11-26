/**
 * Pasted numbering.
 *
 * An outline pasted from a document, a ticket or another tool arrives carrying
 * its own numbering. If it stays, it doubles up with the number we derive and it
 * changes the key hash, so `1. Revenue` and `Revenue` would be two different
 * items with two different keys.
 */

import { describe, expect, it } from "vitest";
import { computeKeyMap } from "../model/keys";
import { describeStripping, parseMarkdown, stripEnumerator } from "../model/markdown";
import { flatten } from "../model/tree";
import type { TreeDoc } from "../model/types";

/** Every recognised enumerator, and the wording it leaves behind. */
const STRIPPED: [string, string][] = [
  ["1. Revenue?", "Revenue?"],
  ["2) Revenue?", "Revenue?"],
  ["(3) Revenue?", "Revenue?"],
  ["[4] Revenue?", "Revenue?"],
  ["1.1. Revenue?", "Revenue?"],
  ["1.1.1. Revenue?", "Revenue?"],
  ["Q1. Revenue?", "Revenue?"],
  ["Q2.1. Revenue?", "Revenue?"],
  ["Q2.4.1) Revenue?", "Revenue?"],
  ["#7 Revenue?", "Revenue?"],
  ["a. Revenue?", "Revenue?"],
  ["b) Revenue?", "Revenue?"],
  ["(c) Revenue?", "Revenue?"],
  ["A. Smith owns the report", "Smith owns the report"],
  ["i. Introduction", "Introduction"],
  ["ii. Introduction", "Introduction"],
  ["(iii) Introduction", "Introduction"],
  ["• Revenue?", "Revenue?"],
  ["· Revenue?", "Revenue?"],
  ["‣ Revenue?", "Revenue?"],
  ["– Revenue?", "Revenue?"],
];

/** Wording that must survive untouched: no separator, or a bracket inside it. */
const KEPT = [
  "2024 revenue fell 3%",
  "3-way split",
  "Q1 results",
  "(a+b) Revenue?",
  "Did the (a) cohort grow?",
  "Why did profit fall 20% year over year?",
];

function labels(doc: TreeDoc): string[] {
  return Object.values(doc.items).map((item) => item.label);
}

describe("pasted numbering", () => {
  it.each(STRIPPED)("strips %s", (pasted, expected) => {
    expect(stripEnumerator(pasted).label).toBe(expected);
  });

  it.each(KEPT)("keeps %s whole", (wording) => {
    expect(stripEnumerator(wording).label).toBe(wording);
  });

  it("reports the enumerator it removed", () => {
    expect(stripEnumerator("1.1. Revenue?").prefix).toBe("1.1.");
  });

  it("strips the prefix before the label is stored, so it never reaches the hash", () => {
    const doc = parseMarkdown("- 1. Revenue?\n").doc;
    expect(labels(doc)).toEqual(["Revenue?"]);
  });

  it("gives a pasted number the same key as no number at all", () => {
    const pasted = computeKeyMap(parseMarkdown("- 1. Revenue?\n").doc);
    const plain = computeKeyMap(parseMarkdown("- Revenue?\n").doc);
    const onlyKey = (map: typeof pasted) => map.byItem[Object.keys(map.byItem)[0]].key;
    expect(onlyKey(pasted)).toBe(onlyKey(plain));
  });

  it("names each removal with the number the item received", () => {
    const result = parseMarkdown("- Root?\n  - a) Did revenue fall?\n  - b) Did cost rise?\n");
    expect(result.stripped.map(describeStripping)).toEqual([
      "a) Did revenue fall?  ->  Q1 Did revenue fall?",
      "b) Did cost rise?  ->  Q2 Did cost rise?",
    ]);
  });

  it("reports nothing when the pasted labels were already clean", () => {
    const result = parseMarkdown("- Root?\n  - Did revenue fall?\n");
    expect(result.stripped).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("keeps the depth the indentation decided", () => {
    const doc = parseMarkdown("- Root?\n  - 1. Child?\n    - 2. Grandchild?\n").doc;
    expect(flatten(doc).map((entry) => entry.depth)).toEqual([1, 2, 3]);
    expect(labels(doc)).toEqual(["Root?", "Child?", "Grandchild?"]);
  });
});
