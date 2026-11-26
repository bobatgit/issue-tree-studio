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
  moved: { id: string; label: string; from: string; to: string }[];
  reordered: number;
  rekeyed: KeyChange[];
  summary: string;
}

function labelPaths(snapshot: DocSnapshot): Map<string, string> {
  const paths = new Map<string, string>();
  const walk = (id: string, ancestors: string[]): void => {
    const item = snapshot.items[id];
    if (!item || paths.has(id)) return;
    paths.set(id, ancestors.join(" / "));
    for (const childId of item.children) walk(childId, [...ancestors, item.label]);
  };
  if (snapshot.rootId) walk(snapshot.rootId, []);
  for (const id of Object.keys(snapshot.items)) if (!paths.has(id)) walk(id, []);
  return paths;
}

function parentIndex(snapshot: DocSnapshot): Map<string, number> {
  const index = new Map<string, number>();
  for (const item of Object.values(snapshot.items)) {
    item.children.forEach((childId, childIndex) => index.set(childId, childIndex));
  }
  return index;
}

export function diffSnapshots(before: SnapshotWithKeys, after: SnapshotWithKeys): VersionDiff {
  const added: VersionDiff["added"] = [];
  const removed: VersionDiff["removed"] = [];
  const relabelled: VersionDiff["relabelled"] = [];
  const moved: VersionDiff["moved"] = [];
  const rekeyed: VersionDiff["rekeyed"] = [];
  let reordered = 0;

  const beforePaths = labelPaths(before.snapshot);
  const afterPaths = labelPaths(after.snapshot);
  const beforeIndex = parentIndex(before.snapshot);
  const afterIndex = parentIndex(after.snapshot);

  for (const [id, item] of Object.entries(after.snapshot.items)) {
    const previous = before.snapshot.items[id];
    if (!previous) {
      added.push({ id, label: item.label });
      continue;
    }
    if (previous.label !== item.label) {
      relabelled.push({ id, from: previous.label, to: item.label });
    }
    const fromPath = beforePaths.get(id) ?? "";
    const toPath = afterPaths.get(id) ?? "";
    if (fromPath !== toPath) {
      moved.push({ id, label: item.label, from: fromPath, to: toPath });
    } else if (beforeIndex.get(id) !== undefined && beforeIndex.get(id) !== afterIndex.get(id)) {
      reordered += 1;
    }
    const fromKey = before.keys[id];
    const toKey = after.keys[id];
    if (fromKey && toKey && fromKey !== toKey) {
      rekeyed.push({ id, label: item.label, from: fromKey, to: toKey });
    }
  }

  for (const [id, item] of Object.entries(before.snapshot.items)) {
    if (!after.snapshot.items[id]) removed.push({ id, label: item.label });
  }

  const parts: string[] = [];
  if (added.length) parts.push(`${added.length} added`);
  if (removed.length) parts.push(`${removed.length} removed`);
  if (relabelled.length) parts.push(`${relabelled.length} relabelled`);
  if (moved.length) parts.push(`${moved.length} moved`);
  if (reordered) parts.push(`${reordered} reordered`);
  if (rekeyed.length) parts.push(`${rekeyed.length} keys changed`);
  if (!parts.length) parts.push("no visible change");

  return {
    added,
    removed,
    relabelled,
    moved,
    reordered,
    rekeyed,
    summary: parts.join(", "),
  };
}
