import { describe, expect, it } from "vitest";
import { hasLegacyKeys, parseProject } from "../model/project";
import { countNodes, flatten } from "../model/tree";

const legacy = JSON.stringify({
  app: "issue-tree-studio",
  schema: 1,
  doc: {
    id: "old-doc",
    name: "Legacy tree",
    rootId: "r",
    nodes: {
      r: { id: "r", label: "Root?", type: "question", children: ["a"] },
      a: { id: "a", label: "Child?", type: "hypothesis", children: [] },
    },
    version: 12,
    createdAt: 1,
    updatedAt: 2,
    settings: {
      showKeysInEditor: true,
      showKeysInExport: true,
      includeOverviewSlide: true,
      includeKeyIndexSlide: false,
    },
    aliases: [],
  },
});

describe("project import", () => {
  it("imports an old file and drops the removed type field", () => {
    const doc = parseProject(legacy);
    expect(doc).not.toBeNull();
    expect(countNodes(doc!)).toBe(2);
    expect(flatten(doc!).map((entry) => entry.node.label)).toEqual(["Root?", "Child?"]);
    for (const node of Object.values(doc!.nodes)) {
      expect("type" in node).toBe(false);
    }
  });

  it("starts the imported document at version 1 with a fresh id", () => {
    const doc = parseProject(legacy)!;
    expect(doc.version).toBe(1);
    expect(doc.id).not.toBe("old-doc");
  });

  it("rejects text that is not a project", () => {
    expect(parseProject("not json")).toBeNull();
    expect(parseProject(JSON.stringify({ hello: 1 }))).toBeNull();
    expect(parseProject(JSON.stringify({ doc: { nodes: {} } }))).toBeNull();
  });
});

describe("legacy keys", () => {
  it("detects four-character keys in aliases and version snapshots", () => {
    expect(hasLegacyKeys('{"aliases":[{"from":"K7M2","to":"B8YVN"}]}')).toBe(true);
    expect(hasLegacyKeys('{"versions":[{"keys":{"a":"K7M2"}}]}')).toBe(true);
    expect(hasLegacyKeys('{"aliases":[{"from":"K7M2X","to":"B8YVN"}]}')).toBe(false);
  });
});
