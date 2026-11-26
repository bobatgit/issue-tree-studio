/** Pure, immutable tree operations. Every function returns a new document. */

import type { DocSettings, FlatItem, MeceFlags, ItemStatus, TreeDoc, TreeItem } from "./types";
import { DEFAULT_SETTINGS, ITEM_CAP } from "./types";

export function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && "randomUUID" in c) return c.randomUUID().slice(0, 8);
  return Math.random().toString(36).slice(2, 10);
}

export function now(): number {
  return Date.now();
}

/** The tree is its own title: the root label, with a fallback while it is empty. */
export function titleOf(doc: TreeDoc): string {
  const root = doc.rootId ? doc.items[doc.rootId] : null;
  return root?.label.trim() || "Untitled issue tree";
}

export function countItems(doc: TreeDoc): number {
  return Object.keys(doc.items).length;
}

export function atCap(doc: TreeDoc): boolean {
  return countItems(doc) >= ITEM_CAP;
}

export function createDoc(
  name = "Untitled issue tree",
  rootLabel = "Why did profit fall 20% year over year?",
  settings: DocSettings = DEFAULT_SETTINGS,
): TreeDoc {
  const rootId = newId();
  const timestamp = now();
  return {
    id: newId(),
    name,
    rootId,
    items: {
      [rootId]: { id: rootId, label: rootLabel, status: "open", children: [] },
    },
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    settings: { ...settings },
  };
}

export function flatten(doc: TreeDoc): FlatItem[] {
  const out: FlatItem[] = [];
  const seen = new Set<string>();
  const walk = (id: string, depth: number, parentId: string | null, index: number, ancestors: string[]): void => {
    if (seen.has(id)) return;
    const item = doc.items[id];
    if (!item) return;
    seen.add(id);
    const labelPath = [...ancestors, item.label].join(" / ");
    out.push({ item, depth, parentId, index, labelPath });
    item.children.forEach((childId, childIndex) => {
      walk(childId, depth + 1, id, childIndex, [...ancestors, item.label]);
    });
  };
  if (doc.rootId && doc.items[doc.rootId]) walk(doc.rootId, 1, null, 0, []);
  // Defensive: never lose an orphan item.
  for (const id of Object.keys(doc.items)) {
    if (!seen.has(id)) walk(id, 1, null, 0, []);
  }
  return out;
}

export function preorderIds(doc: TreeDoc): string[] {
  return flatten(doc).map((entry) => entry.item.id);
}

export function parentOf(doc: TreeDoc, id: string): string | null {
  const found = flatten(doc).find((entry) => entry.item.id === id);
  return found ? found.parentId : null;
}

export function leafCount(doc: TreeDoc, id: string): number {
  const item = doc.items[id];
  if (!item) return 0;
  if (item.children.length === 0) return 1;
  return item.children.reduce((sum, childId) => sum + leafCount(doc, childId), 0);
}

export function maxDepth(doc: TreeDoc): number {
  return flatten(doc).reduce((max, entry) => Math.max(max, entry.depth), 0);
}

/** Preorder entries with the descendants of collapsed items removed. */
export function visibleEntries(doc: TreeDoc, collapsed: ReadonlySet<string>): FlatItem[] {
  const all = flatten(doc);
  const hidden = new Set<string>();
  for (const entry of all) {
    if (entry.parentId && (hidden.has(entry.parentId) || collapsed.has(entry.parentId))) {
      hidden.add(entry.item.id);
    }
  }
  return all.filter((entry) => !hidden.has(entry.item.id));
}

/** Every item below `id`, excluding itself. */
export function descendantIds(doc: TreeDoc, id: string): string[] {
  return subtreeIds(doc, id).filter((childId) => childId !== id);
}

export function subtreeIds(doc: TreeDoc, id: string): string[] {
  const out: string[] = [];
  const walk = (itemId: string): void => {
    if (out.includes(itemId)) return;
    const item = doc.items[itemId];
    if (!item) return;
    out.push(itemId);
    item.children.forEach(walk);
  };
  walk(id);
  return out;
}

