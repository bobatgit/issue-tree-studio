/**
 * PowerPoint export: native, editable shapes.
 *
 * Slide 1 is a structure overview (the whole tree when it stays legible, the
 * first levels when it does not). Branch slides then pack several top-level
 * branches together so two to five levels share a slide.
 */

import PptxGenJS from "pptxgenjs";
import { computeKeyMap } from "../model/keys";
import { layoutTree, packSlides, type LayoutItem, type LayoutResult } from "../model/layout";
import type { KeyMap, TreeDoc } from "../model/types";

export interface PptxExportOptions {
  showKeys: boolean;
  includeOverview: boolean;
  includeKeyIndex: boolean;
}

const SLIDE_W = 13.333;
const SLIDE_H = 7.5;
const MARGIN_X = 0.5;
const CONTENT_TOP = 0.98;
const CONTENT_BOTTOM = 0.5;
const CONTENT_W = SLIDE_W - MARGIN_X * 2;
const CONTENT_H = SLIDE_H - CONTENT_TOP - CONTENT_BOTTOM;

const ITEM_STYLE = { fill: "F8FAFC", border: "94A3B8", text: "1E293B" };

const ROOT_STYLE = { fill: "1E293B", border: "0F172A", text: "FFFFFF" };
const EDGE_COLOR = "B8C4D4";
const MUTED = "64748B";

function overviewIds(doc: TreeDoc): { ids: string[]; levels: number; complete: boolean } {
  const total = Object.keys(doc.items).length;
  const depthOf = new Map<string, number>();
  const walk = (id: string, depth: number): void => {
    const item = doc.items[id];
    if (!item || depthOf.has(id)) return;
    depthOf.set(id, depth);
    for (const childId of item.children) walk(childId, depth + 1);
  };
  if (doc.rootId) walk(doc.rootId, 1);

  // The overview must stay legible: at most 16 leaf rows and 30 boxes.
  const leafCountOf = (ids: string[]): number => {
    const set = new Set(ids);
    return ids.filter((id) => (doc.items[id]?.children ?? []).every((childId) => !set.has(childId))).length;
  };

  let best: { ids: string[]; levels: number } | null = null;
  for (const levels of [5, 4, 3, 2]) {
    const ids = Object.keys(doc.items).filter((id) => (depthOf.get(id) ?? 99) <= levels);
    if (ids.length > 30 || leafCountOf(ids) > 16) continue;
    best = { ids, levels };
    break;
  }

  if (best && best.ids.length === total) return { ...best, complete: true };
  if (best) return { ...best, complete: false };

  // Root alone with its first branches, as a last resort.
  const ids = Object.keys(doc.items).filter((id) => (depthOf.get(id) ?? 99) <= 2).slice(0, 30);
  return { ids, levels: 2, complete: false };
}

function overviewFontSize(itemCount: number): number {
  if (itemCount <= 14) return 11;
  if (itemCount <= 22) return 9.5;
  if (itemCount <= 30) return 8.5;
  if (itemCount <= 38) return 7.5;
  return 6.8;
}

type Slide = ReturnType<PptxGenJS["addSlide"]>;

function addFooter(
  slide: Slide,
  doc: TreeDoc,
  page: number,
  total: number,
  note: string,
): void {
  const stamp = new Date().toISOString().slice(0, 10);
  slide.addText(
    `${doc.name}  ·  version ${doc.version}  ·  ${stamp}  ·  ${note}`,
    {
      x: MARGIN_X,
      y: SLIDE_H - 0.38,
      w: CONTENT_W - 1.4,
      h: 0.24,
      fontSize: 8,
      color: MUTED,
      fontFace: "Segoe UI",
    },
  );
  slide.addText(`${page} / ${total}`, {
    x: SLIDE_W - MARGIN_X - 1.2,
    y: SLIDE_H - 0.38,
    w: 1.2,
    h: 0.24,
    fontSize: 8,
    color: MUTED,
    align: "right",
    fontFace: "Segoe UI",
  });
}

function addTitle(slide: Slide, title: string, subtitle?: string): void {
  slide.addText(title, {
    x: MARGIN_X,
    y: 0.26,
    w: CONTENT_W,
    h: 0.44,
    fontSize: 19,
    bold: true,
    color: "0F172A",
    fontFace: "Segoe UI",
    fit: "shrink",
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: MARGIN_X,
      y: 0.66,
      w: CONTENT_W,
      h: 0.26,
      fontSize: 10,
      color: MUTED,
      fontFace: "Segoe UI",
      fit: "shrink",
    });
  }
}

