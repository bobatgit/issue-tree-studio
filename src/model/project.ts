/** Project JSON import: one shape, tolerating files from older builds. */

import { newId, now } from "./tree";
import type { TreeItem, TreeDoc } from "./types";

interface ProjectFile {
  doc?: TreeDoc;
}

/**
 * Read a project file. Unknown item fields from older schemas, such as the
 * removed `type`, are dropped so they cannot travel back out in an export.
 */
export function parseProject(text: string): TreeDoc | null {
  let data: ProjectFile;
  try {
    data = JSON.parse(text) as ProjectFile;
  } catch {
    return null;
  }
  const doc = data.doc;
  if (!doc || !doc.items || typeof doc.items !== "object" || !("rootId" in doc)) return null;

  const items: Record<string, TreeItem> = {};
  for (const [id, item] of Object.entries(doc.items)) {
    const clean = { ...item } as TreeItem & { type?: unknown };
    delete clean.type;
    items[id] = clean;
  }

  return {
    ...doc,
    id: newId(),
    version: 1,
    createdAt: now(),
    updatedAt: now(),
    items,
  };
}
