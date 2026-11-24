/** Version comparison: what changed between two snapshots. */

import type { DocSnapshot } from "./types";

export interface SnapshotWithKeys {
  snapshot: DocSnapshot;
  keys: Record<string, string>;
}

export interface KeyChange {
  id: string;
  label: string;
  from: string;
  to: string;
}

export interface VersionDiff {
  added: { id: string; label: string }[];
  removed: { id: string; label: string }[];
  relabelled: { id: string; from: string; to: string }[];
  retyped: { id: string; from: string; to: string }[];
  moved: { id: string; label: string; from: string; to: string }[];
  reordered: number;
  rekeyed: KeyChange[];
  summary: string;
}

function labelPaths(snapshot: DocSnapshot): Map<string, string> {
  const paths = new Map<string, string>();
  const walk = (id: string, ancestors: string[]): void => {
    const node = snapshot.nodes[id];
    if (!node || paths.has(id)) return;
    paths.set(id, ancestors.join(" / "));
    for (const childId of node.children) walk(childId, [...ancestors, node.label]);
  };
  if (snapshot.rootId) walk(snapshot.rootId, []);
  for (const id of Object.keys(snapshot.nodes)) if (!paths.has(id)) walk(id, []);
  return paths;
}

function parentIndex(snapshot: DocSnapshot): Map<string, number> {
  const index = new Map<string, number>();
  for (const node of Object.values(snapshot.nodes)) {
    node.children.forEach((childId, childIndex) => index.set(childId, childIndex));
  }
  return index;
}

export function diffSnapshots(before: SnapshotWithKeys, after: SnapshotWithKeys): VersionDiff {
  const added: VersionDiff["added"] = [];
  const removed: VersionDiff["removed"] = [];
  const relabelled: VersionDiff["relabelled"] = [];
  const retyped: VersionDiff["retyped"] = [];
  const moved: VersionDiff["moved"] = [];
  const rekeyed: VersionDiff["rekeyed"] = [];
  let reordered = 0;

  const beforePaths = labelPaths(before.snapshot);
  const afterPaths = labelPaths(after.snapshot);
  const beforeIndex = parentIndex(before.snapshot);
  const afterIndex = parentIndex(after.snapshot);

  for (const [id, node] of Object.entries(after.snapshot.nodes)) {
    const previous = before.snapshot.nodes[id];
    if (!previous) {
      added.push({ id, label: node.label });
      continue;
    }
    if (previous.label !== node.label) {
      relabelled.push({ id, from: previous.label, to: node.label });
    }
    if (previous.type !== node.type) {
      retyped.push({ id, from: previous.type, to: node.type });
    }
    const fromPath = beforePaths.get(id) ?? "";
    const toPath = afterPaths.get(id) ?? "";
    if (fromPath !== toPath) {
      moved.push({ id, label: node.label, from: fromPath, to: toPath });
    } else if (beforeIndex.get(id) !== undefined && beforeIndex.get(id) !== afterIndex.get(id)) {
      reordered += 1;
    }
    const fromKey = before.keys[id];
    const toKey = after.keys[id];
    if (fromKey && toKey && fromKey !== toKey) {
      rekeyed.push({ id, label: node.label, from: fromKey, to: toKey });
    }
  }

  for (const [id, node] of Object.entries(before.snapshot.nodes)) {
    if (!after.snapshot.nodes[id]) removed.push({ id, label: node.label });
  }

  const parts: string[] = [];
  if (added.length) parts.push(`${added.length} added`);
  if (removed.length) parts.push(`${removed.length} removed`);
  if (relabelled.length) parts.push(`${relabelled.length} relabelled`);
  if (moved.length) parts.push(`${moved.length} moved`);
  if (reordered) parts.push(`${reordered} reordered`);
  if (retyped.length) parts.push(`${retyped.length} re-typed`);
  if (rekeyed.length) parts.push(`${rekeyed.length} keys changed`);
  if (!parts.length) parts.push("no visible change");

  return {
    added,
    removed,
    relabelled,
    retyped,
    moved,
    reordered,
    rekeyed,
    summary: parts.join(", "),
  };
}