function drawLayout(
  pptx: PptxGenJS,
  slide: Slide,
  layout: LayoutResult,
  options: { showKeys: boolean; originY?: number },
): void {
  if (layout.items.length === 0) return;
  const availableH = CONTENT_H - ((options.originY ?? CONTENT_TOP) - CONTENT_TOP);
  const scale = Math.min(1, CONTENT_W / Math.max(0.01, layout.width), availableH / Math.max(0.01, layout.height));
  const offsetX = MARGIN_X + (CONTENT_W - layout.width * scale) / 2;
  const offsetY = (options.originY ?? CONTENT_TOP) + (availableH - layout.height * scale) / 2;
  const toX = (value: number): number => offsetX + value * scale;
  const toY = (value: number): number => offsetY + value * scale;

  for (const edge of layout.edges) {
    for (let i = 0; i < edge.points.length - 1; i += 1) {
      const a = edge.points[i];
      const b = edge.points[i + 1];
      slide.addShape(pptx.ShapeType.line, {
        x: toX(Math.min(a.x, b.x)),
        y: toY(Math.min(a.y, b.y)),
        w: Math.abs(b.x - a.x) * scale,
        h: Math.abs(b.y - a.y) * scale,
        line: { color: EDGE_COLOR, width: 1 },
      });
    }
  }

  for (const item of layout.items) {
    drawItem(pptx, slide, item, {
      x: toX(item.x),
      y: toY(item.y),
      w: item.w * scale,
      h: item.h * scale,
      fontSize: Math.max(5, item.fontSize * scale),
      showKeys: options.showKeys,
      dense: scale < 0.55,
    });
  }
}

function drawItem(
  pptx: PptxGenJS,
  slide: Slide,
  item: LayoutItem,
  box: {
    x: number;
    y: number;
    w: number;
    h: number;
    fontSize: number;
    showKeys: boolean;
    dense: boolean;
  },
): void {
  const isRoot = item.depth === 1;
  const style = isRoot ? ROOT_STYLE : ITEM_STYLE;
  const showMeta = !box.dense && box.showKeys && box.h > 0.42;
  const metaH = showMeta ? Math.min(0.2, box.h * 0.32) : 0;

  slide.addShape(pptx.ShapeType.roundRect, {
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    rectRadius: 0.035,
    fill: { color: style.fill },
    line: { color: style.border, width: isRoot ? 1.6 : 0.9 },
  });

  slide.addText(item.status === "complete" ? "●" : "○", {
    x: box.x + 0.04,
    y: box.y + 0.03,
    w: 0.16,
    h: 0.16,
    fontSize: Math.max(5, Math.min(7.5, box.fontSize * 0.7)),
    color: isRoot ? "E2E8F0" : MUTED,
    fontFace: "Segoe UI",
    align: "left",
    valign: "top",
  });

  slide.addText(item.label || "Untitled item", {
    x: box.x + 0.17,
    y: box.y + 0.04,
    w: Math.max(0.2, box.w - (box.showKeys && !box.dense ? 0.66 : 0.24)),
    h: Math.max(0.15, box.h - 0.08 - metaH),
    fontSize: box.fontSize,
    bold: isRoot,
    color: style.text,
    fontFace: "Segoe UI",
    valign: "top",
    align: "left",
    fit: "shrink",
  });

  if (box.showKeys && !box.dense) {
    slide.addText(item.key, {
      x: box.x + box.w - 0.56,
      y: box.y + 0.06,
      w: 0.5,
      h: 0.18,
      fontSize: Math.max(6, Math.min(8.5, box.fontSize)),
      bold: true,
      color: isRoot ? "CBD5E1" : MUTED,
      align: "right",
      fontFace: "Consolas",
      charSpacing: 0.4,
    });
  }

}

