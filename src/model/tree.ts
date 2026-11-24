/** Pure, immutable tree operations. Every function returns a new document. */

import type { DocSettings, FlatNode, MeceFlags, NodeStatus, TreeDoc, TreeNode } from "./types";
import { DEFAULT_SETTINGS, NODE_CAP } from "./types";

export function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && "randomUUID" in c) return c.randomUUID().slice(0, 8);
  return Math.random().toString(36).slice(2, 10);
}

export function now(): number {
  return Date.now();
}

export function countNodes(doc: TreeDoc): number {
  return Object.keys(doc.nodes).length;
}

export function atCap(doc: TreeDoc): boolean {
  return countNodes(doc) >= NODE_CAP;
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
    nodes: {
      [rootId]: { id: rootId, label: rootLabel, status: "open", children: [] },
    },
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    settings: { ...settings },
    aliases: [],
  };
}

export function flatten(doc: TreeDoc): FlatNode[] {
  const out: FlatNode[] = [];
  const seen = new Set<string>();
  const walk = (id: string, depth: number, parentId: string | null, index: number, ancestors: string[]): void => {
    if (seen.has(id)) return;
    const node = doc.nodes[id];
    if (!node) return;
    seen.add(id);
    const labelPath = [...ancestors, node.label].join(" / ");
    out.push({ node, depth, parentId, index, labelPath });
    node.children.forEach((childId, childIndex) => {
      walk(childId, depth + 1, id, childIndex, [...ancestors, node.label]);
    });
  };
  if (doc.rootId && doc.nodes[doc.rootId]) walk(doc.rootId, 1, null, 0, []);
  // Defensive: never lose an orphan node.
  for (const id of Object.keys(doc.nodes)) {
    if (!seen.has(id)) walk(id, 1, null, 0, []);
  }
  return out;
}

export function preorderIds(doc: TreeDoc): string[] {
  return flatten(doc).map((entry) => entry.node.id);
}

export function parentOf(doc: TreeDoc, id: string): string | null {
  const found = flatten(doc).find((entry) => entry.node.id === id);
  return found ? found.parentId : null;
}

export function leafCount(doc: TreeDoc, id: string): number {
  const node = doc.nodes[id];
  if (!node) return 0;
  if (node.children.length === 0) return 1;
  return node.children.reduce((sum, childId) => sum + leafCount(doc, childId), 0);
}

export function maxDepth(doc: TreeDoc): number {
  return flatten(doc).reduce((max, entry) => Math.max(max, entry.depth), 0);
}

/** Preorder entries with the descendants of collapsed nodes removed. */
export function visibleEntries(doc: TreeDoc, collapsed: ReadonlySet<string>): FlatNode[] {
  const all = flatten(doc);
  const hidden = new Set<string>();
  for (const entry of all) {
    if (entry.parentId && (hidden.has(entry.parentId) || collapsed.has(entry.parentId))) {
      hidden.add(entry.node.id);
    }
  }
  return all.filter((entry) => !hidden.has(entry.node.id));
}

/** Every node below `id`, excluding itself. */
export function descendantIds(doc: TreeDoc, id: string): string[] {
  return subtreeIds(doc, id).filter((childId) => childId !== id);
}

export function subtreeIds(doc: TreeDoc, id: string): string[] {
  const out: string[] = [];
  const walk = (nodeId: string): void => {
    if (out.includes(nodeId)) return;
    const node = doc.nodes[nodeId];
    if (!node) return;
    out.push(nodeId);
    node.children.forEach(walk);
  };
  walk(id);
  return out;
}

function touch(doc: TreeDoc, mutate: (draft: TreeDoc) => void): TreeDoc {
  const draft: TreeDoc = {
    ...doc,
    nodes: { ...doc.nodes },
    settings: { ...doc.settings },
    updatedAt: now(),
  };
  mutate(draft);
  return draft;
}

function withNode(doc: TreeDoc, id: string, patch: Partial<TreeNode>): TreeDoc {
  const node = doc.nodes[id];
  if (!node) return doc;
  return touch(doc, (draft) => {
    draft.nodes[id] = { ...node, ...patch };
  });
}

export function updateLabel(doc: TreeDoc, id: string, label: string): TreeDoc {
  return withNode(doc, id, { label });
}

export function setStatus(doc: TreeDoc, id: string, status: NodeStatus): TreeDoc {
  return withNode(doc, id, { status });
}

export function setNote(doc: TreeDoc, id: string, note: string): TreeDoc {
  return withNode(doc, id, { note });
}

