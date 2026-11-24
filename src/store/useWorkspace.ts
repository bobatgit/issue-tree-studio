/** Workspace state: documents, editing, undo, versions, persistence. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { exportCsv } from "../model/csv";
import { diffSnapshots } from "../model/diff";
import { computeKeyMap } from "../model/keys";
import { parseMarkdown, toMarkdown } from "../model/markdown";
import { importCsv } from "../model/csv";
import { findingCounts, reviewTree, type Finding } from "../model/quality";
import { SAMPLES } from "../model/sample";
import {
  addChild as addChildOp,
  addSibling as addSiblingOp,
  atCap,
  countNodes,
  createDoc,
  docFromSnapshot,
  flatten,
  indentNode,
  moveNode,
  newId,
  outdentNode,
  removeNode,
  setDocName,
  setMece as setMeceOp,
  setNote as setNoteOp,
  setSettings as setSettingsOp,
  snapshotOf,
  updateLabel,
} from "../model/tree";
import type {
  DocSettings,
  DocSummary,
  KeyAlias,
  KeyMap,
  MeceFlags,
  TreeDoc,
  VersionEntry,
  VersionTrigger,
} from "../model/types";
import { ALIAS_CAP, DEFAULT_SETTINGS } from "../model/types";
import { parseProject } from "../model/project";
import * as db from "./db";

export interface Toast {
  id: string;
  kind: "info" | "error" | "success";
  message: string;
}

export type ImportFormat = "markdown" | "csv" | "json";

export interface Workspace {
  ready: boolean;
  library: DocSummary[];
  doc: TreeDoc | null;
  keyMap: KeyMap;
  findings: Finding[];
  findingCounts: Record<"error" | "warn" | "info", number>;
  versions: VersionEntry[];
  versionCount: number;
  pendingVersion: boolean;
  selection: string | null;
  toasts: Toast[];
  nodeCount: number;
  atCap: boolean;
  canUndo: boolean;
  canRedo: boolean;
  openDoc: (id: string) => Promise<void>;
  newDoc: () => Promise<void>;
  loadSample: (sampleId: string) => Promise<void>;
  renameDoc: (name: string) => void;
  duplicateDoc: () => Promise<void>;
  deleteDoc: () => Promise<void>;
  addChild: (parentId: string) => void;
  addSibling: (id: string) => void;
  remove: (id: string) => void;
  indent: (id: string) => void;
  outdent: (id: string) => void;
  move: (id: string, parentId: string, index: number) => void;
  editLabel: (id: string, label: string) => void;
  setNote: (id: string, note: string) => void;
  setMece: (id: string, flags: MeceFlags) => void;
  setSettings: (settings: Partial<DocSettings>) => void;
  undo: () => void;
  redo: () => void;
  select: (id: string | null) => void;
  toast: (kind: Toast["kind"], message: string) => void;
  dismissToast: (id: string) => void;
  checkpoint: (name: string) => Promise<void>;
  restoreVersion: (v: number) => Promise<void>;
  importAsNew: (text: string, format: ImportFormat, name?: string) => Promise<void>;
  exportProject: () => Promise<string>;
  downloadCsv: () => void;
  downloadMarkdown: () => void;
  reloadVersions: (limit?: number) => Promise<void>;
}

const UNDO_LIMIT = 100;
const EDIT_DEBOUNCE_MS = 2000;

export function useWorkspace(): Workspace {
  const [ready, setReady] = useState(false);
  const [library, setLibrary] = useState<DocSummary[]>([]);
  const [doc, setDoc] = useState<TreeDoc | null>(null);
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [versionCount, setVersionCount] = useState(0);
  const [pendingVersion, setPendingVersion] = useState(false);
  const [selection, setSelection] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [undoDepth, setUndoDepth] = useState(0);
  const [redoDepth, setRedoDepth] = useState(0);

  const docRef = useRef<TreeDoc | null>(null);
  const undoRef = useRef<TreeDoc[]>([]);
  const redoRef = useRef<TreeDoc[]>([]);
  const keysRef = useRef<Record<string, string>>({});
  const versionRef = useRef(1);
  const lastSnapshotRef = useRef(snapshotOf(createDoc("scratch")));
  const pendingRef = useRef<{ doc: TreeDoc; summary: string; trigger: VersionTrigger } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const keyMap = useMemo<KeyMap>(
    () => (doc ? computeKeyMap(doc) : { byNode: {}, collisions: [] }),
    [doc],
  );
  const findings = useMemo(
    () => (doc ? reviewTree(doc, keyMap) : []),
    [doc, keyMap],
  );

  const setDocState = useCallback((next: TreeDoc) => {
    docRef.current = next;
    setDoc(next);
  }, []);

  const toast = useCallback((kind: Toast["kind"], message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((current) => [...current.slice(-3), { id, kind, message }]);
    const timer = setTimeout(() => {
      setToasts((current) => current.filter((entry) => entry.id !== id));
      toastTimers.current.delete(id);
    }, 5000);
    toastTimers.current.set(id, timer);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((entry) => entry.id !== id));
    const timer = toastTimers.current.get(id);
    if (timer) clearTimeout(timer);
    toastTimers.current.delete(id);
  }, []);

  const refreshLibrary = useCallback(async () => {
    setLibrary(await db.listDocs());
  }, []);

  const persistSoon = useCallback((next: TreeDoc) => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      void db.putDoc(next).then(refreshLibrary);
    }, 300);
  }, [refreshLibrary]);

  const keysToRecord = (map: KeyMap): Record<string, string> =>
    Object.fromEntries(Object.entries(map.byNode).map(([id, info]) => [id, info.key]));

  /** Write the pending version entry now. Version numbers are assigned synchronously. */
  const flushVersion = useCallback(
    async (checkpointName?: string): Promise<void> => {
      const pending = pendingRef.current;
      if (!pending) return;
      pendingRef.current = null;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setPendingVersion(false);

      const v = versionRef.current + 1;
      versionRef.current = v;
      const at = Date.now();
      const nextKeys = computeKeyMap(pending.doc, undefined);
      const nextKeyRecord = keysToRecord(nextKeys);
      const snapshot = snapshotOf(pending.doc);
      const diff = diffSnapshots(
        { snapshot: lastSnapshotRef.current, keys: keysRef.current },
        { snapshot, keys: nextKeyRecord },
      );

      const aliases: KeyAlias[] = [];
      for (const [nodeId, newKey] of Object.entries(nextKeyRecord)) {
        const oldKey = keysRef.current[nodeId];
        if (oldKey && oldKey !== newKey) aliases.push({ nodeId, from: oldKey, to: newKey, v, at });
      }

      keysRef.current = nextKeyRecord;
      lastSnapshotRef.current = snapshot;

      const withVersion: TreeDoc = {
        ...pending.doc,
        version: v,
        updatedAt: at,
        aliases: [...pending.doc.aliases, ...aliases].slice(-ALIAS_CAP),
      };

      const entry: VersionEntry = {
        docId: pending.doc.id,
        v,
        at,
        trigger: pending.trigger,
        summary: checkpointName ? `checkpoint: ${checkpointName}` : diff.summary,
        checkpoint: checkpointName,
        snapshot,
        keys: nextKeyRecord,
        aliases,
      };

      setDocState(withVersion);
      setVersions((current) => [entry, ...current].slice(0, 200));
      setVersionCount((count) => count + 1);
      await db.putVersion(entry);
      await db.putDoc(withVersion);
      await db.pruneVersions(withVersion.id);
      await refreshLibrary();
    },
    [refreshLibrary, setDocState],
  );

  const queueVersion = useCallback(
    (next: TreeDoc, trigger: VersionTrigger, summary = "") => {
      if (trigger === "edit") {
        pendingRef.current = { doc: next, summary, trigger };
        setPendingVersion(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => void flushVersion(), EDIT_DEBOUNCE_MS);
        return;
      }
      pendingRef.current = { doc: next, summary, trigger };
      void flushVersion();
    },
    [flushVersion],
  );

  const commit = useCallback(
    (next: TreeDoc, trigger: VersionTrigger, summary = "") => {
      const previous = docRef.current;
      if (!previous) return;
      undoRef.current = [...undoRef.current.slice(-(UNDO_LIMIT - 1)), previous];
      redoRef.current = [];
      setUndoDepth(undoRef.current.length);
      setRedoDepth(0);
      const stamped = { ...next, updatedAt: Date.now() };
      setDocState(stamped);
      persistSoon(stamped);
      queueVersion(stamped, trigger, summary);
    },
    [persistSoon, queueVersion, setDocState],
  );

  const openDoc = useCallback(
    async (id: string) => {
      await flushVersion();
      const loaded = await db.getDoc(id);
      if (!loaded) {
        toast("error", "That tree could not be opened.");
        return;
      }
      undoRef.current = [];
      redoRef.current = [];
      setUndoDepth(0);
      setRedoDepth(0);
      setDocState(loaded);
      versionRef.current = loaded.version;
      lastSnapshotRef.current = snapshotOf(loaded);
      const map = computeKeyMap(loaded);
      keysRef.current = keysToRecord(map);
      setVersions(await db.listVersions(id, 200));
      setVersionCount(await db.countVersions(id));
      setSelection(loaded.rootId);
    },
    [flushVersion, setDocState, toast],
  );

  const createAndOpen = useCallback(
    async (next: TreeDoc) => {
      await flushVersion();
      await db.putDoc(next);
      const map = computeKeyMap(next);
      keysRef.current = keysToRecord(map);
      versionRef.current = next.version;
      lastSnapshotRef.current = snapshotOf(next);
      const entry: VersionEntry = {
        docId: next.id,
        v: next.version,
        at: Date.now(),
        trigger: "create",
        summary: "created",
        snapshot: snapshotOf(next),
        keys: keysRef.current,
        aliases: [],
      };
      await db.putVersion(entry);
      setDocState(next);
      setVersions([entry]);
      setVersionCount(1);
      setSelection(next.rootId);
      undoRef.current = [];
      redoRef.current = [];
      setUndoDepth(0);
      setRedoDepth(0);
      await refreshLibrary();
    },
    [flushVersion, refreshLibrary, setDocState],
  );

  const newDoc = useCallback(async () => {
    await createAndOpen(createDoc("Untitled issue tree"));
  }, [createAndOpen]);

  const loadSample = useCallback(
    async (sampleId: string) => {
      const sample = SAMPLES.find((entry) => entry.id === sampleId);
      if (!sample) return;
      const parsed = parseMarkdown(sample.markdown, sample.name);
      const next: TreeDoc = { ...parsed.doc, id: newId(), name: sample.name, version: 1 };
      await createAndOpen(next);
      if (parsed.warnings.length) toast("info", parsed.warnings[0]);
    },
    [createAndOpen, toast],
  );

  const renameDoc = useCallback(
    (name: string) => {
      const current = docRef.current;
      if (!current || name === current.name) return;
      commit(setDocName(current, name), "structure", "renamed");
    },
    [commit],
  );

  const duplicateDoc = useCallback(async () => {
    const current = docRef.current;
    if (!current) return;
    const copy: TreeDoc = {
      ...current,
      id: newId(),
      name: `${current.name} (copy)`,
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await createAndOpen(copy);
    toast("success", "Duplicated the tree.");
  }, [createAndOpen, toast]);

  const deleteDoc = useCallback(async () => {
    const current = docRef.current;
    if (!current) return;
    await db.deleteDoc(current.id);
    const remaining = await db.listDocs();
    setLibrary(remaining);
    if (remaining.length > 0) await openDoc(remaining[0].id);
    else await newDoc();
    toast("info", "Deleted the tree.");
  }, [newDoc, openDoc, toast]);

  const guard = useCallback((): TreeDoc | null => {
    const current = docRef.current;
    if (!current) return null;
    if (atCap(current)) {
      toast("error", "The 100-node cap is reached. Merge or delete a node first.");
      return null;
    }
    return current;
  }, [toast]);

  const addChild = useCallback(
    (parentId: string) => {
      const current = guard();
      if (!current) return;
      const result = addChildOp(current, parentId, "New question?");
      if (!result) return;
      commit(result.doc, "structure", "added a child");
      setSelection(result.id);
    },
    [commit, guard],
  );

  const addSibling = useCallback(
    (id: string) => {
      const current = guard();
      if (!current) return;
      const result = addSiblingOp(current, id, "New question?");
      if (!result) return;
      commit(result.doc, "structure", "added a sibling");
      setSelection(result.id);
    },
    [commit, guard],
  );

  const remove = useCallback(
    (id: string) => {
      const current = docRef.current;
      if (!current) return;
      const flat = flatten(current);
      const index = flat.findIndex((entry) => entry.node.id === id);
      const next = removeNode(current, id);
      if (next === current) return;
      commit(next, "structure", "deleted a node");
      const fallback = flat[Math.max(0, index - 1)]?.node.id ?? null;
      setSelection(flat.some((entry) => entry.node.id === fallback) ? fallback : null);
    },
    [commit],
  );

  const indent = useCallback(
    (id: string) => {
      const current = docRef.current;
      if (!current) return;
      const next = indentNode(current, id);
      if (next === current) return;
      commit(next, "structure", "indented a node");
    },
    [commit],
  );

  const outdent = useCallback(
    (id: string) => {
      const current = docRef.current;
      if (!current) return;
      const next = outdentNode(current, id);
      if (next === current) return;
      commit(next, "structure", "outdented a node");
    },
    [commit],
  );

  const move = useCallback(
    (id: string, parentId: string, index: number) => {
      const current = docRef.current;
      if (!current) return;
      const next = moveNode(current, id, parentId, index);
      if (next === current) return;
      commit(next, "structure", "moved a node");
    },
    [commit],
  );

  const editLabel = useCallback(
    (id: string, label: string) => {
      const current = docRef.current;
      if (!current) return;
      const next = updateLabel(current, id, label);
      if (next === current) return;
      commit(next, "edit", "edited a label");
    },
    [commit],
  );

  const setNote = useCallback(
    (id: string, note: string) => {
      const current = docRef.current;
      if (!current) return;
      commit(setNoteOp(current, id, note), "edit", "edited a note");
    },
    [commit],
  );

  const setMece = useCallback(
    (id: string, flags: MeceFlags) => {
      const current = docRef.current;
      if (!current) return;
      commit(setMeceOp(current, id, flags), "mece", "updated the MECE check");
    },
    [commit],
  );

  const setSettings = useCallback(
    (settings: Partial<DocSettings>) => {
      const current = docRef.current;
      if (!current) return;
      const next = setSettingsOp(current, settings);
      setDocState(next);
      persistSoon(next);
    },
    [persistSoon, setDocState],
  );

  const undo = useCallback(() => {
    const previous = undoRef.current.pop();
    const current = docRef.current;
    if (!previous || !current) return;
    redoRef.current = [...redoRef.current, current];
    setUndoDepth(undoRef.current.length);
    setRedoDepth(redoRef.current.length);
    setDocState(previous);
    persistSoon(previous);
    queueVersion(previous, "structure", "undo");
  }, [persistSoon, queueVersion, setDocState]);

  const redo = useCallback(() => {
    const next = redoRef.current.pop();
    const current = docRef.current;
    if (!next || !current) return;
    undoRef.current = [...undoRef.current, current];
    setUndoDepth(undoRef.current.length);
    setRedoDepth(redoRef.current.length);
    setDocState(next);
    persistSoon(next);
    queueVersion(next, "structure", "redo");
  }, [persistSoon, queueVersion, setDocState]);

  const checkpoint = useCallback(
    async (name: string) => {
      const current = docRef.current;
      if (!current) return;
      pendingRef.current = { doc: current, summary: `checkpoint: ${name}`, trigger: "checkpoint" };
      await flushVersion(name.trim() || "checkpoint");
      toast("success", "Checkpoint saved.");
    },
    [flushVersion, toast],
  );

  const restoreVersion = useCallback(
    async (v: number) => {
      const current = docRef.current;
      if (!current) return;
      const entry = await db.getVersion(current.id, v);
      if (!entry) {
        toast("error", "That version is no longer stored.");
        return;
      }
      await flushVersion();
      const base = docRef.current;
      if (!base) return;
      const restored = { ...docFromSnapshot({ ...base, version: base.version }, entry.snapshot) };
      undoRef.current = [...undoRef.current, base];
      redoRef.current = [];
      setUndoDepth(undoRef.current.length);
      setRedoDepth(0);
      setDocState(restored);
      persistSoon(restored);
      pendingRef.current = { doc: restored, summary: `restored version ${v}`, trigger: "restore" };
      await flushVersion();
      toast("success", `Restored version ${v} as a new version.`);
    },
    [flushVersion, persistSoon, setDocState, toast],
  );

  const importAsNew = useCallback(
    async (text: string, format: ImportFormat, name?: string) => {
      let next: TreeDoc;
      let warnings: string[] = [];
      if (format === "markdown") {
        const parsed = parseMarkdown(text, name ?? "Imported outline");
        next = parsed.doc;
        warnings = parsed.warnings;
      } else if (format === "csv") {
        const parsed = importCsv(text, name ?? "Imported CSV");
        next = parsed.doc;
        warnings = parsed.warnings;
      } else {
        const parsed = parseProject(text);
        if (!parsed) {
          toast("error", "That JSON is not an Issue Tree Studio project.");
          return;
        }
        next = parsed;
      }
      next = { ...next, id: newId(), name: name ?? next.name, version: 1 };
      await createAndOpen(next);
      const total = countNodes(next);
      toast("success", `Imported ${total} node${total === 1 ? "" : "s"}.`);
      if (warnings.length) {
        toast("info", warnings.slice(0, 2).join(" "));
      }
    },
    [createAndOpen, toast],
  );

  const exportProject = useCallback(async () => {
    const current = docRef.current;
    if (!current) return "{}";
    const all = await db.getAllVersions(current.id);
    return JSON.stringify(
      { app: "issue-tree-studio", schema: 1, exportedAt: new Date().toISOString(), doc: current, versions: all },
      null,
      2,
    );
  }, []);

  const reloadVersions = useCallback(async (limit = 500) => {
    const current = docRef.current;
    if (!current) return;
    setVersions(await db.listVersions(current.id, limit));
    setVersionCount(await db.countVersions(current.id));
  }, []);

  const downloadCsv = useCallback(() => {
    const current = docRef.current;
    if (!current) return;
    const map = computeKeyMap(current);
    const text = exportCsv(current, map);
    const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${current.name.replace(/[^\w-]+/g, "-").toLowerCase()}-v${current.version}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast("success", "CSV downloaded.");
  }, [toast]);

  const downloadMarkdown = useCallback(() => {
    const current = docRef.current;
    if (!current) return;
    const blob = new Blob([toMarkdown(current)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${current.name.replace(/[^\w-]+/g, "-").toLowerCase()}-v${current.version}.md`;
    link.click();
    URL.revokeObjectURL(url);
    toast("success", "Markdown downloaded.");
  }, [toast]);

  // First load: open the most recent tree, or create one.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const docs = await db.listDocs();
      if (cancelled) return;
      setLibrary(docs);
      if (docs.length > 0) {
        const latest = await db.getDoc(docs[0].id);
        if (latest && !cancelled) {
          setDocState(latest);
          versionRef.current = latest.version;
          lastSnapshotRef.current = snapshotOf(latest);
          keysRef.current = keysToRecord(computeKeyMap(latest));
          setVersions(await db.listVersions(latest.id, 200));
          setVersionCount(await db.countVersions(latest.id));
          setSelection(latest.rootId);
        }
      } else {
        const fresh = createDoc("Profit decline 20%");
        await createAndOpen(fresh);
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the latest doc when the tab is hidden or closed.
  useEffect(() => {
    const onHide = (): void => {
      const current = docRef.current;
      if (current) void db.putDoc(current);
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, []);

  const defaults: DocSettings = doc?.settings ?? DEFAULT_SETTINGS;

  return {
    ready,
    library,
    doc,
    keyMap,
    findings,
    findingCounts: findingCounts(findings),
    versions,
    versionCount,
    pendingVersion,
    selection,
    toasts,
    nodeCount: doc ? countNodes(doc) : 0,
    atCap: doc ? atCap(doc) : false,
    canUndo: undoDepth > 0,
    canRedo: redoDepth > 0,
    openDoc,
    newDoc,
    loadSample,
    renameDoc,
    duplicateDoc,
    deleteDoc,
    addChild,
    addSibling,
    remove,
    indent,
    outdent,
    move,
    editLabel,
    setNote,
    setMece,
    setSettings: (settings) => setSettings({ ...defaults, ...settings }),
    undo,
    redo,
    select: setSelection,
    toast,
    dismissToast,
    checkpoint,
    restoreVersion,
    importAsNew,
    exportProject,
    downloadCsv,
    downloadMarkdown,
    reloadVersions,
  };
}
