import { describe, expect, it } from "vitest";
import { CSV_HEADER, exportCsv, importCsv, parseCsv, toCsv, UTF8_BOM } from "../model/csv";
import { computeKeyMap } from "../model/keys";
import { parseMarkdown } from "../model/markdown";
import { countNodes, flatten } from "../model/tree";

function sampleDoc() {
  return parseMarkdown(
    `- Why did profit fall?
  - Did revenue fall?
    - Did price per unit fall?
  - Did cost rise?
`,
    "Sample",
  ).doc;
}

const paths = (doc: ReturnType<typeof sampleDoc>): string[] =>
  flatten(doc).map((entry) => `${"·".repeat(entry.depth - 1)}${entry.node.label}`);

describe("csv export", () => {
  it("writes the agreed header and one row per node", () => {
    const doc = sampleDoc();
    const csv = exportCsv(doc, computeKeyMap(doc), 7);
    const lines = csv.replace(/^\uFEFF/, "").split("\r\n").filter(Boolean);
    expect(lines[0]).toBe(CSV_HEADER.join(","));
    expect(lines).toHaveLength(1 + countNodes(doc));
    expect(csv.startsWith(UTF8_BOM)).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("fills key paths, levels and the version stamp", () => {
    const doc = sampleDoc();
    const map = computeKeyMap(doc);
    const rows = parseCsv(exportCsv(doc, map, 12));
    const header = rows[0];
    const keyIndex = header.indexOf("key");
    const pathIndex = header.indexOf("path");
    const levelIndex = header.indexOf("level");
    const versionIndex = header.indexOf("version");
    const rootKey = map.byNode[doc.rootId as string].key;
    expect(rows[1][keyIndex]).toBe(rootKey);
    expect(rows[1][pathIndex]).toBe(rootKey);
    expect(rows[1][levelIndex]).toBe("1");
    expect(rows[2][pathIndex]).toBe(`${rootKey}/${rows[2][keyIndex]}`);
    expect(rows.every((row, index) => index === 0 || row[versionIndex] === "12")).toBe(true);
  });

  it("quotes commas, quotes and newlines", () => {
    const csv = toCsv([["a"], ['He said "no", twice'], ["line\nbreak"]]);
    const rows = parseCsv(csv);
    expect(rows[1][0]).toBe('He said "no", twice');
    expect(rows[2][0]).toBe("line\nbreak");
    expect(csv).toContain('"He said ""no"", twice"');
  });

  it("keeps non-ASCII labels intact", () => {
    const doc = sampleDoc();
    doc.nodes[doc.rootId as string].label = "¿Por qué cayó el beneficio? – año 2025";
    const csv = exportCsv(doc, computeKeyMap(doc));
    const rows = parseCsv(csv);
    expect(rows[1][3]).toBe("¿Por qué cayó el beneficio? – año 2025");
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });
});

describe("csv import", () => {
  it("rebuilds the same tree from its own export", () => {
    const doc = sampleDoc();
    const csv = exportCsv(doc, computeKeyMap(doc));
    const result = importCsv(csv, "Round trip");
    expect(paths(result.doc)).toEqual(paths(doc));
    expect(result.warnings).toHaveLength(0);
  });

  it("accepts id and parent as column names", () => {
    const csv = ["id,parent,label,type", "a,,Root?,question", "b,a,Child?,hypothesis"].join("\r\n");
    const result = importCsv(csv);
    expect(paths(result.doc)).toEqual(["Root?", "·Child?"]);
  });

  it("attaches rows with an unknown parent to the top level and warns", () => {
    const csv = ["key,parent_key,label", "a,,Root?", "b,zzz,Orphan?"].join("\r\n");
    const result = importCsv(csv);
    expect(result.warnings.join(" ")).toContain("Orphan?");
    expect(countNodes(result.doc)).toBe(3);
  });

  it("creates a shared root when several rows have no parent", () => {
    const csv = ["key,parent_key,label", "a,,Alpha?", "b,,Beta?"].join("\r\n");
    const result = importCsv(csv, "Two roots");
    expect(result.warnings.join(" ")).toContain("shared root");
    expect(paths(result.doc)).toEqual(["Two roots", "·Alpha?", "·Beta?"]);
  });

  it("enforces the 100-node cap", () => {
    const rows = ["key,parent_key,label", "root,,Root?"];
    for (let index = 0; index < 150; index += 1) rows.push(`n${index},root,Item ${index}?`);
    const result = importCsv(rows.join("\r\n"));
    expect(countNodes(result.doc)).toBe(100);
    expect(result.warnings.join(" ")).toContain("100");
  });

  it("reports a missing label column", () => {
    const result = importCsv("key,parent_key\nr,");
    expect(result.warnings.join(" ")).toContain("label column");
  });
});
