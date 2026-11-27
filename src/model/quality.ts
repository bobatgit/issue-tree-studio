/**
 * Deterministic quality checks. No model is involved: every finding
 * can be reproduced from the tree alone.
 */

import type { KeyMap, TreeDoc } from "./types";
import { ITEM_CAP, SOFT_CAP } from "./types";
import { flatten, subtreeIds } from "./tree";

export type FindingLevel = "error" | "warn" | "info";

export interface Finding {
  id: string;
  code: string;
  level: FindingLevel;
  itemId?: string;
  title: string;
  detail: string;
}

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "by", "with", "is", "are", "was",
  "were", "be", "been", "did", "does", "do", "has", "have", "had", "we", "our", "it", "its", "this",
  "that", "from", "at", "as", "if", "than", "then", "why", "how", "what", "which", "who", "when",
  "where", "should", "could", "can", "will", "would",
]);

export function tokens(label: string): string[] {
  return label
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

export function overlapScore(a: string, b: string): number {
  const setA = new Set(tokens(a));
  const setB = new Set(tokens(b));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) if (setB.has(token)) intersection += 1;
  return intersection / (setA.size + setB.size - intersection);
}

const QUESTION_WORDS = /^(why|how|what|which|who|when|where|should|can|could|would|will|is|are|did|does|do)\b/i;

export function looksLikeQuestion(label: string): boolean {
  return label.includes("?") || QUESTION_WORDS.test(label.trim());
}

