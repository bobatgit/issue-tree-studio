/** Core data model for Issue Tree Studio. */

export interface MeceFlags {
  /** The children together cover everything that could explain or achieve the parent. */
  exhaustive?: boolean;
  /** No two children describe the same thing. */
  exclusive?: boolean;
}

export type NodeStatus = "open" | "complete";

export const NODE_STATUSES: NodeStatus[] = ["open", "complete"];

export interface TreeNode {
  id: string;
  label: string;
  status: NodeStatus;
  /** Child ids in display order. */
  children: string[];
  note?: string;
  mece?: MeceFlags;
}

export interface DocSettings {
  showKeysInEditor: boolean;
  showKeysInExport: boolean;
  includeOverviewSlide: boolean;
  includeKeyIndexSlide: boolean;
}

export interface KeyAlias {
  nodeId: string;
  from: string;
  to: string;
  /** Version at which the key changed. */
  v: number;
  at: number;
}

export interface TreeDoc {
  id: string;
  name: string;
  rootId: string | null;
  nodes: Record<string, TreeNode>;
  /** Increments on every committed change. */
  version: number;
  createdAt: number;
  updatedAt: number;
  settings: DocSettings;
  /** Old key -> new key history, newest last. */
  aliases: KeyAlias[];
}

export type VersionTrigger =
  | "create"
  | "edit"
  | "structure"
  | "type"
  | "mece"
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
  /** Aliases created by this version. */
  aliases?: KeyAlias[];
}

export interface DocSnapshot {
  name: string;
  rootId: string | null;
  nodes: Record<string, TreeNode>;
  settings: DocSettings;
}

export interface NodeKey {
  nodeId: string;
  key: string;
  length: number;
  /** Normalised ancestor chain including this node, joined by a unit separator. */
  path: string;
  /** Keys of the ancestor chain, ending with this node's key. */
  pathKeys: string[];
  digestHex: string;
  /** True when the key needed more than the default 4 characters. */
  promoted: boolean;
  depth: number;
}

export interface KeyMap {
  byNode: Record<string, NodeKey>;
  collisions: { key: string; nodeIds: string[] }[];
}

export interface FlatNode {
  node: TreeNode;
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
  nodeCount: number;
}

/** Past this size the tree is hard to read. A nudge, never a block. */
export const SOFT_CAP = 100;
/** Hard stop: above this the UI and the deck stop being usable. */
export const NODE_CAP = 500;
export const HISTORY_CAP = 5000;
export const ALIAS_CAP = 2000;

export const DEFAULT_SETTINGS: DocSettings = {
  showKeysInEditor: true,
  showKeysInExport: true,
  includeOverviewSlide: true,
  includeKeyIndexSlide: false,
};
