/** Minimal IndexedDB persistence with an in-memory fallback. */

import type { DocSummary, TreeDoc, VersionEntry } from "../model/types";
import { HISTORY_CAP } from "../model/types";

const DB_NAME = "issue-tree-studio";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb()) return Promise.resolve(null);
  const existing = dbPromise;
  if (existing) return existing;
  const created: Promise<IDBDatabase | null> = new Promise<IDBDatabase | null>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("docs")) {
        db.createObjectStore("docs", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("versions")) {
        const store = db.createObjectStore("versions", { keyPath: ["docId", "v"] });
        store.createIndex("by_doc", "docId");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch(() => null);
  dbPromise = created;
  return created;
}

function wrap<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const memory = {
  docs: new Map<string, TreeDoc>(),
  versions: new Map<string, VersionEntry>(),
};

export async function listDocs(): Promise<DocSummary[]> {
  const db = await openDb();
  if (!db) {
    return [...memory.docs.values()].map(summarise).sort((a, b) => b.updatedAt - a.updatedAt);
  }
  const docs = await wrap(db.transaction("docs", "readonly").objectStore("docs").getAll() as IDBRequest<TreeDoc[]>);
  return docs.map(summarise).sort((a, b) => b.updatedAt - a.updatedAt);
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

export async function getDoc(id: string): Promise<TreeDoc | null> {
  const db = await openDb();
  if (!db) return memory.docs.get(id) ?? null;
  const doc = await wrap(db.transaction("docs", "readonly").objectStore("docs").get(id) as IDBRequest<TreeDoc | undefined>);
  return doc ?? null;
}

export async function putDoc(doc: TreeDoc): Promise<void> {
  const db = await openDb();
  if (!db) {
    memory.docs.set(doc.id, doc);
    return;
  }
  await wrap(db.transaction("docs", "readwrite").objectStore("docs").put(doc));
}

export async function deleteDoc(id: string): Promise<void> {
  const db = await openDb();
  if (!db) {
    memory.docs.delete(id);
    for (const [key, entry] of memory.versions) if (entry.docId === id) memory.versions.delete(key);
    return;
  }
  const tx = db.transaction(["docs", "versions"], "readwrite");
  tx.objectStore("docs").delete(id);
  const index = tx.objectStore("versions").index("by_doc");
  const request = index.openKeyCursor(IDBKeyRange.only(id));
  request.onsuccess = () => {
    const cursor = request.result;
    if (cursor) {
      tx.objectStore("versions").delete(cursor.primaryKey);
      cursor.continue();
    }
  };
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function versionKey(docId: string, v: number): string {
  return `${docId}::${v}`;
}

export async function putVersion(entry: VersionEntry): Promise<void> {
  const db = await openDb();
  if (!db) {
    memory.versions.set(versionKey(entry.docId, entry.v), entry);
    return;
  }
  await wrap(db.transaction("versions", "readwrite").objectStore("versions").put(entry));
}

/** Newest first. */
export async function listVersions(docId: string, limit = 200): Promise<VersionEntry[]> {
  const db = await openDb();
  if (!db) {
    return [...memory.versions.values()]
      .filter((entry) => entry.docId === docId)
      .sort((a, b) => b.v - a.v)
      .slice(0, limit);
  }
  const store = db.transaction("versions", "readonly").objectStore("versions");
  const range = IDBKeyRange.bound([docId, 0], [docId, Number.MAX_SAFE_INTEGER]);
  const out: VersionEntry[] = [];
  await new Promise<void>((resolve, reject) => {
    const request = store.openCursor(range, "prev");
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || out.length >= limit) {
        resolve();
        return;
      }
      out.push(cursor.value as VersionEntry);
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
  return out;
}

export async function getAllVersions(docId: string): Promise<VersionEntry[]> {
  const db = await openDb();
  if (!db) {
    return [...memory.versions.values()].filter((entry) => entry.docId === docId).sort((a, b) => a.v - b.v);
  }
  const index = db.transaction("versions", "readonly").objectStore("versions").index("by_doc");
  const entries = await wrap(index.getAll(IDBKeyRange.only(docId)) as IDBRequest<VersionEntry[]>);
  return entries.sort((a, b) => a.v - b.v);
}

export async function getVersion(docId: string, v: number): Promise<VersionEntry | null> {
  const db = await openDb();
  if (!db) return memory.versions.get(versionKey(docId, v)) ?? null;
  const entry = await wrap(
    db.transaction("versions", "readonly").objectStore("versions").get([docId, v]) as IDBRequest<VersionEntry | undefined>,
  );
  return entry ?? null;
}

/**
 * Keep at most `cap` versions. Oldest non-checkpoint entries are removed first;
 * named checkpoints survive pruning.
 */
export async function pruneVersions(docId: string, cap = HISTORY_CAP): Promise<number> {
  const all = await getAllVersions(docId);
  if (all.length <= cap) return 0;
  const removable = all.filter((entry) => !entry.checkpoint);
  const over = all.length - cap;
  const victims = removable.slice(0, over);
  if (victims.length === 0) return 0;
  const db = await openDb();
  if (!db) {
    for (const victim of victims) memory.versions.delete(versionKey(docId, victim.v));
    return victims.length;
  }
  const tx = db.transaction("versions", "readwrite");
  for (const victim of victims) tx.objectStore("versions").delete([docId, victim.v]);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return victims.length;
}

export async function countVersions(docId: string): Promise<number> {
  const db = await openDb();
  if (!db) return [...memory.versions.values()].filter((entry) => entry.docId === docId).length;
  const index = db.transaction("versions", "readonly").objectStore("versions").index("by_doc");
  return wrap(index.count(IDBKeyRange.only(docId)));
}

/** Close the cached connection so the database can be deleted. */
async function closeDatabase(): Promise<void> {
  const pending = dbPromise;
  dbPromise = null;
  if (!pending) return;
  try {
    (await pending)?.close();
  } catch {
    /* already closed */
  }
}

/** Remove the legacy database once its trees have been adopted. */
export async function deleteDatabase(): Promise<void> {
  await closeDatabase();
  memory.docs.clear();
  memory.versions.clear();
  dbPromise = null;
  if (!hasIndexedDb()) return;
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}
