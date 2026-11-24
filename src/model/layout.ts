/**
 * One layout engine for both the on-screen SVG preview and the PowerPoint
 * export, so the picture on screen matches the slide.
 *
 * All coordinates are inches, the unit PptxGenJS uses. The SVG preview scales
 * them with a viewBox.
 */

import type { KeyMap, NodeType, TreeDoc } from "./types";

export interface LayoutOptions {
  maxWidth: number;
  maxHeight: number;
  boxWidth?: number;
  gapX?: number;
  gapY?: number;
  fontSize?: number;
  maxLines?: number;
  showKeys?: boolean;
  showTypes?: boolean;
}

export interface LayoutNode {
  id: string;
  label: string;
  type: NodeType;
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
  lines: string[];
  fontSize: number;
}

export interface LayoutEdge {
  id: string;
  points: { x: number; y: number }[];
}

export interface LayoutResult {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
  boxW: number;
  boxH: number;
  fontSize: number;
  metaH: number;
  rowPitch: number;
  leaves: number;
}

const PAD_X = 0.09;
const PAD_Y = 0.07;

export function wrapText(label: string, charsPerLine: number, maxLines: number): string[] {
  const words = label.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  let index = 0;
  while (index < words.length) {
    const word = words[index];
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= charsPerLine) {
      current = candidate;
      index += 1;
      continue;
    }
    if (current) {
      lines.push(current);
      current = "";
      if (lines.length >= maxLines) break;
      continue;
    }
    // A single word longer than the line.
    lines.push(truncateWord(word, charsPerLine));
    index += 1;
    if (lines.length >= maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (index < words.length) {
    const last = lines.length - 1;
    lines[last] = addEllipsis(lines[last], charsPerLine);
  }
  return lines.slice(0, maxLines);
}

function addEllipsis(line: string, charsPerLine: number): string {
  const limit = Math.max(2, charsPerLine);
  const base = line.replace(/[.,;:]$/, "");
  return `${base.slice(0, Math.max(1, limit - 1))}…`;
}

function truncateWord(word: string, charsPerLine: number): string {
  const limit = Math.max(2, charsPerLine);
  if (word.length < limit) return word;
  return addEllipsis(word, charsPerLine);
}

export function estimateCharsPerLine(boxWidth: number, fontSize: number): number {
  const usable = Math.max(0.2, boxWidth - PAD_X * 2);
  return Math.max(6, Math.floor(usable / ((fontSize * 0.52) / 72)));
}

export function layoutTree(
  doc: TreeDoc,
  keyMap: KeyMap,
  nodeIds: string[] | null,
  options: LayoutOptions,
): LayoutResult {
  const included = nodeIds ? new Set(nodeIds) : null;
  const gapX = options.gapX ?? 0.38;
  const gapY = options.gapY ?? 0.16;
  const showKeys = options.showKeys ?? true;
  const showTypes = options.showTypes ?? true;

  interface Entry {
    id: string;
    depth: number;
    parentId: string | null;
    children: string[];
    label: string;
    type: NodeType;
    key: string;
  }

  const entries = new Map<string, Entry>();
  let maxDepth = 1;
  const collect = (id: string, depth: number, parentId: string | null): void => {
    if (entries.has(id)) return;
    if (included && !included.has(id)) return;
    const node = doc.nodes[id];
    if (!node) return;
    entries.set(id, {
      id,
      depth,
      parentId,
      children: node.children.filter((childId) => !included || included.has(childId)),
      label: node.label,
      type: node.type,
      key: keyMap.byNode[id]?.key ?? "----",
    });
    maxDepth = Math.max(maxDepth, depth);
    for (const childId of node.children) collect(childId, depth + 1, id);
  };
  if (doc.rootId) collect(doc.rootId, 1, null);
  for (const id of Object.keys(doc.nodes)) if (!entries.has(id)) collect(id, 1, null);
  if (entries.size === 0) {
    return {
      nodes: [],
      edges: [],
      width: 0,
      height: 0,
      boxW: 1,
      boxH: 0.4,
      fontSize: 9,
      metaH: 0,
      rowPitch: 0.5,
      leaves: 0,
    };
  }

  const depths = Math.max(1, maxDepth);
  const boxWidth =
    options.boxWidth ?? clamp((options.maxWidth - (depths - 1) * gapX) / depths, 0.95, 3.1);
  const fontSize = options.fontSize ?? fontSizeForBox(boxWidth);
  const maxLines = options.maxLines ?? 4;
  const charsPerLine = estimateCharsPerLine(boxWidth, fontSize);
  const lineHeight = (fontSize * 1.24) / 72;
  const metaH = showKeys || showTypes ? Math.max(0.15, fontSize / 72 + 0.06) : 0;

  let linesByNode = new Map<string, string[]>();
  for (const entry of entries.values()) {
    linesByNode.set(entry.id, wrapText(entry.label, charsPerLine, maxLines));
  }

  const contentH = (lines: string[]): number => PAD_Y * 2 + metaH + lines.length * lineHeight;
  let boxH = Math.max(...[...linesByNode.values()].map(contentH), 0.3);

  // Leaf rows drive the height.
  const leafEntries = [...entries.values()].filter((entry) => entry.children.length === 0);
  const leaves = Math.max(1, leafEntries.length);
  let rowPitch = boxH + gapY;
  const totalHeight = (): number => (leaves - 1) * rowPitch + boxH;

  if (totalHeight() > options.maxHeight) {
    // 1) Close the vertical gaps first.
    rowPitch = Math.max(boxH + 0.02, (options.maxHeight - boxH) / Math.max(1, leaves - 1));
    if (totalHeight() > options.maxHeight) {
      // 2) Shrink the boxes evenly so the whole tree still fits the slide.
      boxH = Math.max(0.12, (options.maxHeight - (leaves - 1) * 0.02) / leaves);
      const allowedLines = Math.max(1, Math.floor((boxH - PAD_Y * 2 - metaH) / lineHeight));
      linesByNode = new Map(
        [...linesByNode.entries()].map(([id, lines]) => [id, clipLines(lines, allowedLines)]),
      );
      rowPitch = Math.max(0.02, (options.maxHeight - boxH) / Math.max(1, leaves - 1));
    }
  }
  // Guarantee the fit even at extreme density.
  if (totalHeight() > options.maxHeight && boxH <= options.maxHeight) {
    rowPitch = Math.max(0.01, (options.maxHeight - boxH) / Math.max(1, leaves - 1));
  }

  const centerY = new Map<string, number>();
  let cursor = 0;
  const place = (id: string): number => {
    const entry = entries.get(id);
    if (!entry) return 0;
    if (entry.children.length === 0) {
      const y = cursor * rowPitch + boxH / 2;
      cursor += 1;
      centerY.set(id, y);
      return y;
    }
    const childYs = entry.children.map(place).filter((value) => Number.isFinite(value));
    const y = childYs.length ? (Math.min(...childYs) + Math.max(...childYs)) / 2 : cursor * rowPitch + boxH / 2;
    centerY.set(id, y);
    return y;
  };
  const roots = [...entries.values()].filter((entry) => !entry.parentId);
  roots.forEach((entry) => place(entry.id));

  const nodes: LayoutNode[] = [];
  for (const entry of entries.values()) {
    const cy = centerY.get(entry.id) ?? 0;
    nodes.push({
      id: entry.id,
      label: entry.label,
      type: entry.type,
      key: entry.key,
      x: (entry.depth - 1) * (boxWidth + gapX),
      y: cy - boxH / 2,
      w: boxWidth,
      h: boxH,
      depth: entry.depth,
      lines: linesByNode.get(entry.id) ?? [entry.label],
      fontSize,
    });
  }

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const edges: LayoutEdge[] = [];
  for (const entry of entries.values()) {
    const parent = byId.get(entry.id);
    if (!parent) continue;
    for (const childId of entry.children) {
      const child = byId.get(childId);
      if (!child) continue;
      const startX = parent.x + parent.w;
      const startY = parent.y + parent.h / 2;
      const endX = child.x;
      const endY = child.y + child.h / 2;
      const midX = startX + (endX - startX) / 2;
      edges.push({
        id: `${entry.id}-${childId}`,
        points: [
          { x: startX, y: startY },
          { x: midX, y: startY },
          { x: midX, y: endY },
          { x: endX, y: endY },
        ],
      });
    }
  }

  const width = depths * boxWidth + (depths - 1) * gapX;
  const height = Math.min((leaves - 1) * rowPitch + boxH, options.maxHeight);

  return { nodes, edges, width, height, boxW: boxWidth, boxH, fontSize, metaH, rowPitch, leaves };
}

function clipLines(lines: string[], allowed: number): string[] {
  if (lines.length <= allowed) return lines;
  const kept = lines.slice(0, Math.max(1, allowed));
  const last = kept[kept.length - 1];
  kept[kept.length - 1] = `${last.replace(/[.,;:]$/, "").slice(0, Math.max(1, last.length - 1))}…`;
  return kept;
}

function fontSizeForBox(boxWidth: number): number {
  if (boxWidth >= 2.6) return 10;
  if (boxWidth >= 2.1) return 9;
  if (boxWidth >= 1.7) return 8;
  if (boxWidth >= 1.4) return 7;
  return 6;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export interface SlideGroup {
  title: string;
  nodeIds: string[];
  /** Root is repeated as context on branch slides. */
  includeRoot: boolean;
}

export interface PackOptions {
  maxNodesPerSlide?: number;
  maxLeavesPerSlide?: number;
  maxDepth?: number;
  overview?: boolean;
}

/**
 * Pack the tree into slides. The overview slide carries everything; branch
 * slides then group several top-level branches together so two to four levels
 * share a slide instead of splitting one branch per slide.
 */
export function packSlides(doc: TreeDoc, options: PackOptions = {}): SlideGroup[] {
  const maxNodes = options.maxNodesPerSlide ?? 34;
  const maxLeaves = options.maxLeavesPerSlide ?? 16;
  const maxDepth = options.maxDepth ?? 4;
  const groups: SlideGroup[] = [];
  const allIds = Object.keys(doc.nodes);

  if (options.overview !== false) {
    groups.push({
      title: doc.nodes[doc.rootId ?? ""]?.label ?? doc.name,
      nodeIds: allIds,
      includeRoot: true,
    });
  }

  const root = doc.rootId ? doc.nodes[doc.rootId] : null;
  if (!root) return groups;

  const branches = root.children.filter((id) => doc.nodes[id]);
  if (branches.length === 0) return groups;

  const depthOf = (id: string): number => {
    let depth = 0;
    let cursor: string | null = id;
    while (cursor && doc.nodes[cursor]) {
      depth += 1;
      cursor = parentIdOf(doc, cursor);
      if (depth > 20) break;
    }
    return depth;
  };

  const stats = (ids: string[]): { nodes: number; leaves: number; depth: number } => {
    let nodes = 0;
    let leaves = 0;
    let depth = 0;
    for (const id of ids) {
      const node = doc.nodes[id];
      if (!node) continue;
      nodes += 1;
      if (node.children.length === 0) leaves += 1;
      depth = Math.max(depth, depthOf(id) - depthOf(root.id) + 1);
    }
    return { nodes, leaves, depth };
  };

  let current: string[] = [];
  let currentStats = { nodes: 0, leaves: 0, depth: 0 };
  const flush = (): void => {
    if (current.length === 0) return;
    const labels = current
      .map((id) => doc.nodes[id]?.label ?? "")
      .filter(Boolean)
      .slice(0, 2)
      .join(" · ");
    groups.push({
      title: current.length > 2 ? `${labels} + ${current.length - 2} more` : labels,
      nodeIds: [root.id, ...current],
      includeRoot: true,
    });
    current = [];
    currentStats = { nodes: 0, leaves: 0, depth: 0 };
  };

  for (const branchId of branches) {
    const ids = [branchId, ...descendants(doc, branchId)];
    const branchStats = stats(ids);
    const next = {
      nodes: currentStats.nodes + branchStats.nodes,
      leaves: currentStats.leaves + branchStats.leaves,
      depth: Math.max(currentStats.depth, branchStats.depth),
    };
    const fits = next.nodes <= maxNodes && next.leaves <= maxLeaves && next.depth <= maxDepth;
    if (current.length > 0 && !fits) flush();
    current = [...current, ...ids];
    currentStats = {
      nodes: currentStats.nodes + branchStats.nodes,
      leaves: currentStats.leaves + branchStats.leaves,
      depth: Math.max(currentStats.depth, branchStats.depth),
    };
    if (currentStats.nodes >= maxNodes || currentStats.leaves >= maxLeaves) flush();
  }
  flush();
  return groups;
}

function descendants(doc: TreeDoc, id: string): string[] {
  const out: string[] = [];
  const walk = (nodeId: string): void => {
    const node = doc.nodes[nodeId];
    if (!node) return;
    for (const childId of node.children) {
      if (out.includes(childId)) continue;
      out.push(childId);
      walk(childId);
    }
  };
  walk(id);
  return out;
}

function parentIdOf(doc: TreeDoc, id: string): string | null {
  for (const node of Object.values(doc.nodes)) {
    if (node.children.includes(id)) return node.id;
  }
  return null;
}
