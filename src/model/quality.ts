/**
 * Deterministic quality and MECE checks. No model is involved: every finding
 * can be reproduced from the tree alone.
 */

import type { KeyMap, TreeDoc } from "./types";
import { NODE_CAP } from "./types";
import { flatten, subtreeIds } from "./tree";

export type FindingLevel = "error" | "warn" | "info";

export interface Finding {
  id: string;
  code: string;
  level: FindingLevel;
  nodeId?: string;
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
    nodeId?: string,
  ): void => {
    findings.push({ id: `${code}:${nodeId ?? "tree"}:${findings.length}`, code, level, title, detail, nodeId });
  };

  if (!doc.rootId || !doc.nodes[doc.rootId]) {
    push("NO_ROOT", "error", "The tree has no root", "Add a root question to start the tree.");
  } else {
    const root = doc.nodes[doc.rootId];
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
    const { node } = entry;
    if (!node.label.trim()) {
      push("EMPTY_LABEL", "error", "A node has no label", "Fill in the wording or delete the node.", node.id);
    }
    if (node.label.length > 140) {
      push(
        "LONG_LABEL",
        "warn",
        "A label is long for a slide",
        `${node.label.length} characters. Aim for under 90 so the box stays readable.`,
        node.id,
      );
    }
    if (node.status === "complete") {
      const openChild = node.children.map((childId) => doc.nodes[childId]).find((child) => child && child.status !== "complete");
      if (openChild) {
        push(
          "COMPLETE_WITH_OPEN_CHILD",
          "warn",
          "A complete node has an open child",
          `"${node.label}" is complete, but "${openChild.label}" is still open. Finish it, reopen the parent, or accept the gap.`,
          node.id,
        );
      }
    }

    if (node.children.length === 1) singleChild.push(node.id);

    for (let i = 0; i < node.children.length; i += 1) {
      const childA = doc.nodes[node.children[i]];
      if (!childA) continue;
      for (let j = i + 1; j < node.children.length; j += 1) {
        const childB = doc.nodes[node.children[j]];
        if (!childB) continue;
        const normalA = childA.label.trim().toLowerCase();
        const normalB = childB.label.trim().toLowerCase();
        if (normalA && normalA === normalB) {
          push(
            "DUPLICATE_SIBLING",
            "error",
            "Two siblings say the same thing",
            `"${childA.label}" is repeated under the same parent. Only one can be true; merge or reword.`,
            childA.id,
          );
        } else if (overlapScore(childA.label, childB.label) >= 0.6) {
          push(
            "OVERLAP_SIBLING",
            "warn",
            "Siblings may overlap",
            `"${childA.label}" and "${childB.label}" share most of their wording. Check they are mutually exclusive.`,
            childA.id,
          );
        }
      }
    }

    if (node.children.length > 7) {
      push(
        "TOO_MANY_BRANCHES",
        "info",
        "A node has many branches",
        `${node.children.length} branches. Group them so each level reads as one split.`,
        node.id,
      );
    }
  }

  const grouped = singleChild.slice(0, 6);
  for (const nodeId of grouped) {
    push("SINGLE_CHILD", "info", "A node has only one child", "A single child adds a level without adding a division.", nodeId);
  }
  if (singleChild.length > grouped.length) {
    push(
      "SINGLE_CHILD_MANY",
      "info",
      `${singleChild.length - grouped.length} more nodes have a single child`,
      "Single-child nodes usually mean a missing sibling.",
    );
  }

  const leaves = flat.filter((entry) => entry.node.children.length === 0);
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
        "Two nodes have identical wording on the same path",
        "Their content hash would be the same, so one gets an ordinal. Reword one of them.",
        entry.node.id,
      );
    } else {
      seenPaths.set(normalized, entry.node.id);
    }
  }

  for (const info of Object.values(keyMap.byNode)) {
    if (info.promoted) {
      push(
        "KEY_PROMOTED",
        "info",
        `Key ${info.key} is longer than 4 characters`,
        "A real hash collision was detected and resolved deterministically by extending this key. It stays unique.",
        info.nodeId,
      );
    }
  }
  for (const collision of keyMap.collisions) {
    push("KEY_COLLISION", "error", `Key ${collision.key} is not unique`, "The resolver could not separate these nodes.");
  }

  const nodeCount = Object.keys(doc.nodes).length;
  if (nodeCount >= NODE_CAP) {
    push("NODE_COUNT_CAP", "warn", "The tree is at the 100-node cap", "Remove or merge nodes before adding more.");
  } else if (nodeCount >= 80) {
    push("NODE_COUNT_HIGH", "info", `${nodeCount} of ${NODE_CAP} nodes used`, "The cap keeps the tree readable on slides.");
  }

  const unconfirmed = flat.filter(
    (entry) => entry.node.children.length >= 2 && (!entry.node.mece || (!entry.node.mece.exhaustive && !entry.node.mece.exclusive)),
  );
  if (unconfirmed.length > 0) {
    push(
      "MECE_UNCONFIRMED",
      "info",
      `${unconfirmed.length} split${unconfirmed.length === 1 ? "" : "s"} not confirmed as MECE`,
      "Open a node and confirm that its branches are exhaustive and mutually exclusive.",
      unconfirmed[0].node.id,
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

/** Nodes that are the most expensive to fix first: errors on shallow levels. */
export function subtreeSize(doc: TreeDoc, nodeId: string): number {
  return subtreeIds(doc, nodeId).length;
}
