/** Core data model for Issue Tree Studio. */

export type ItemStatus = "open" | "complete";

export const ITEM_STATUSES: ItemStatus[] = ["open", "complete"];

export interface TreeItem {
  id: string;
  label: string;
  status: ItemStatus;
  /** Child ids in display order. */
  children: string[];
}

export interface DocSettings {
  showKeysInEditor: boolean;
  showKeysInExport: boolean;
  includeOverviewSlide: boolean;
  includeKeyIndexSlide: boolean;
}

export interface TreeDoc {
  id: string;
  name: string;
  rootId: string | null;
  items: Record<string, TreeItem>;
  /** Increments on every committed change. */
  version: number;
  createdAt: number;
  updatedAt: number;
  settings: DocSettings;
}

export type VersionTrigger =
  | "create"
  | "edit"
  | "structure"
  | "type"
  | "status"
  | "import"
  | "restore"
  | "checkpoint";

export interface VersionEntry {
  docId: string;
  v: number;
  at: number;
  trigger: VersionTrigger;
  summary: string;
  checkpoint?: string;
  snapshot: DocSnapshot;
  keys: Record<string, string>;
}

export interface DocSnapshot {
  name: string;
  rootId: string | null;
  items: Record<string, TreeItem>;
  settings: DocSettings;
}

export interface ItemKey {
  itemId: string;
  key: string;
  length: number;
  /** Normalised ancestor chain including this item, joined by a unit separator. */
  path: string;
  /** Keys of the ancestor chain, ending with this item's key. */
  pathKeys: string[];
  digestHex: string;
  /** True when the key needed more than the six default characters. */
  promoted: boolean;
  depth: number;
}

export interface KeyMap {
  byItem: Record<string, ItemKey>;
  collisions: { key: string; itemIds: string[] }[];
}

export interface FlatItem {
  item: TreeItem;
  depth: number;
  parentId: string | null;
  index: number;
  /** Readable label path, e.g. "Why did profit fall? / Revenue / Price". */
  labelPath: string;
}

export interface DocSummary {
  id: string;
  name: string;
  version: number;
  updatedAt: number;
  itemCount: number;
}

/** Past this size the tree is hard to read. A nudge, never a block. */
export const SOFT_CAP = 100;
/** Hard stop: above this the UI and the deck stop being usable. */
export const ITEM_CAP = 500;
export const HISTORY_CAP = 5000;

export const DEFAULT_SETTINGS: DocSettings = {
  showKeysInEditor: true,
  showKeysInExport: true,
  includeOverviewSlide: true,
  includeKeyIndexSlide: false,
};