export function reviewTree(doc: TreeDoc, keyMap: KeyMap): Finding[] {
  const findings: Finding[] = [];
  const flat = flatten(doc);
  const push = (
    code: string,
    level: FindingLevel,
    title: string,
    detail: string,
    itemId?: string,
  ): void => {
    findings.push({ id: `${code}:${itemId ?? "tree"}:${findings.length}`, code, level, title, detail, itemId });
  };

  if (!doc.rootId || !doc.items[doc.rootId]) {
    push("NO_ROOT", "error", "The tree has no root", "Add a root question to start the tree.");
  } else {
    const root = doc.items[doc.rootId];
    if (!root.label.trim()) {
      push("EMPTY_LABEL", "error", "The root has no label", "Write the root as a precise question.", root.id);
    } else if (!looksLikeQuestion(root.label)) {
      push(
        "ROOT_NOT_QUESTION",
        "warn",
        "The root does not read as a question",
        `"${root.label}" names a topic. Name the decision, the metric and the time frame, e.g. "Why did profit fall 20% year over year?"`,
        root.id,
      );
    }
    if (root.children.length === 0) {
      push("ROOT_NO_BRANCHES", "warn", "The root is not split", "Add 2-5 branches that together cover the whole question.", root.id);
    }
    if (root.children.length === 1) {
      push("SINGLE_CHILD", "warn", "The root has only one branch", "One branch does not divide the problem.", root.id);
    }
  }

  const singleChild: string[] = [];
  for (const entry of flat) {
    const { item } = entry;
    if (!item.label.trim()) {
      push("EMPTY_LABEL", "error", "An item has no label", "Fill in the wording or delete the item.", item.id);
    }
    if (item.label.length > 140) {
      push(
        "LONG_LABEL",
        "warn",
        "A label is long for a slide",
        `${item.label.length} characters. Aim for under 90 so the box stays readable.`,
        item.id,
      );
    }
    if (item.status === "complete") {
      const openChild = item.children.map((childId) => doc.items[childId]).find((child) => child && child.status !== "complete");
      if (openChild) {
        push(
          "COMPLETE_WITH_OPEN_CHILD",
          "warn",
          "A complete item has an open child",
          `"${item.label}" is complete, but "${openChild.label}" is still open. Finish it, reopen the parent, or accept the gap.`,
          item.id,
        );
      }
    }

    if (item.children.length === 1) singleChild.push(item.id);

    // One finding per parent per kind, not one per pair. A parent with n branches
    // has n(n-1)/2 pairs, so a pairwise report grows quadratically and buries the
    // panel it exists to fill: 117 similar siblings produced 6,786 findings.
    const duplicated = new Set<string>();
    const overlapping = new Set<string>();
    let duplicatePair: [string, string] | null = null;
    let overlapPair: [string, string] | null = null;

    for (let i = 0; i < item.children.length; i += 1) {
      const childA = doc.items[item.children[i]];
      if (!childA) continue;
      for (let j = i + 1; j < item.children.length; j += 1) {
        const childB = doc.items[item.children[j]];
        if (!childB) continue;
        const normalA = childA.label.trim().toLowerCase();
        const normalB = childB.label.trim().toLowerCase();
        if (normalA && normalA === normalB) {
          duplicated.add(childA.id);
          duplicated.add(childB.id);
          duplicatePair ??= [childA.label, childB.label];
          continue;
        }
        if (overlapScore(childA.label, childB.label) >= 0.6) {
          overlapping.add(childA.id);
          overlapping.add(childB.id);
          overlapPair ??= [childA.label, childB.label];
        }
      }
    }

    if (duplicated.size > 1) {
      const [first] = [...duplicated];
      push(
        "DUPLICATE_SIBLING",
        "error",
        duplicated.size === 2
          ? "Two branches say the same thing"
          : `${duplicated.size} branches say the same thing`,
        duplicatePair
          ? `"${duplicatePair[0]}" is repeated under the same parent. Only one can be true; merge or reword.`
          : "The same wording is repeated under one parent. Merge or reword it.",
        first,
      );
    }

    if (overlapping.size > 1) {
      const [first] = [...overlapping];
      push(
        "OVERLAP_SIBLING",
        "warn",
        "Siblings may overlap",
        overlapPair
          ? `${overlapping.size} branches share most of their wording, for example "${overlapPair[0]}" and "${overlapPair[1]}". Check they are mutually exclusive.`
          : "Several branches share most of their wording. Check they are mutually exclusive.",
        first,
      );
    }

    if (item.children.length > 7) {
      push(
        "TOO_MANY_BRANCHES",
        "info",
        "An item has many branches",
        `${item.children.length} branches. Group them so each level reads as one split.`,
        item.id,
      );
    }
  }

  const grouped = singleChild.slice(0, 6);
  for (const itemId of grouped) {
    push("SINGLE_CHILD", "info", "An item has only one child", "A single child adds a level without adding a division.", itemId);
  }
  if (singleChild.length > grouped.length) {
    push(
      "SINGLE_CHILD_MANY",
      "info",
      `${singleChild.length - grouped.length} more items have a single child`,
      "Single-child items usually mean a missing sibling.",
    );
  }

  const leaves = flat.filter((entry) => entry.item.children.length === 0);
  const depths = leaves.map((entry) => entry.depth);
  if (depths.length > 1 && Math.max(...depths) - Math.min(...depths) > 2) {
    push(
      "DEPTH_IMBALANCE",
      "info",
      "Branches are uneven in depth",
      `Leaves sit between level ${Math.min(...depths)} and level ${Math.max(...depths)}. Even depth makes the tree easier to read and to test.`,
    );
  }

  const seenPaths = new Map<string, string>();
  for (const entry of flat) {
    const normalized = entry.labelPath.trim().toLowerCase().replace(/\s+/g, " ");
    const previous = seenPaths.get(normalized);
    if (previous) {
      push(
        "DUPLICATE_PATH",
        "error",
        "Two items have identical wording on the same path",
        "Their content hash would be the same, so one gets an ordinal. Reword one of them.",
        entry.item.id,
      );
    } else {
      seenPaths.set(normalized, entry.item.id);
    }
  }

  for (const info of Object.values(keyMap.byItem)) {
    if (info.promoted) {
      push(
        "KEY_PROMOTED",
        "info",
        `Key ${info.key} is longer than the six default characters`,
        "A real hash collision was detected and resolved deterministically by extending this key. It stays unique.",
        info.itemId,
      );
    }
  }
  for (const collision of keyMap.collisions) {
    push("KEY_COLLISION", "error", `Key ${collision.key} is not unique`, "The resolver could not separate these items.");
  }

  const itemCount = Object.keys(doc.items).length;
  if (itemCount >= ITEM_CAP) {
    push("ITEM_COUNT_CAP", "warn", `The tree is at the ${ITEM_CAP}-item hard cap`, "Remove or merge items before adding more.");
  } else if (itemCount >= SOFT_CAP) {
    push(
      "ITEM_COUNT_HIGH",
      "info",
      `${itemCount} of ${ITEM_CAP} items used`,
      "Past this size the tree gets hard to read. Nothing is blocked.",
    );
  }

  const order: Record<FindingLevel, number> = { error: 0, warn: 1, info: 2 };
  return findings.sort((a, b) => order[a.level] - order[b.level]);
}

export function findingCounts(findings: Finding[]): Record<FindingLevel, number> {
  return findings.reduce(
    (counts, finding) => {
      counts[finding.level] += 1;
      return counts;
    },
    { error: 0, warn: 0, info: 0 } as Record<FindingLevel, number>,
  );
}

/** Items that are the most expensive to fix first: errors on shallow levels. */
export function subtreeSize(doc: TreeDoc, itemId: string): number {
  return subtreeIds(doc, itemId).length;
}
