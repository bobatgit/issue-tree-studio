/**
 * MECE review seam.
 *
 * The deterministic reviewer ships enabled. The AI reviewer is deliberately
 * unavailable: it has a real interface, so a provider can be wired in later
 * without touching the UI or the quality panel.
 */

import type { KeyMap, TreeDoc } from "./types";
import { overlapScore } from "./quality";

export interface MeceSibling {
  key: string;
  label: string;
  type: string;
}

export interface MeceRequest {
  parentKey: string;
  parentLabel: string;
  siblings: MeceSibling[];
  context?: string[];
}

export interface MeceSuggestion {
  code: string;
  level: "error" | "warn" | "info";
  message: string;
  nodeKeys: string[];
  /** True when only a language model could judge it. */
  needsModel?: boolean;
}

export interface MeceReviewer {
  id: string;
  label: string;
  available: boolean;
  reason?: string;
  review(request: MeceRequest): Promise<MeceSuggestion[]>;
}

export const MECE_SELF_CHECK = [
  "Do the branches together cover everything that could answer the parent?",
  "Is every branch a different cause or option, with no overlap?",
  "Does each branch use the same lens (all regions, or all products, not both)?",
  "Could a rival name a missing branch that the current set cannot hold?",
];

export function heuristicMeceReview(doc: TreeDoc, keyMap: KeyMap, nodeId: string): MeceSuggestion[] {
  const node = doc.nodes[nodeId];
  if (!node) return [];
  const children = node.children.map((id) => doc.nodes[id]).filter(Boolean);
  const suggestions: MeceSuggestion[] = [];
  const keyOf = (id: string): string => keyMap.byNode[id]?.key ?? "----";

  if (children.length === 0) {
    return [
      {
        code: "NOT_SPLIT",
        level: "info",
        message: "This node has no branches yet. Split it, or mark it as a hypothesis you can test.",
        nodeKeys: [keyOf(nodeId)],
      },
    ];
  }
  if (children.length === 1) {
    suggestions.push({
      code: "ONE_BRANCH",
      level: "warn",
      message: "A single branch does not divide the problem. Add the complementary branch or remove the level.",
      nodeKeys: [keyOf(children[0].id)],
    });
  }

  for (let i = 0; i < children.length; i += 1) {
    for (let j = i + 1; j < children.length; j += 1) {
      const a = children[i];
      const b = children[j];
      if (a.label.trim().toLowerCase() === b.label.trim().toLowerCase()) {
        suggestions.push({
          code: "OVERLAP_EXACT",
          level: "error",
          message: `"${a.label}" and "${b.label}" are the same branch.`,
          nodeKeys: [keyOf(a.id), keyOf(b.id)],
        });
      } else if (overlapScore(a.label, b.label) >= 0.6) {
        suggestions.push({
          code: "OVERLAP_WORDS",
          level: "warn",
          message: `"${a.label}" and "${b.label}" share most of their wording. Confirm they are mutually exclusive.`,
          nodeKeys: [keyOf(a.id), keyOf(b.id)],
        });
      }
    }
  }

  if (children.length > 7) {
    suggestions.push({
      code: "TOO_MANY",
      level: "info",
      message: `${children.length} branches is more than a reader can hold. Group them into two or three families first.`,
      nodeKeys: children.map((child) => keyOf(child.id)),
    });
  }

  const mentionsOther = children.some((child) => /other|everything else|remainder|misc/i.test(child.label));
  if (children.length >= 4 && !mentionsOther) {
    suggestions.push({
      code: "NO_OTHER_BRANCH",
      level: "info",
      message:
        "No branch covers 'other'. That is correct only if your split is provably complete; otherwise add a catch-all and test whether it matters.",
      nodeKeys: children.map((child) => keyOf(child.id)),
      needsModel: false,
    });
  }

  if (!node.mece?.exhaustive || !node.mece?.exclusive) {
    suggestions.push({
      code: "UNCONFIRMED",
      level: "info",
      message: "Mark this split as exhaustive and mutually exclusive once you have checked it.",
      nodeKeys: [keyOf(nodeId)],
    });
  }

  return suggestions;
}

export const disabledAiReviewer: MeceReviewer = {
  id: "ai-disabled",
  label: "AI MECE review",
  available: false,
  reason:
    "No model is configured. The deterministic checks run automatically; an AI reviewer can be added behind this interface.",
  async review(): Promise<MeceSuggestion[]> {
    return [];
  },
};

export function reviewerStatus(reviewer: MeceReviewer): string {
  return reviewer.available ? "Available" : reviewer.reason ?? "Not available";
}