/**
 * Every item inside each item's branch, at any depth, excluding the item itself.
 *
 * One pass over the map, so a folded row's count never becomes a tree walk per
 * row. A folded branch says how many items opening it reveals, however deep they
 * sit, which is why this is not a count of direct children.
 */
export function subtreeSizes(doc: TreeDoc): Record<string, number> {
  const sizes: Record<string, number> = {};
  const visit = (id: string): number => {
    if (id in sizes) return sizes[id];
    const item = doc.items[id];
    if (!item) return 0;
    sizes[id] = 0;
    let total = 0;
    for (const childId of item.children) total += 1 + visit(childId);
    sizes[id] = total;
    return total;
  };
  for (const id of Object.keys(doc.items)) visit(id);
  return sizes;
}

function touch(doc: TreeDoc, mutate: (draft: TreeDoc) => void): TreeDoc {
  const draft: TreeDoc = {
    ...doc,
    items: { ...doc.items },
    settings: { ...doc.settings },
    updatedAt: now(),
  };
  mutate(draft);
  return draft;
}

function withItem(doc: TreeDoc, id: string, patch: Partial<TreeItem>): TreeDoc {
  const item = doc.items[id];
  if (!item) return doc;
  return touch(doc, (draft) => {
    draft.items[id] = { ...item, ...patch };
  });
}

export function updateLabel(doc: TreeDoc, id: string, label: string): TreeDoc {
  return withItem(doc, id, { label });
}

export function setStatus(doc: TreeDoc, id: string, status: ItemStatus): TreeDoc {
  return withItem(doc, id, { status });
}

export function setNote(doc: TreeDoc, id: string, note: string): TreeDoc {
  return withItem(doc, id, { note });
}

export function setMece(doc: TreeDoc, id: string, flags: MeceFlags): TreeDoc {
  return withItem(doc, id, { mece: { ...flags } });
}

export function setDocName(doc: TreeDoc, name: string): TreeDoc {
  return touch(doc, (draft) => {
    draft.name = name;
  });
}

export function setSettings(doc: TreeDoc, settings: Partial<DocSettings>): TreeDoc {
  return touch(doc, (draft) => {
    draft.settings = { ...doc.settings, ...settings };
  });
}

/** Add a child. Returns null when the hard cap blocks it. */
export function addChild(
  doc: TreeDoc,
  parentId: string,
  label = "",
): { doc: TreeDoc; id: string } | null {
  const parent = doc.items[parentId];
  if (!parent || atCap(doc)) return null;
  const id = newId();
  const next = touch(doc, (draft) => {
    draft.items[id] = { id, label, status: "open", children: [] };
    const currentParent = draft.items[parentId];
    draft.items[parentId] = { ...currentParent, children: [...currentParent.children, id] };
  });
  return { doc: next, id };
}

/** Add a sibling after `siblingId`. Falls back to a child when the item is the root. */
export function addSibling(
  doc: TreeDoc,
  siblingId: string,
  label = "",
): { doc: TreeDoc; id: string } | null {
  const parentId = parentOf(doc, siblingId);
  if (!parentId) return addChild(doc, siblingId, label);
  if (atCap(doc)) return null;
  const id = newId();
  const parent = doc.items[parentId];
  const index = parent.children.indexOf(siblingId);
  const children = [...parent.children];
  children.splice(index + 1, 0, id);
  const next = touch(doc, (draft) => {
    draft.items[id] = { id, label, status: "open", children: [] };
    draft.items[parentId] = { ...draft.items[parentId], children };
  });
  return { doc: next, id };
}

export function removeItem(doc: TreeDoc, id: string): TreeDoc {
  const ids = new Set(subtreeIds(doc, id));
  if (ids.size === 0) return doc;
  const next = touch(doc, (draft) => {
    for (const removeId of ids) delete draft.items[removeId];
    for (const item of Object.values(draft.items)) {
      if (item.children.some((childId) => ids.has(childId))) {
        draft.items[item.id] = { ...item, children: item.children.filter((childId) => !ids.has(childId)) };
      }
    }
    if (draft.rootId && ids.has(draft.rootId)) {
      draft.rootId = null;
    }
  });
  return next;
}