export function setMece(doc: TreeDoc, id: string, flags: MeceFlags): TreeDoc {
  return withNode(doc, id, { mece: { ...flags } });
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

/** Add a child. Returns null when the 100-node cap blocks it. */
export function addChild(
  doc: TreeDoc,
  parentId: string,
  label = "",
): { doc: TreeDoc; id: string } | null {
  const parent = doc.nodes[parentId];
  if (!parent || atCap(doc)) return null;
  const id = newId();
  const next = touch(doc, (draft) => {
    draft.nodes[id] = { id, label, status: "open", children: [] };
    const currentParent = draft.nodes[parentId];
    draft.nodes[parentId] = { ...currentParent, children: [...currentParent.children, id] };
  });
  return { doc: next, id };
}

/** Add a sibling after `siblingId`. Falls back to a child when the node is the root. */
export function addSibling(
  doc: TreeDoc,
  siblingId: string,
  label = "",
): { doc: TreeDoc; id: string } | null {
  const parentId = parentOf(doc, siblingId);
  if (!parentId) return addChild(doc, siblingId, label);
  if (atCap(doc)) return null;
  const id = newId();
  const parent = doc.nodes[parentId];
  const index = parent.children.indexOf(siblingId);
  const children = [...parent.children];
  children.splice(index + 1, 0, id);
  const next = touch(doc, (draft) => {
    draft.nodes[id] = { id, label, status: "open", children: [] };
    draft.nodes[parentId] = { ...draft.nodes[parentId], children };
  });
  return { doc: next, id };
}

export function removeNode(doc: TreeDoc, id: string): TreeDoc {
  const ids = new Set(subtreeIds(doc, id));
  if (ids.size === 0) return doc;
  const next = touch(doc, (draft) => {
    for (const removeId of ids) delete draft.nodes[removeId];
    for (const node of Object.values(draft.nodes)) {
      if (node.children.some((childId) => ids.has(childId))) {
        draft.nodes[node.id] = { ...node, children: node.children.filter((childId) => !ids.has(childId)) };
      }
    }
    if (draft.rootId && ids.has(draft.rootId)) {
      draft.rootId = null;
    }
  });
  return next;
}

/** Move a node under a new parent at a given child index. Rejects cycles and the cap. */
export function moveNode(doc: TreeDoc, id: string, newParentId: string, index: number): TreeDoc {
  if (id === newParentId) return doc;
  const forbidden = new Set(subtreeIds(doc, id));
  if (forbidden.has(newParentId)) return doc;
  const node = doc.nodes[id];
  const newParent = doc.nodes[newParentId];
  if (!node || !newParent) return doc;
  const oldParentId = parentOf(doc, id);

  return touch(doc, (draft) => {
    if (oldParentId) {
      const oldParent = draft.nodes[oldParentId];
      draft.nodes[oldParentId] = { ...oldParent, children: oldParent.children.filter((childId) => childId !== id) };
    }
    const target = draft.nodes[newParentId];
    const children = [...target.children];
    const clamped = Math.max(0, Math.min(index, children.length));
    children.splice(clamped, 0, id);
    draft.nodes[newParentId] = { ...target, children };
    if (oldParentId === newParentId) return;
    if (draft.rootId === id) draft.rootId = null;
  });
}

/** Make the node a child of its previous sibling. */
export function indentNode(doc: TreeDoc, id: string): TreeDoc {
  const parentId = parentOf(doc, id);
  if (!parentId) return doc;
  const siblings = doc.nodes[parentId].children;
  const index = siblings.indexOf(id);
  if (index <= 0) return doc;
  const newParentId = siblings[index - 1];
  return moveNode(doc, id, newParentId, doc.nodes[newParentId].children.length);
}

/** Make the node a sibling of its parent, placed directly after it. */
export function outdentNode(doc: TreeDoc, id: string): TreeDoc {
  const parentId = parentOf(doc, id);
  if (!parentId) return doc;
  const grandParentId = parentOf(doc, parentId);
  if (!grandParentId) return doc;
  const grandChildren = doc.nodes[grandParentId].children;
  const parentIndex = grandChildren.indexOf(parentId);
  return moveNode(doc, id, grandParentId, parentIndex + 1);
}

/** Rebuild a document from a flat depth list. Used by the markdown importer. */
export function buildDoc(
  name: string,
  items: { label: string; depth: number; status?: NodeStatus }[],
  options: { settings?: DocSettings; syntheticRoot?: string } = {},
): TreeDoc {
  const settings = options.settings ?? DEFAULT_SETTINGS;
  const timestamp = now();
  const nodes: Record<string, TreeNode> = {};
  const roots: string[] = [];
  const stack: { id: string; depth: number }[] = [];

  for (const item of items) {
    const id = newId();
    nodes[id] = { id, label: item.label, status: item.status ?? "open", children: [] };
    while (stack.length > 0 && stack[stack.length - 1].depth >= item.depth) stack.pop();
    const parent = stack[stack.length - 1];
    if (parent) nodes[parent.id].children.push(id);
    else roots.push(id);
    stack.push({ id, depth: item.depth });
  }

  let rootId: string | null = roots.length === 1 ? roots[0] : null;
  if (roots.length > 1) {
    const synthetic = newId();
    nodes[synthetic] = {
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
    nodes,
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    settings: { ...settings },
    aliases: [],
  };
}

export function snapshotOf(doc: TreeDoc) {
  return {
    name: doc.name,
    rootId: doc.rootId,
    nodes: JSON.parse(JSON.stringify(doc.nodes)) as Record<string, TreeNode>,
    settings: { ...doc.settings },
  };
}

export function docFromSnapshot(
  base: Pick<TreeDoc, "id" | "version" | "createdAt" | "aliases">,
  snapshot: {
    name: string;
    rootId: string | null;
    nodes: Record<string, TreeNode>;
    settings: DocSettings;
  },
): TreeDoc {
  return {
    id: base.id,
    name: snapshot.name,
    rootId: snapshot.rootId,
    nodes: snapshot.nodes,
    version: base.version,
    createdAt: base.createdAt,
    updatedAt: now(),
    settings: snapshot.settings,
    aliases: base.aliases ?? [],
  };
}
