/** Workspace state: documents, editing, undo, versions, persistence. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { exportCsv } from "../model/csv";
import { diffSnapshots } from "../model/diff";
import { computeKeyMap } from "../model/keys";
import { parseMarkdown, toMarkdown } from "../model/markdown";
import { noteStripping, strippingNote } from "../model/diagnostics";
import { mergeParsed } from "../model/apply";
import { importCsv } from "../model/csv";
import { findingCounts, reviewTree, type Finding } from "../model/quality";
import { SAMPLES } from "../model/sample";
import {
  addChild as addChildOp,
  addSibling as addSiblingOp,
  atCap,
  countItems,
  createDoc,
  docFromSnapshot,
  descendantIds,
  flatten,
  indentItem,
  moveItem,
  newId,
  outdentItem,
  parentOf,
  removeItem,
  setMece as setMeceOp,
  setNote as setNoteOp,
  setSettings as setSettingsOp,
  setStatus as setStatusOp,
  snapshotOf,
  titleOf,
  updateLabel,
} from "../model/tree";
import type {
  DocSettings,
  KeyMap,
  MeceFlags,
  ItemStatus,
  TreeDoc,
  VersionEntry,
  VersionTrigger,
} from "../model/types";
import { DEFAULT_SETTINGS, ITEM_CAP } from "../model/types";
import { parseProject } from "../model/project";
import * as db from "./storage";
import { migrateLegacy } from "./storage";

export interface Toast {
  id: string;
  kind: "info" | "error" | "success";
  message: string;
}

export type ImportFormat = "markdown" | "csv" | "json";

export interface Workspace {
  ready: boolean;
  doc: TreeDoc | null;
  keyMap: KeyMap;
  findings: Finding[];
  findingCounts: Record<"error" | "warn" | "info", number>;
  versions: VersionEntry[];
  versionCount: number;
  pendingVersion: boolean;
  selection: string | null;
  toasts: Toast[];
  itemCount: number;
  atCap: boolean;
  canUndo: boolean;
  canRedo: boolean;
  loadSample: (sampleId: string) => Promise<void>;
  addChild: (parentId: string) => void;
  addSibling: (id: string) => void;
  remove: (id: string) => void;
  indent: (id: string) => void;
  outdent: (id: string) => void;
  move: (id: string, parentId: string, index: number) => void;
  editLabel: (id: string, label: string) => void;
  setStatus: (id: string, status: ItemStatus) => void;
  applyMarkdown: (text: string) => boolean;
  setNote: (id: string, note: string) => void;
  collapsed: Set<string>;
  toggleCollapse: (id: string) => void;
  setBranchCollapsed: (id: string, value: boolean) => void;
  collapseAll: () => void;
  expandAll: () => void;
  expandAncestors: (id: string) => void;
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
  const [doc, setDoc] = useState<TreeDoc | null>(null);
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [versionCount, setVersionCount] = useState(0);
  const [pendingVersion, setPendingVersion] = useState(false);
  const [selection, setSelection] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      const raw = sessionStorage.getItem("its.collapsed");
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem("its.collapsed", JSON.stringify([...collapsed]));
    } catch {
      // Storage can be unavailable; the view still works for this page.
    }
  }, [collapsed]);
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
    () => (doc ? computeKeyMap(doc) : { byItem: {}, collisions: [] }),
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

  const persistSoon = useCallback((next: TreeDoc) => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      void db.putDoc(next);
    }, 300);
  }, []);

  const keysToRecord = (map: KeyMap): Record<string, string> =>
    Object.fromEntries(Object.entries(map.byItem).map(([id, info]) => [id, info.key]));

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

      keysRef.current = nextKeyRecord;
      lastSnapshotRef.current = snapshot;

      const withVersion: TreeDoc = {
        ...pending.doc,
        version: v,
        updatedAt: at,
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
      };

      setDocState(withVersion);
      setVersions((current) => [entry, ...current].slice(0, 200));
      setVersionCount((count) => count + 1);
      await db.putVersion(entry);
      await db.putDoc(withVersion);
      await db.pruneVersions(withVersion.id);
    },
    [setDocState],
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
      const stamped = { ...next, name: titleOf(next), updatedAt: Date.now() };
      setDocState(stamped);
      persistSoon(stamped);
      queueVersion(stamped, trigger, summary);
    },
    [persistSoon, queueVersion, setDocState],
  );

  const createAndOpen = useCallback(
    async (next: TreeDoc) => {
      await flushVersion();
      const titled = { ...next, name: titleOf(next) };
      await db.putDoc(titled);
      const map = computeKeyMap(titled);
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
    },
    [flushVersion, setDocState],
  );

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

  const guard = useCallback((): TreeDoc | null => {
    const current = docRef.current;
    if (!current) return null;
    if (atCap(current)) {
      toast("error", `The ${ITEM_CAP}-item cap is reached. Merge or delete an item first.`);
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
      const index = flat.findIndex((entry) => entry.item.id === id);
      const next = removeItem(current, id);
      if (next === current) return;
      commit(next, "structure", "deleted an item");
      const fallback = flat[Math.max(0, index - 1)]?.item.id ?? null;
      setSelection(flat.some((entry) => entry.item.id === fallback) ? fallback : null);
    },
    [commit],
  );

  const indent = useCallback(
    (id: string) => {
      const current = docRef.current;
      if (!current) return;
      const next = indentItem(current, id);
      if (next === current) return;
      commit(next, "structure", "indented an item");
    },
    [commit],
  );

  const outdent = useCallback(
    (id: string) => {
      const current = docRef.current;
      if (!current) return;
      const next = outdentItem(current, id);
      if (next === current) return;
      commit(next, "structure", "outdented an item");
    },
    [commit],
  );

  const move = useCallback(
    (id: string, parentId: string, index: number) => {
      const current = docRef.current;
      if (!current) return;
      const next = moveItem(current, id, parentId, index);
      if (next === current) return;
      commit(next, "structure", "moved an item");
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

  const setStatus = useCallback(
    (id: string, status: ItemStatus) => {
      const current = docRef.current;
      if (!current) return;
      const item = current.items[id];
      if (!item || item.status === status) return;
      commit(
        setStatusOp(current, id, status),
        "status",
        status === "complete" ? "marked an item complete" : "reopened an item",
      );
    },
    [commit],
  );

  const applyMarkdown = useCallback(
    (text: string): boolean => {
      const current = docRef.current;
      if (!current) return false;
      if (!text.trim()) {
        toast("error", "The outline is empty. Revert to keep the tree.");
        return false;
      }
      const parsedResult = parseMarkdown(text, current.name);
      const parsed = parsedResult.doc;
      const merged = mergeParsed(current, parsed);
      const total = countItems(merged);
      if (total === 0) {
        toast("error", "The outline has no items.");
        return false;
      }
      if (total > ITEM_CAP) {
        toast("error", `That outline has ${total} items. The cap is ${ITEM_CAP}.`);
        return false;
      }
      if (parsedResult.stripped.length > 0) {
        noteStripping(parsedResult.stripped);
        toast("info", strippingNote(parsedResult.stripped));
      }
      commit(merged, "import", "applied markdown");
      setSelection(merged.rootId);
      toast("success", `Applied the outline: ${total} item${total === 1 ? "" : "s"}.`);
      return true;
    },
    [commit, toast],
  );

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const setBranchCollapsed = useCallback((id: string, value: boolean) => {
    const current = docRef.current;
    if (!current) return;
    const ids = descendantIds(current, id);
    setCollapsed((previous) => {
      const next = new Set(previous);
      for (const childId of ids) {
        if (value) next.add(childId);
        else next.delete(childId);
      }
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => {
    const current = docRef.current;
    if (!current?.rootId) return;
    setCollapsed(new Set(current.items[current.rootId]?.children ?? []));
  }, []);

  const expandAll = useCallback(() => setCollapsed(new Set()), []);

  const expandAncestors = useCallback((id: string) => {
    const current = docRef.current;
    if (!current) return;
    const ancestors: string[] = [];
    let parent = parentOf(current, id);
    while (parent) {
      ancestors.push(parent);
      parent = parentOf(current, parent);
    }
    if (ancestors.length === 0) return;
    setCollapsed((previous) => {
      if (!ancestors.some((ancestor) => previous.has(ancestor))) return previous;
      const next = new Set(previous);
      for (const ancestor of ancestors) next.delete(ancestor);
      return next;
    });
  }, []);

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
        if (parsed.stripped.length > 0) {
          noteStripping(parsed.stripped);
          toast("info", strippingNote(parsed.stripped));
        }
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
      const total = countItems(next);
      toast("success", `Imported ${total} item${total === 1 ? "" : "s"}.`);
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
      const migration = await migrateLegacy();
      if (migration.archive) {
        const blob = new Blob([migration.archive], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "issue-tree-studio-archive.json";
        link.click();
        URL.revokeObjectURL(url);
      }
      if (migration.adopted && !cancelled) {
        toast(
          "info",
          `Adopted "${migration.adopted}"${migration.archived ? ` and archived ${migration.archived} older tree${migration.archived === 1 ? "" : "s"}` : ""}.`,
        );
      }
      const docs = await db.listDocs();
      if (cancelled) return;
      if (docs.length > 0) {
        const latest = await db.getDoc(docs[0].id);
        if (latest && !cancelled) {
          const titled = { ...latest, name: titleOf(latest) };
          setDocState(titled);
          versionRef.current = titled.version;
          lastSnapshotRef.current = snapshotOf(titled);
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
    doc,
    keyMap,
    findings,
    findingCounts: findingCounts(findings),
    versions,
    versionCount,
    pendingVersion,
    selection,
    toasts,
    itemCount: doc ? countItems(doc) : 0,
    atCap: doc ? atCap(doc) : false,
    canUndo: undoDepth > 0,
    canRedo: redoDepth > 0,
    loadSample,
    addChild,
    addSibling,
    remove,
    indent,
    outdent,
    move,
    editLabel,
    setStatus,
    applyMarkdown,
    collapsed,
    toggleCollapse,
    setBranchCollapsed,
    collapseAll,
    expandAll,
    expandAncestors,
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
