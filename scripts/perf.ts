/**
 * Performance probe for the 500-node hard cap.
 *
 * Measures the pure model work that a keystroke triggers, then the full deck
 * export, so the cost of raising the cap from 100 to 500 is recorded, not guessed.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { buildDoc } from "../src/model/tree";
import { computeKeyMap } from "../src/model/keys";
import { reviewTree } from "../src/model/quality";
import { flatten } from "../src/model/tree";
import { toMarkdown } from "../src/model/markdown";
import { exportCsv } from "../src/model/csv";
import { buildPresentation } from "../src/export/pptx";
import { NODE_CAP } from "../src/model/types";

const OUT = path.resolve("artifacts");
mkdirSync(OUT, { recursive: true });

function treeOf(count: number) {
  const items = [{ label: "Why did profit fall?", depth: 1 }];
  for (let index = 0; index < count - 1; index += 1) {
    items.push({ label: `Branch ${index}: did driver ${index} move?`, depth: index % 7 === 0 ? 2 : 3 });
  }
  return buildDoc(`Perf ${count}`, items);
}

function time(label: string, run: () => void): number {
  const started = performance.now();
  run();
  const ms = performance.now() - started;
  process.stdout.write(`${label.padEnd(26)} ${ms.toFixed(1)} ms\n`);
  return ms;
}

const doc = treeOf(NODE_CAP);
const map = computeKeyMap(doc);

process.stdout.write(`nodes: ${Object.keys(doc.nodes).length}, keys: ${map.byNode[Object.keys(doc.nodes)[0]]?.key.length} chars\n\n`);

time("computeKeyMap", () => computeKeyMap(doc));
time("reviewTree (quality)", () => reviewTree(doc, map));
time("flatten", () => flatten(doc));
time("toMarkdown", () => toMarkdown(doc));
time("exportCsv", () => exportCsv(doc, map));

// The deck is the expensive one: it must still succeed at the cap.
const started = performance.now();
const pptx = buildPresentation(doc, { showKeys: true, includeOverview: true, includeKeyIndex: false });
const file = path.join(OUT, `stress-${NODE_CAP}.pptx`);
await pptx.writeFile({ fileName: file });
const deckMs = performance.now() - started;
process.stdout.write(`${"buildPresentation + write".padEnd(26)} ${deckMs.toFixed(0)} ms\n`);

const bytes = (await import("node:fs")).statSync(file).size;
process.stdout.write(`\ndeck: ${file} (${(bytes / 1024 / 1024).toFixed(2)} MB)\n`);

// Keep a small record for the issue.
writeFileSync(
  path.join(OUT, "perf-500.json"),
  JSON.stringify({ nodes: NODE_CAP, deckMs, bytes, at: new Date().toISOString() }, null, 2),
  "utf-8",
);
