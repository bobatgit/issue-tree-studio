/** Generic markdown nested-list import and export. */

import type { NodeStatus, TreeDoc } from "./types";
import { NODE_CAP } from "./types";
import { buildDoc, flatten, titleOf } from "./tree";

export interface OutlineParseResult {
  doc: TreeDoc;
  warnings: string[];
}

const LIST_LINE = /^([ \t]*)(?:[-*+]|\d{1,3}[.)])[ \t]+(.*)$/;
const HEADING_LINE = /^[ \t]{0,3}(#{1,6})[ \t]+(.*)$/;
const FENCE = /^[ \t]{0,3}(```|~~~)/;

/** Remove the markdown decoration that is not part of the node wording. */
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
  status: NodeStatus;
}

/**
 * A leading key, in the form the in-app markdown view writes it: "K7M2 · Label".
 * The middle dot (or two spaces) is required, so a label that happens to start
 * with four capital letters is never mistaken for a key.
 */
const KEY_PREFIX = /^[0-9A-HJKMNP-TV-Z]{4,5}(?: · | {2,})(.+)$/;

export function stripKeyPrefix(text: string): string {
  const match = KEY_PREFIX.exec(text.trim());
  return match ? match[1] : text;
}

export function parseMarkdown(text: string, name = "Imported outline"): OutlineParseResult {
  const warnings: string[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");

  const items: ListItem[] = [];
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
      const status: NodeStatus = task && task[1].toLowerCase() === "x" ? "complete" : "open";
      const body = task ? raw.slice(task[0].length) : raw;
      const label = cleanInline(stripKeyPrefix(body));
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
      warnings: ["No list items found. Started a new tree with a single root node."],
    };
  }

  const capped = items.slice(0, NODE_CAP);
  if (items.length > NODE_CAP) {
    warnings.push(
      `Outline had ${items.length} items. Kept the first ${NODE_CAP} to stay inside the 100-node cap.`,
    );
  }

  const stack: number[] = [];
  const flat: { label: string; depth: number; status: NodeStatus }[] = [];
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
  return { doc, warnings };
}

/** Export as a generic nested list that the importer can read back. */
export function toMarkdown(
  doc: TreeDoc,
  version = doc.version,
  options: { keys?: (id: string) => string } = {},
): string {
  const flat = flatten(doc);
  const stamp = new Date().toISOString().slice(0, 19).replace("T", " ");
  const lines = [`<!-- issue-tree-studio v${version} · ${stamp} -->`, ""];
  const heading = titleOf(doc);
  if (heading) {
    lines.push(`# ${heading}`, "");
  }
  for (const entry of flat) {
    const box = entry.node.status === "complete" ? "x" : " ";
    const prefix = options.keys ? `${options.keys(entry.node.id)} · ` : "";
    lines.push(`${"  ".repeat(Math.max(0, entry.depth - 1))}- [${box}] ${prefix}${entry.node.label || "Untitled node"}`);
  }
  return `${lines.join("\n")}\n`;
}
