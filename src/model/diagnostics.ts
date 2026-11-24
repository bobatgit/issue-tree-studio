/**
 * A paste-ready report block: build identity, environment, tree statistics and
 * the tree itself. One paste into an issue is enough to reproduce a defect.
 */

import { countNodes, maxDepth } from "./tree";
import type { KeyMap, TreeDoc } from "./types";
import { NODE_CAP } from "./types";

export interface DiagnosticsMeta {
  appVersion: string;
  buildSha: string;
  url: string;
  userAgent: string;
  viewport: string;
  now: Date;
}

export function buildDiagnostics(doc: TreeDoc, keyMap: KeyMap, meta: DiagnosticsMeta): string {
  const statusCounts = Object.values(doc.nodes).reduce<Record<string, number>>((counts, node) => {
    counts[node.status] = (counts[node.status] ?? 0) + 1;
    return counts;
  }, {});
  const keys = Object.values(keyMap.byNode);
  const promoted = keys.filter((info) => info.promoted).length;
  const lengths = keys.map((info) => info.length);
  const minLength = lengths.length ? Math.min(...lengths) : 0;
  const maxLength = lengths.length ? Math.max(...lengths) : 0;
  const keyLength = lengths.length === 0 ? "none" : minLength === maxLength ? String(minLength) : `${minLength}-${maxLength}`;
  const settings = doc.settings;

  const lines = [
    "### Issue Tree Studio diagnostics",
    "",
    `- build: ${meta.appVersion} (${meta.buildSha})`,
    `- generated: ${meta.now.toISOString()}`,
    `- page: ${meta.url}`,
    `- browser: ${meta.userAgent}`,
    `- viewport: ${meta.viewport}`,
    `- tree: ${doc.name} (v${doc.version})`,
    `- nodes: ${countNodes(doc)} / ${NODE_CAP}, depth ${maxDepth(doc)}`,
    `- keys: length ${keyLength}, promoted ${promoted}, collisions ${keyMap.collisions.length}`,
    `- status: open ${statusCounts.open ?? 0}, complete ${statusCounts.complete ?? 0}`,
    `- settings: keys in editor ${settings.showKeysInEditor}, keys in export ${settings.showKeysInExport}, overview ${settings.includeOverviewSlide}, key index ${settings.includeKeyIndexSlide}`,
    "",
    "<details><summary>Tree JSON</summary>",
    "",
    "````json",
    JSON.stringify(
      {
        name: doc.name,
        version: doc.version,
        rootId: doc.rootId,
        nodes: doc.nodes,
        settings: doc.settings,
      },
      null,
      2,
    ),
    "````",
    "",
    "</details>",
    "",
  ];

  return lines.join("\n");
}

/** Pull the JSON back out of a diagnostics block, for tests and for import. */
export function treeJsonFromDiagnostics(text: string): string | null {
  const match = /````json\n([\s\S]*?)\n````/.exec(text);
  return match ? match[1] : null;
}
