/** Generic markdown nested-list import and export. */

import { itemNumbers, withNumber } from "./numbering";
import type { ItemStatus, TreeDoc } from "./types";
import { ITEM_CAP } from "./types";
import { buildDoc, flatten } from "./tree";

export interface OutlineParseResult {
  doc: TreeDoc;
  warnings: string[];
  /** Every pasted enumerator that was removed, with the number the item received. */
  stripped: StrippedPrefix[];
}

export interface StrippedPrefix {
  /** The wording as it was pasted. */
  pasted: string;
  /** The enumerator that was removed. */
  prefix: string;
  /** The number the item received, and the wording it kept. */
  number: string;
  label: string;
}

const LIST_LINE = /^([ \t]*)(?:[-*+]|\d{1,3}[.)])[ \t]+(.*)$/;
const HEADING_LINE = /^[ \t]{0,3}(#{1,6})[ \t]+(.*)$/;
const FENCE = /^[ \t]{0,3}(```|~~~)/;

/** Remove the markdown decoration that is not part of the item wording. */
export function cleanInline(raw: string): string {
  let text = raw;
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, "");
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  text = text.replace(/`([^`]+)`/g, "$1");
  text = text.replace(/(\*\*|__)(.*?)\1/g, "$2");
  text = text.replace(/(\*|_)([^*_\n]+)\1/g, "$2");
  text = text.replace(/~~(.*?)~~/g, "$1");
  text = text.replace(/<[^>]+>/g, "");
  text = text.replace(/\\([\\`*_{}[\]()#+\-.!])/g, "$1");
  text = text.replace(/[ \t]{2,}$/g, "");
  return text.replace(/\s+/g, " ").trim();
}

interface ListItem {
  indent: number;
  label: string;
  status: ItemStatus;
}

/**
 * The key, in the form the markdown view writes now: `{[2GK88]}` at the end of
 * the line. Read on shape alone and never on resolution, because a key is always
 * recomputed from the label and its path: an unresolvable token carries no
 * information, and must not be left inside the pasted wording as text.
 *
 * Two bracket pairs, because one pair can be produced by ordinary text. The key
 * alphabet is digits and every letter except I, L, O and U, so words like TREND,
 * CHART and RANGE are all valid key shapes.
 */
const TOKEN_OPEN = "{[";
const TOKEN_CLOSE = "]}";
/** Digits and every letter except I, L, O and U: the four a person mistypes. */
const KEY_SHAPE = /^[0-9A-HJKMNP-TV-Z]{3}-[0-9A-HJKMNP-TV-Z]{3,10}$/i;

/**
 * A pasted enumerator, the numbering an outline arrives carrying.
 *
 * The separator is what makes this safe. A bare number must be followed by a
 * space, or by a period or a bracket and then a space, and a letter run must
 * carry a period or a bracket. That keeps `2024 revenue`, `3-way split` and
 * `Q1 results` whole, while `1.`, `2)`, `(3)`, `[4]`, `Q2.4.1)`, `a)`, `(ii)`,
 * `#7` and a bullet are all dropped.
 *
 * Letters and roman numerals go whenever they appear, with no sequence check, so
 * `A. Smith owns the report` becomes `Smith owns the report`. That is deliberate:
 * the rule stays simple, and every removal is reported and visible in one step.
 */
const ENUMERATOR =
  /^(?:\(\d{1,3}(?:\.\d{1,3})*\)|\[\d{1,3}(?:\.\d{1,3})*\]|\d{1,3}(?:\.\d{1,3})*(?:\.|\)|\]|(?=[ \t]))|#\d{1,3}|Q\d+(?:\.\d+)*(?:\.|\))|[A-Za-z]{1,4}(?:\.|\))|\([A-Za-z]{1,4}\)|[•·‣–*+-])[ \t]+/;

/** Drop a trailing `{[KEY]}` token, whether or not it resolves. */
export function stripKeyToken(text: string): string {
  const trimmed = text.replace(/[ 	]+$/, "");
  if (!trimmed.endsWith(TOKEN_CLOSE)) return text;
  const start = trimmed.lastIndexOf(TOKEN_OPEN);
  if (start < 0) return text;
  const inner = trimmed.slice(start + TOKEN_OPEN.length, trimmed.length - TOKEN_CLOSE.length);
  if (!KEY_SHAPE.test(inner)) return text;
  return trimmed.slice(0, start).replace(/[ 	]+$/, "");
}

/** Split a pasted enumerator off the front of a wording. */
export function stripEnumerator(text: string): { label: string; prefix: string } {
  const match = ENUMERATOR.exec(text);
  if (!match) return { label: text, prefix: "" };
  return { label: text.slice(match[0].length), prefix: match[0].trim() };
}

/** One line of the report the markdown view shows after a paste that cleaned up. */
export function describeStripping(removal: StrippedPrefix): string {
  return `${removal.pasted}  ->  ${[removal.number, removal.label].filter(Boolean).join(" ")}`;
}

export function parseMarkdown(text: string, name = "Imported outline"): OutlineParseResult {
  const warnings: string[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");

  const items: ListItem[] = [];
  const removals: { pasted: string; prefix: string; index: number }[] = [];
  let title = "";
  let inFence = false;
  let inComment = false;
  let current: ListItem | null = null;
  let currentIndent = 0;

  for (const rawLine of lines) {
    if (inComment) {
      if (rawLine.includes("-->")) inComment = false;
      continue;
    }
    if (/^\s*<!--/.test(rawLine)) {
      if (!rawLine.includes("-->")) inComment = true;
      continue;
    }
    if (FENCE.test(rawLine)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    if (!rawLine.trim()) {
      current = null;
      continue;
    }

    const heading = HEADING_LINE.exec(rawLine);
    if (heading) {
      if (!title) title = cleanInline(heading[2]);
      current = null;
      continue;
    }

    const listMatch = LIST_LINE.exec(rawLine);
    if (listMatch) {
      const indentText = listMatch[1];
      const indent = indentText.replace(/\t/g, "    ").length;
      const raw = listMatch[2];
      const task = /^\[([ xX])\][ \t]+/.exec(raw);
      const status: ItemStatus = task && task[1].toLowerCase() === "x" ? "complete" : "open";
      const body = task ? raw.slice(task[0].length) : raw;
      const pasted = cleanInline(stripKeyToken(body));
      const { label: withoutPrefix, prefix } = stripEnumerator(pasted);
      const label = cleanInline(withoutPrefix);
      if (prefix) removals.push({ pasted, prefix, index: items.length });
      if (!label) {
        warnings.push("Skipped an empty list item.");
        continue;
      }
      const item: ListItem = { indent, label, status };
      items.push(item);
      current = item;
      currentIndent = indent;
      continue;
    }

    // A wrapped continuation line of the previous list item.
    if (current) {
      const indent = rawLine.replace(/\t/g, "    ").match(/^ */)?.[0].length ?? 0;
      if (indent > currentIndent) {
        const extra = cleanInline(rawLine);
        if (extra) current.label = `${current.label} ${extra}`.trim();
        continue;
      }
    }
    current = null;
  }

  if (items.length === 0) {
    const fallback = title || "Root question";
    return {
      doc: buildDoc(name, [{ label: fallback, depth: 1 }]),
      warnings: ["No list items found. Started a new tree with a single root item."],
      stripped: [],
    };
  }

  const capped = items.slice(0, ITEM_CAP);
  if (items.length > ITEM_CAP) {
    warnings.push(
      `Outline had ${items.length} items. Kept the first ${ITEM_CAP} to stay inside the ${ITEM_CAP}-item cap.`,
    );
  }

  const stack: number[] = [];
  const flat: { label: string; depth: number; status: ItemStatus }[] = [];
  for (const item of capped) {
    while (stack.length > 0 && stack[stack.length - 1] >= item.indent) stack.pop();
    stack.push(item.indent);
    flat.push({ label: item.label, depth: stack.length, status: item.status });
  }

  const topLevel = flat.filter((entry) => entry.depth === 1).length;
  if (topLevel > 1) {
    warnings.push(
      `Found ${topLevel} top-level items. Added a shared root so the outline forms one tree; rename it to your root question.`,
    );
  }

  const doc = buildDoc(name, flat, { syntheticRoot: title || "Root question" });

  // The report names each item by the number it received. A number is derived
  // from position, so it is read from the built document rather than guessed.
  const entries = flatten(doc);
  const offset = entries.length - flat.length;
  const numbers = itemNumbers(doc);
  const stripped: StrippedPrefix[] = removals
    .filter((removal) => removal.index < flat.length)
    .map((removal) => {
      const entry = entries[removal.index + offset];
      return {
        pasted: removal.pasted,
        prefix: removal.prefix,
        number: entry ? numbers[entry.item.id] ?? "" : "",
        label: entry ? entry.item.label : "",
      };
    });

  return { doc, warnings, stripped };
}

/**
 * Export as a generic nested list that the importer can read back.
 *
 * No heading: the tree is a plain list and the root is its first line, so the
 * reading order is the order of the argument. Each line carries its number, then
 * its wording, then its key inside curly and square brackets when keys are shown.
 */
export function toMarkdown(
  doc: TreeDoc,
  version = doc.version,
  options: { keys?: (id: string) => string } = {},
): string {
  const flat = flatten(doc);
  const numbers = itemNumbers(doc);
  const stamp = new Date().toISOString().slice(0, 19).replace("T", " ");
  const lines = [`<!-- issue-tree-studio v${version} · ${stamp} -->`, ""];
  for (const entry of flat) {
    const box = entry.item.status === "complete" ? "x" : " ";
    const number = numbers[entry.item.id] ?? "";
    const key = options.keys ? options.keys(entry.item.id) : "";
    const label = withNumber(number, entry.item.label || "Untitled item");
    lines.push(`${"  ".repeat(Math.max(0, entry.depth - 1))}- [${box}] ${label}${key ? ` {[${key}]}` : ""}`);
  }
  return `${lines.join("\n")}\n`;
}