/** Move an item under a new parent at a given child index. Rejects cycles and the cap. */
export function moveItem(doc: TreeDoc, id: string, newParentId: string, index: number): TreeDoc {
  if (id === newParentId) return doc;
  const forbidden = new Set(subtreeIds(doc, id));
  if (forbidden.has(newParentId)) return doc;
  const item = doc.items[id];
  const newParent = doc.items[newParentId];
  if (!item || !newParent) return doc;
  const oldParentId = parentOf(doc, id);

  return touch(doc, (draft) => {
    if (oldParentId) {
      const oldParent = draft.items[oldParentId];
      draft.items[oldParentId] = { ...oldParent, children: oldParent.children.filter((childId) => childId !== id) };
    }
    const target = draft.items[newParentId];
    const children = [...target.children];
    const clamped = Math.max(0, Math.min(index, children.length));
    children.splice(clamped, 0, id);
    draft.items[newParentId] = { ...target, children };
    if (oldParentId === newParentId) return;
    if (draft.rootId === id) draft.rootId = null;
  });
}

/** Make the item a child of its previous sibling. */
export function indentItem(doc: TreeDoc, id: string): TreeDoc {
  const parentId = parentOf(doc, id);
  if (!parentId) return doc;
  const siblings = doc.items[parentId].children;
  const index = siblings.indexOf(id);
  if (index <= 0) return doc;
  const newParentId = siblings[index - 1];
  return moveItem(doc, id, newParentId, doc.items[newParentId].children.length);
}

/** Make the item a sibling of its parent, placed directly after it. */
export function outdentItem(doc: TreeDoc, id: string): TreeDoc {
  const parentId = parentOf(doc, id);
  if (!parentId) return doc;
  const grandParentId = parentOf(doc, parentId);
  if (!grandParentId) return doc;
  const grandChildren = doc.items[grandParentId].children;
  const parentIndex = grandChildren.indexOf(parentId);
  return moveItem(doc, id, grandParentId, parentIndex + 1);
}

/** Rebuild a document from a flat depth list. Used by the markdown importer. */
export function buildDoc(
  name: string,
  items: { label: string; depth: number; status?: ItemStatus }[],
  options: { settings?: DocSettings; syntheticRoot?: string } = {},
): TreeDoc {
  const settings = options.settings ?? DEFAULT_SETTINGS;
  const timestamp = now();
  const byId: Record<string, TreeItem> = {};
  const roots: string[] = [];
  const stack: { id: string; depth: number }[] = [];

  for (const item of items) {
    const id = newId();
    byId[id] = { id, label: item.label, status: item.status ?? "open", children: [] };
    while (stack.length > 0 && stack[stack.length - 1].depth >= item.depth) stack.pop();
    const parent = stack[stack.length - 1];
    if (parent) byId[parent.id].children.push(id);
    else roots.push(id);
    stack.push({ id, depth: item.depth });
  }

  let rootId: string | null = roots.length === 1 ? roots[0] : null;
  if (roots.length > 1) {
    const synthetic = newId();
    byId[synthetic] = {
      id: synthetic,
      label: options.syntheticRoot ?? "Root question",
      status: "open",
      children: roots,
    };
    rootId = synthetic;
  }
  return {
    id: newId(),
    name,
    rootId,
    items: byId,
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    settings: { ...settings },
  };
}

export function snapshotOf(doc: TreeDoc) {
  return {
    name: doc.name,
    rootId: doc.rootId,
    items: JSON.parse(JSON.stringify(doc.items)) as Record<string, TreeItem>,
    settings: { ...doc.settings },
  };
}

export function docFromSnapshot(
  base: Pick<TreeDoc, "id" | "version" | "createdAt">,
  snapshot: {
    name: string;
    rootId: string | null;
    items: Record<string, TreeItem>;
    settings: DocSettings;
  },
): TreeDoc {
  return {
    id: base.id,
    name: snapshot.name,
    rootId: snapshot.rootId,
    items: snapshot.items,
    version: base.version,
    createdAt: base.createdAt,
    updatedAt: now(),
    settings: snapshot.settings,
  };
}
