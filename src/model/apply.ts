/**
 * Applying a markdown outline back onto the live tree.
 *
 * The outline carries labels, status and keys, but not notes or MECE flags. A
 * node whose normalised label path is unchanged keeps its id, its note and its
 * flags, so an apply cannot quietly lose work that the text never described.
 */

import { diffSnapshots, type SnapshotWithKeys } from "./diff";
import { computeKeyMap } from "./keys";
import type { KeyMap, TreeDoc, TreeNode } from "./types";
import { countNodes, flatten, snapshotOf } from "./tree";

const SEP = "\u001f";

function normalise(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

function pathIndex(doc: TreeDoc): Map<string, TreeNode> {
  const index = new Map<string, TreeNode>();
  const walk = (id: string, ancestors: string[]): void => {
    const node = doc.nodes[id];
    if (!node) return;
    index.set([...ancestors, normalise(node.label)].join(SEP), node);
    for (const childId of node.children) walk(childId, [...ancestors, normalise(node.label)]);
  };
  if (doc.rootId) walk(doc.rootId, []);
  return index;
}

function keyRecord(map: KeyMap): Record<string, string> {
  return Object.fromEntries(Object.entries(map.byNode).map(([id, info]) => [id, info.key]));
}

/**
 * Replace the structure while keeping ids, notes and flags.
 *
 * A node is matched by its label path first, so a rename does not lose a note
 * when the position is unchanged, and by position second, so an insertion does
 * not shift every note below it.
 */
export function mergeParsed(current: TreeDoc, parsed: TreeDoc): TreeDoc {
  const previous = pathIndex(current);
  const nodes: Record<string, TreeNode> = {};
  const seen = new Set<string>();
  const used = new Set<string>();

  const visit = (parsedId: string, previousId: string | null, ancestors: string[]): string | null => {
    const node = parsed.nodes[parsedId];
    if (!node || seen.has(parsedId)) return null;
    seen.add(parsedId);
    const path = [...ancestors, normalise(node.label)].join(SEP);
    const byPath = previous.get(path);
    const candidate = byPath && !used.has(byPath.id) ? byPath : null;
    const byPosition = previousId && !used.has(previousId) ? current.nodes[previousId] : null;
    const match = candidate ?? byPosition ?? null;
    const nextId = match?.id ?? parsedId;
    used.add(nextId);
    const previousChildren = match?.children ?? [];
    const children = node.children
      .map((childId, index) => visit(childId, previousChildren[index] ?? null, [...ancestors, normalise(node.label)]))
      .filter((childId): childId is string => Boolean(childId));
    nodes[nextId] = {
      id: nextId,
      label: node.label,
      status: node.status,
      children,
      ...(match?.note ? { note: match.note } : {}),
      ...(match?.mece ? { mece: match.mece } : {}),
    };
    return nextId;
  };

  const rootId = parsed.rootId ? visit(parsed.rootId, current.rootId, []) : null;
  return { ...current, rootId, nodes };
}

export interface ApplyPreview {
  total: number;
  added: number;
  removed: number;
  relabelled: number;
  moved: number;
  keyChanges: number;
  overCap: boolean;
}

export function previewApply(current: TreeDoc, merged: TreeDoc, cap: number): ApplyPreview {
  const before: SnapshotWithKeys = { snapshot: snapshotOf(current), keys: keyRecord(computeKeyMap(current)) };
  const after: SnapshotWithKeys = { snapshot: snapshotOf(merged), keys: keyRecord(computeKeyMap(merged)) };
  const diff = diffSnapshots(before, after);
  return {
    total: countNodes(merged),
    added: diff.added.length,
    removed: diff.removed.length,
    relabelled: diff.relabelled.length,
    moved: diff.moved.length,
    keyChanges: diff.rekeyed.length,
    overCap: countNodes(merged) > cap,
  };
}

/** A short sentence for the preview strip. */
export function describeApply(preview: ApplyPreview): string {
  const parts: string[] = [`${preview.total} node${preview.total === 1 ? "" : "s"}`];
  if (preview.added) parts.push(`+${preview.added}`);
  if (preview.removed) parts.push(`-${preview.removed}`);
  if (preview.relabelled) parts.push(`${preview.relabelled} renamed`);
  if (preview.moved) parts.push(`${preview.moved} moved`);
  if (preview.keyChanges) parts.push(`${preview.keyChanges} key change${preview.keyChanges === 1 ? "" : "s"}`);
  return parts.join(", ");
}

/** True when the outline would change nothing. */
export function hasChanges(preview: ApplyPreview): boolean {
  return Boolean(preview.added || preview.removed || preview.relabelled || preview.moved);
}

/** Preorder labels, used by tests and by the empty-outline check. */
export function outlineLabels(doc: TreeDoc): string[] {
  return flatten(doc).map((entry) => entry.node.label);
}
