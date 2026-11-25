/**
 * Per-tab persistence.
 *
 * One tree, one history, in `sessionStorage`: nothing is shared with another
 * tab, and closing the tab ends the tree. The history keeps as many versions as
 * fit in the byte budget; the oldest automatic version goes first and named
 * checkpoints are never pruned.
 */

import type { DocSummary, TreeDoc, VersionEntry } from "../model/types";
import { HISTORY_CAP } from "../model/types";

const DOC_KEY = "its.doc";
const VERSIONS_KEY = "its.versions";

/** Characters, not bytes. sessionStorage is about 5M characters per origin. */
const BUDGET = 2_400_000;

function read<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exhausted: the tree itself stays in memory for this page.
  }
}

function summarise(doc: TreeDoc): DocSummary {
  return {
    id: doc.id,
    name: doc.name,
    version: doc.version,
    updatedAt: doc.updatedAt,
    nodeCount: Object.keys(doc.nodes).length,
  };
}

export async function listDocs(): Promise<DocSummary[]> {
  const doc = read<TreeDoc>(DOC_KEY);
  return doc ? [summarise(doc)] : [];
}

export async function getDoc(_id?: string): Promise<TreeDoc | null> {
  return read<TreeDoc>(DOC_KEY);
}

export async function putDoc(doc: TreeDoc): Promise<void> {
  write(DOC_KEY, doc);
}

export async function deleteDoc(_id?: string): Promise<void> {
  try {
    sessionStorage.removeItem(DOC_KEY);
    sessionStorage.removeItem(VERSIONS_KEY);
  } catch {
    // Nothing to do.
  }
}

export async function clear(): Promise<void> {
  await deleteDoc();
}

/** Newest first. */
export async function listVersions(_docId: string, limit = 200): Promise<VersionEntry[]> {
  const all = read<VersionEntry[]>(VERSIONS_KEY) ?? [];
  return [...all].sort((a, b) => b.v - a.v).slice(0, limit);
}

export async function getAllVersions(_docId: string): Promise<VersionEntry[]> {
  const all = read<VersionEntry[]>(VERSIONS_KEY) ?? [];
  return [...all].sort((a, b) => a.v - b.v);
}

export async function getVersion(_docId: string, v: number): Promise<VersionEntry | null> {
  const all = read<VersionEntry[]>(VERSIONS_KEY) ?? [];
  return all.find((entry) => entry.v === v) ?? null;
}

export async function countVersions(_docId: string): Promise<number> {
  return (read<VersionEntry[]>(VERSIONS_KEY) ?? []).length;
}

/** Keep the list inside the budget by dropping the oldest automatic entries. */
export function fitToBudget(entries: VersionEntry[], budget: number): VersionEntry[] {
  let list = [...entries].sort((a, b) => a.v - b.v);
  while (list.length > 1 && JSON.stringify(list).length > budget) {
    const index = list.findIndex((entry) => !entry.checkpoint);
    if (index < 0) break;
    list = [...list.slice(0, index), ...list.slice(index + 1)];
  }
  return list;
}

export async function putVersion(entry: VersionEntry): Promise<void> {
  const all = read<VersionEntry[]>(VERSIONS_KEY) ?? [];
  const next = all.filter((existing) => existing.v !== entry.v);
  next.push(entry);
  write(VERSIONS_KEY, fitToBudget(next, BUDGET));
}

/**
 * Trim the list to `cap` versions, keeping checkpoints. The byte budget is
 * enforced separately when writing.
 */
export async function pruneVersions(_docId: string, cap = HISTORY_CAP): Promise<number> {
  const all = read<VersionEntry[]>(VERSIONS_KEY) ?? [];
  if (all.length <= cap) return 0;
  let list = [...all].sort((a, b) => a.v - b.v);
  const over = list.length - cap;
  let removed = 0;
  for (let i = 0; i < over && list.some((entry) => !entry.checkpoint); i += 1) {
    const index = list.findIndex((entry) => !entry.checkpoint);
    list = [...list.slice(0, index), ...list.slice(index + 1)];
    removed += 1;
  }
  write(VERSIONS_KEY, list);
  return removed;
}

/** The whole tab's payload, used by tests and diagnostics. */
export function tabUsage(): { docCharacters: number; historyCharacters: number } {
  const doc = sessionStorage.getItem(DOC_KEY) ?? "";
  const versions = sessionStorage.getItem(VERSIONS_KEY) ?? "";
  return { docCharacters: doc.length, historyCharacters: versions.length };
}
