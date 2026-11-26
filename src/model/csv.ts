/** CSV export and import for issue trees. */

import type { KeyMap, ItemStatus, TreeDoc, TreeItem } from "./types";
import { ITEM_CAP } from "./types";
import { itemNumbers } from "./numbering";
import { buildDoc, flatten, newId, now } from "./tree";

/**
 * `number` leads, so the file reads as a report: a reader can see where a row
 * sits without decoding the `path` column. Earning the place meant moving every
 * other column along, which breaks a published contract, so this shipped with a
 * minor version.
 *
 * The importer resolves columns by name, so it reads this order and the order
 * shipped before it.
 */
export const CSV_HEADER = [
  "number",
  "label",
  "key",
  "level",
  "parent_key",
  "status",
  "path",
  "branch_index",
  "version",
] as const;

export const UTF8_BOM = "\uFEFF";

export interface CsvParseResult {
  doc: TreeDoc;
  warnings: string[];
}

export function csvEscape(value: string | number): string {
  const text = String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(rows: readonly (readonly (string | number)[])[]): string {
  const body = rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
  return `${UTF8_BOM}${body}\r\n`;
}

export function exportCsv(doc: TreeDoc, keyMap: KeyMap, version = doc.version): string {
  const numbers = itemNumbers(doc);
  const rows: (string | number)[][] = [[...CSV_HEADER]];
  for (const entry of flatten(doc)) {
    const info = keyMap.byItem[entry.item.id];
    const key = info?.key ?? "";
    const pathKeys = info?.pathKeys ?? [key];
    const parentKey = entry.parentId ? keyMap.byItem[entry.parentId]?.key ?? "" : "";
    rows.push([
      numbers[entry.item.id] ?? "",
      entry.item.label,
      key,
      entry.depth,
      parentKey,
      entry.item.status,
      pathKeys.join("/"),
      entry.parentId ? entry.index + 1 : 0,
      version,
    ]);
  }
  return toCsv(rows);
}

/** RFC 4180 parser. Handles quoted fields, escaped quotes and embedded newlines. */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function asStatus(value: string | undefined): ItemStatus {
  const clean = (value ?? "").trim().toLowerCase();
  return ["complete", "completed", "done", "x", "closed"].includes(clean) ? "complete" : "open";
}

function headerIndex(header: string[], names: string[]): number {
  const normalised = header.map((cell) => cell.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  for (const name of names) {
    const index = normalised.indexOf(name);
    if (index >= 0) return index;
  }
  return -1;
}

export function importCsv(text: string, name = "Imported CSV"): CsvParseResult {
  const warnings: string[] = [];
  const rows = parseCsv(text);
  if (rows.length === 0) {
    return { doc: buildDoc(name, [{ label: "Root question", depth: 1 }]), warnings: ["The file was empty."] };
  }

  const header = rows[0];
  const col = {
    key: headerIndex(header, ["key", "id", "item_id"]),
    parent: headerIndex(header, ["parent_key", "parent", "parent_id"]),
    label: headerIndex(header, ["label", "text", "question", "issue", "name"]),
    level: headerIndex(header, ["level", "depth"]),
    status: headerIndex(header, ["status", "state", "done"]),
  };

  if (col.label < 0) {
    return {
      doc: buildDoc(name, [{ label: "Root question", depth: 1 }]),
      warnings: [`No label column found. Expected ${CSV_HEADER.join(",")}.`],
    };
  }

  const dataRows = rows.slice(1).filter((row) => (row[col.label] ?? "").trim() !== "");
  if (dataRows.length === 0) {
    return { doc: buildDoc(name, [{ label: "Root question", depth: 1 }]), warnings: ["No labelled rows found."] };
  }

  const capped = dataRows.slice(0, ITEM_CAP);
  if (dataRows.length > ITEM_CAP) {
    warnings.push(`CSV had ${dataRows.length} rows. Kept the first ${ITEM_CAP} to stay inside the ${ITEM_CAP}-item cap.`);
  }

  const items: Record<string, TreeItem> = {};
  const ids: string[] = [];
  const externalToId = new Map<string, string>();
  const parents: (string | null)[] = [];

  capped.forEach((row) => {
    const id = newId();
    const label = (row[col.label] ?? "").trim();
    const externalKey = col.key >= 0 ? (row[col.key] ?? "").trim() : "";
    items[id] = { id, label, status: asStatus(col.status >= 0 ? row[col.status] : undefined), children: [] };
    ids.push(id);
    if (externalKey) {
      if (externalToId.has(externalKey)) {
        warnings.push(`Duplicate key "${externalKey}" in the CSV. Kept the first row with that key.`);
      } else {
        externalToId.set(externalKey, id);
      }
    }
    const parentRef = col.parent >= 0 ? (row[col.parent] ?? "").trim() : "";
    parents.push(parentRef || null);
  });

  const roots: string[] = [];
  capped.forEach((row, index) => {
    const id = ids[index];
    const parentRef = parents[index];
    if (!parentRef) {
      const level = col.level >= 0 ? Number.parseInt(row[col.level] ?? "", 10) : Number.NaN;
      if (Number.isFinite(level) && level > 1) {
        warnings.push(`Row "${items[id].label}" has no parent reference; treated it as a root.`);
      }
      roots.push(id);
      return;
    }
    const parentId = externalToId.get(parentRef);
    if (!parentId || parentId === id) {
      warnings.push(`Could not find parent "${parentRef}" for "${items[id].label}". Attached it to the top level.`);
      roots.push(id);
      return;
    }
    items[parentId].children.push(id);
  });

  const timestamp = now();
  let rootId: string | null = roots.length === 1 ? roots[0] : null;
  if (roots.length > 1) {
    const synthetic = newId();
    items[synthetic] = { id: synthetic, label: name, status: "open", children: [...roots] };
    rootId = synthetic;
    warnings.push(`Found ${roots.length} top-level rows. Added a shared root so the rows form one tree.`);
  }
  return {
    doc: {
      id: newId(),
      name,
      rootId,
      items,
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      settings: {
        showKeysInEditor: true,
        showKeysInExport: true,
        includeOverviewSlide: true,
        includeKeyIndexSlide: false,
      },
    },
    warnings,
  };
}
