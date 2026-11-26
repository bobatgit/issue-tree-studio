/** Project JSON import: one shape, tolerating files from older builds. */

import { newId, now } from "./tree";
import type { TreeNode, TreeDoc } from "./types";

interface ProjectFile {
  doc?: TreeDoc;
}

/**
 * Read a project file. Unknown node fields from older schemas, such as the
 * removed `type`, are dropped so they cannot travel back out in an export.
 */
/** True when a file records four-character keys from the older scheme. */
export function hasLegacyKeys(text: string): boolean {
  return (
    /"(?:from|to)":[ ]*"[0-9A-HJKMNP-TV-Z]{4}"/.test(text) ||
    /"keys":[ ]*\{[^}]*:[ ]*"[0-9A-HJKMNP-TV-Z]{4}"/.test(text)
  );
}

export function parseProject(text: string): TreeDoc | null {
  let data: ProjectFile;
  try {
    data = JSON.parse(text) as ProjectFile;
  } catch {
    return null;
  }
  const doc = data.doc;
  if (!doc || !doc.nodes || typeof doc.nodes !== "object" || !("rootId" in doc)) return null;

  const nodes: Record<string, TreeNode> = {};
  for (const [id, node] of Object.entries(doc.nodes)) {
    const clean = { ...node } as TreeNode & { type?: unknown };
    delete clean.type;
    nodes[id] = clean;
  }

  return {
    ...doc,
    id: newId(),
    version: 1,
    createdAt: now(),
    updatedAt: now(),
    nodes,
  };
}
