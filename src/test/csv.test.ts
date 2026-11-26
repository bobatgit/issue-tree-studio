import { describe, expect, it } from "vitest";
import { CSV_HEADER, exportCsv, importCsv, parseCsv, toCsv, UTF8_BOM } from "../model/csv";
import { computeKeyMap } from "../model/keys";
import { parseMarkdown } from "../model/markdown";
import { countItems, flatten } from "../model/tree";

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
  flatten(doc).map((entry) => `${"·".repeat(entry.depth - 1)}${entry.item.label}`);

describe("csv export", () => {
  it("writes the agreed header and one row per item", () => {
    const doc = sampleDoc();
    const csv = exportCsv(doc, computeKeyMap(doc), 7);
    const lines = csv.replace(/^\uFEFF/, "").split("\r\n").filter(Boolean);
    expect(lines[0]).toBe(CSV_HEADER.join(","));
    expect(lines).toHaveLength(1 + countItems(doc));
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
    const rootKey = map.byItem[doc.rootId as string].key;
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
    doc.items[doc.rootId as string].label = "¿Por qué cayó el beneficio? – año 2025";
    const csv = exportCsv(doc, computeKeyMap(doc));
    const rows = parseCsv(csv);
    expect(rows[1][1]).toBe("¿Por qué cayó el beneficio? – año 2025");
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });
});

describe("the number column", () => {
  it("leads the header, so the file reads as a report", () => {
    expect([...CSV_HEADER]).toEqual([
      "number",
      "label",
      "key",
      "level",
      "parent_key",
      "status",
      "path",
      "branch_index",
      "version",
    ]);
  });

  it("carries the derived number, with Q0 on the root", () => {
    const doc = sampleDoc();
    const rows = parseCsv(exportCsv(doc, computeKeyMap(doc)));
    expect(rows[1][0]).toBe("Q0");
    expect(rows[2][0]).toBe("Q1");
    expect(rows[3][0]).toBe("Q1.1");
    expect(rows[4][0]).toBe("Q2");
  });

  it("reads the order that shipped before this release", () => {
    const older = [
      "key,parent_key,level,status,label,path,branch_index,version",
      "a,,1,open,Root?,a,0,3",
      "b,a,2,complete,Child?,a/b,1,3",
    ].join("\r\n");
    const result = importCsv(older, "Older file");
    expect(result.warnings).toHaveLength(0);
    expect(paths(result.doc)).toEqual(["Root?", "·Child?"]);
  });

  it("reads the order it writes now", () => {
    const current = [
      "number,label,key,level,parent_key,status,path,branch_index,version",
      "Q0,Root?,a,1,,open,a,0,3",
      "Q1,Child?,b,2,a,complete,a/b,1,3",
    ].join("\r\n");
    const result = importCsv(current, "Current file");
    expect(result.warnings).toHaveLength(0);
    expect(paths(result.doc)).toEqual(["Root?", "·Child?"]);
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
    expect(countItems(result.doc)).toBe(3);
  });

  it("creates a shared root when several rows have no parent", () => {
    const csv = ["key,parent_key,label", "a,,Alpha?", "b,,Beta?"].join("\r\n");
    const result = importCsv(csv, "Two roots");
    expect(result.warnings.join(" ")).toContain("shared root");
    expect(paths(result.doc)).toEqual(["Two roots", "·Alpha?", "·Beta?"]);
  });

  it("enforces the 500-item cap", () => {
    const rows = ["key,parent_key,label", "root,,Root?"];
    for (let index = 0; index < 600; index += 1) rows.push(`n${index},root,Item ${index}?`);
    const result = importCsv(rows.join("\r\n"));
    expect(countItems(result.doc)).toBe(500);
    expect(result.warnings.join(" ")).toContain("500");
  });

  it("reports a missing label column", () => {
    const result = importCsv("key,parent_key\nr,");
    expect(result.warnings.join(" ")).toContain("label column");
  });
});

describe("csv status", () => {
  it("writes status in the sixth column", () => {
    const doc = sampleDoc();
    doc.items[doc.rootId as string].status = "complete";
    const rows = parseCsv(exportCsv(doc, computeKeyMap(doc)));
    expect(rows[0]).toEqual([...CSV_HEADER]);
    expect(rows[0][5]).toBe("status");
    expect(rows[1][5]).toBe("complete");
    expect(rows[2][5]).toBe("open");
  });

  it("reads status back and defaults unknown values to open", () => {
    const csv = [
      "key,parent_key,level,status,label",
      "a,,1,complete,Root?",
      "b,a,2,weird,Child?",
    ].join("\r\n");
    const doc = importCsv(csv).doc;
    const byLabel = (label: string) => Object.values(doc.items).find((item) => item.label === label);
    expect(byLabel("Root?")?.status).toBe("complete");
    expect(byLabel("Child?")?.status).toBe("open");
  });
});

describe("dashes in the key columns", () => {
  it("writes the form a person reads, everywhere a key appears", () => {
    const doc = sampleDoc();
    const keys = computeKeyMap(doc);
    const rows = parseCsv(exportCsv(doc, keys));
    expect(rows[1][2]).toMatch(/^[0-9A-HJKMNP-TV-Z]{3}-[0-9A-HJKMNP-TV-Z]{3}$/);
    expect(rows[2][4]).toBe(rows[1][2]);
    expect(rows[2][6]).toBe(`${rows[1][2]}/${rows[2][2]}`);
    expect(importCsv(exportCsv(doc, keys)).warnings).toHaveLength(0);
  });
});