function addKeyIndexSlides(
  pptx: PptxGenJS,
  doc: TreeDoc,
  keyMap: KeyMap,
  startPage: number,
  total: number,
): void {
  const rows: { text: string }[][] = [];
  const walk = (id: string, depth: number): void => {
    const item = doc.items[id];
    if (!item) return;
    const key = keyMap.byItem[id]?.key ?? "----";
    rows.push([{ text: key }, { text: String(depth) }, { text: item.label }]);
    for (const childId of item.children) walk(childId, depth + 1);
  };
  if (doc.rootId) walk(doc.rootId, 1);

  const chunk = 22;
  for (let start = 0; start < rows.length; start += chunk) {
    const page = startPage + start / chunk;
    const slice = rows.slice(start, start + chunk);
    const slide = pptx.addSlide();
    addTitle(slide, "Key index", "Resolve a key from a meeting note back to its question.");
    slide.addTable(
      [
        ["Key", "Level", "Label"].map((text, i) => ({
          text,
          options: { bold: true, color: "475569", align: i === 1 ? ("center" as const) : ("left" as const) },
        })),
        ...slice,
      ],
      {
        x: MARGIN_X,
        y: 1.05,
        w: CONTENT_W,
        colW: [1.05, 0.8, 10.4],
        fontSize: 8.5,
        fontFace: "Segoe UI",
        color: "1E293B",
        border: { type: "solid", color: "E2E8F0", pt: 0.5 },
        fill: { color: "FFFFFF" },
        rowH: 0.24,
        valign: "middle",
        margin: 0.04,
      },
    );
    addFooter(slide, doc, page, total, `${rows.length} keyed items`);
  }
}

export function buildPresentation(
  doc: TreeDoc,
  options: PptxExportOptions,
  keyMap: KeyMap = computeKeyMap(doc),
): PptxGenJS {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "ITS_16x9", width: SLIDE_W, height: SLIDE_H });
  pptx.layout = "ITS_16x9";
  pptx.author = "Issue Tree Studio";
  pptx.company = "Issue Tree Studio";
  pptx.title = doc.name;
  pptx.subject = `Issue tree, version ${doc.version}`;

  const groups = packSlides(doc, {
    overview: options.includeOverview,
    maxItemsPerSlide: 30,
    maxLeavesPerSlide: 12,
    maxDepth: 5,
  });
  const totalPages =
    groups.length + (options.includeKeyIndex ? Math.max(1, Math.ceil(Object.keys(doc.items).length / 22)) : 0);
  let page = 0;

  for (const group of groups) {
    page += 1;
    const slide = pptx.addSlide();
    const isOverview = options.includeOverview && page === 1;
    const rootLabel = doc.items[doc.rootId ?? ""]?.label ?? doc.name;

    if (isOverview) {
      const overview = overviewIds(doc);
      const layout = layoutTree(doc, keyMap, overview.ids, {
        maxWidth: CONTENT_W,
        maxHeight: CONTENT_H - 0.28,
        fontSize: overviewFontSize(overview.ids.length),
        maxLines: 2,
        gapX: 0.3,
        gapY: 0.07,
        showKeys: options.showKeys,
      });
      addTitle(
        slide,
        rootLabel,
        overview.complete
          ? "Structure overview: the whole tree, then each branch in detail."
          : `Structure overview: first ${overview.levels} levels. Every item appears on the branch slides that follow.`,
      );
      drawLayout(pptx, slide, layout, {
        showKeys: options.showKeys,
        originY: CONTENT_TOP + 0.22,
      });
      slide.addText(
        "Keys identify every item",
        {
          x: MARGIN_X,
          y: SLIDE_H - 0.62,
          w: CONTENT_W,
          h: 0.2,
          fontSize: 8,
          color: MUTED,
          fontFace: "Segoe UI",
        },
      );
      addFooter(slide, doc, page, totalPages, "overview");
      continue;
    }

    const layout = layoutTree(doc, keyMap, group.itemIds, {
      maxWidth: CONTENT_W,
      maxHeight: CONTENT_H - 0.28,
      maxLines: 4,
      gapX: 0.42,
      gapY: 0.18,
      showKeys: options.showKeys,
    });
    addTitle(slide, group.title || doc.name, `From the root: ${rootLabel}`);
    drawLayout(pptx, slide, layout, {
      showKeys: options.showKeys,
      originY: CONTENT_TOP + 0.22,
    });
    addFooter(slide, doc, page, totalPages, "branch detail");
  }

  if (options.includeKeyIndex) {
    addKeyIndexSlides(pptx, doc, keyMap, page + 1, totalPages);
  }

  return pptx;
}

export async function exportPptx(
  doc: TreeDoc,
  options: PptxExportOptions,
  fileName: string,
): Promise<void> {
  const pptx = buildPresentation(doc, options);
  await pptx.writeFile({ fileName });
}
