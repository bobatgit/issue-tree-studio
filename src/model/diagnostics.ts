/**
 * A paste-ready report block: build identity, environment, tree statistics and
 * the tree itself. One paste into an issue is enough to reproduce a defect.
 */

import { describeStripping, type StrippedPrefix } from "./markdown";
import { countItems, maxDepth } from "./tree";
import type { KeyMap, TreeDoc } from "./types";
import { ITEM_CAP } from "./types";

/**
 * The pasted enumerators removed since this page loaded.
 *
 * An import can clean twenty lines at once, so the full list lives here rather
 * than in a toast: one paste of Copy diagnostics carries all of it.
 */
let strippedLog: string[] = [];

/** Record what a paste cleaned up. Keeps the last two hundred lines. */
export function noteStripping(entries: StrippedPrefix[]): void {
  if (entries.length === 0) return;
  strippedLog = [...strippedLog, ...entries.map(describeStripping)].slice(-200);
}

export function strippedThisSession(): string[] {
  return [...strippedLog];
}

/**
 * One line for a toast. The full list is in `strippedLog`, because an import can
 * clean more lines than anyone would read in a toast.
 */
export function strippingNote(entries: StrippedPrefix[]): string {
  const shown = entries.slice(0, 2).map(describeStripping).join("; ");
  const rest = entries.length > 2 ? `, and ${entries.length - 2} more` : "";
  return `Cleaned ${entries.length} pasted number${entries.length === 1 ? "" : "s"}: ${shown}${rest}. The full list is in Copy diagnostics.`;
}

/** Tests and a fresh page start with an empty list. */
export function resetStripping(): void {
  strippedLog = [];
}

export interface DiagnosticsMeta {
  appVersion: string;
  buildSha: string;
  url: string;
  userAgent: string;
  viewport: string;
  now: Date;
}

export function buildDiagnostics(doc: TreeDoc, keyMap: KeyMap, meta: DiagnosticsMeta): string {
  const statusCounts = Object.values(doc.items).reduce<Record<string, number>>((counts, item) => {
    counts[item.status] = (counts[item.status] ?? 0) + 1;
    return counts;
  }, {});
  const keys = Object.values(keyMap.byItem);
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
    `- items: ${countItems(doc)} / ${ITEM_CAP}, depth ${maxDepth(doc)}`,
    `- keys: length ${keyLength}, promoted ${promoted}, collisions ${keyMap.collisions.length}`,
    `- status: open ${statusCounts.open ?? 0}, complete ${statusCounts.complete ?? 0}`,
    `- settings: keys in editor ${settings.showKeysInEditor}, keys in export ${settings.showKeysInExport}, overview ${settings.includeOverviewSlide}, key index ${settings.includeKeyIndexSlide}`,
    `- pasted numbers removed this session: ${strippedLog.length}`,
    ...(strippedLog.length > 0
      ? ["", "<details><summary>Pasted numbers removed</summary>", "", "```", ...strippedLog, "```", "", "</details>"]
      : []),
    "",
    "<details><summary>Tree JSON</summary>",
    "",
    "````json",
    JSON.stringify(
      {
        name: doc.name,
        version: doc.version,
        rootId: doc.rootId,
        items: doc.items,
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
