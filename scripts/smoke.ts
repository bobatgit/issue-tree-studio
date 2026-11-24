/**
 * Export smoke test: writes real .pptx and .csv files to ./artifacts so the
 * binary output can be opened and inspected outside the test suite.
 *
 * Run: npm run smoke
 */

import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildPresentation } from "../src/export/pptx";
import { exportCsv, importCsv } from "../src/model/csv";
import { computeKeyMap } from "../src/model/keys";
import { parseMarkdown } from "../src/model/markdown";
import { buildDoc, countNodes } from "../src/model/tree";
import { SAMPLES } from "../src/model/sample";
import type { TreeDoc } from "../src/model/types";

const OUT = path.resolve("artifacts");

async function sizeOf(file: string): Promise<number> {
  return (await stat(file)).size;
}

async function runCase(label: string, doc: TreeDoc, keyIndex: boolean): Promise<void> {
  const keyMap = computeKeyMap(doc);
  const keys = Object.values(keyMap.byNode);
  const pptxFile = path.join(OUT, `${label}.pptx`);
  const csvFile = path.join(OUT, `${label}.csv`);

  const pptx = buildPresentation(doc, { showKeys: true, includeOverview: true, includeKeyIndex: keyIndex });
  await pptx.writeFile({ fileName: pptxFile });

  const csv = exportCsv(doc, keyMap);
  await writeFile(csvFile, csv, "utf-8");

  const reimported = importCsv(csv, label);
  const roundTripped = countNodes(reimported.doc) === countNodes(doc);

  const promoted = keys.filter((info) => info.promoted).length;
  const minKey = Math.min(...keys.map((info) => info.length));
  const maxKey = Math.max(...keys.map((info) => info.length));

  process.stdout.write(
    [
      `\n${label}`,
      `  nodes           ${countNodes(doc)}`,
      `  keys            ${keys.length} unique=${new Set(keys.map((info) => info.key)).size} length ${minKey}-${maxKey} promoted=${promoted}`,
      `  pptx            ${(await sizeOf(pptxFile)).toLocaleString()} bytes`,
      `  csv             ${(await sizeOf(csvFile)).toLocaleString()} bytes, round-trip ${roundTripped ? "OK" : "FAILED"}`,
      `  collisions      ${keyMap.collisions.length}`,
    ].join("\n"),
  );
}

await mkdir(OUT, { recursive: true });

for (const sample of SAMPLES) {
  const parsed = parseMarkdown(sample.markdown, sample.name);
  await runCase(sample.id, parsed.doc, sample.id === "profit-decline");
}

// Stress case: exactly 100 nodes, wide and shallow.
const stress = buildDoc(
  "100-node stress case",
  [{ label: "Why did the 100-node cap hold?", depth: 1 }].concat(
    Array.from({ length: 99 }, (_, index) => ({ label: `Branch question ${index}?`, depth: 2 })),
  ),
);
await runCase("stress-100", stress, true);

// Deep case: 7 levels.
const deep = parseMarkdown(
  [
    "- Why did profit fall?",
    "  - Did revenue fall?",
    "    - Did price fall?",
    "      - Did discounting rise?",
    "        - Did enterprise discounting rise?",
    "          - Did the new pricing policy apply?",
    "            - Was the policy applied to renewals?",
    "  - Did cost rise?",
  ].join("\n"),
  "Deep tree",
).doc;
await runCase("deep-7-levels", deep, false);

process.stdout.write(`\nArtifacts written to ${OUT}\n`);
