// @vitest-environment jsdom
/**
 * The per-tab store.
 *
 * A document saved before 0.8.0 carries its map under `nodes`. That release
 * renamed the field to `items` with no fallback, so the store must treat such a
 * document as no document at all: the tab comes back to the ordinary empty
 * state, never to half a tree and never to an error.
 */

import { afterEach, describe, expect, it } from "vitest";
import { getDoc, listDocs, putDoc } from "../store/storage";
import { buildDoc } from "../model/tree";

afterEach(() => {
  sessionStorage.clear();
});

/** A document as an older release wrote it, with the map under the old name. */
function beforeTheRename(): string {
  const doc = buildDoc("Older tree", [{ label: "Was this written before?", depth: 1 }]);
  const older: Record<string, unknown> = { ...doc, nodes: doc.items };
  delete older.items;
  return JSON.stringify(older);
}

describe("the per-tab store", () => {
  it("returns a document it wrote itself", async () => {
    await putDoc(buildDoc("Stored", [{ label: "Root?", depth: 1 }]));
    expect(await getDoc()).not.toBeNull();
    expect((await listDocs())[0].itemCount).toBe(1);
  });

  it("treats a document written before the items rename as an empty tab", async () => {
    sessionStorage.setItem("its.doc", beforeTheRename());
    expect(await getDoc()).toBeNull();
    expect(await listDocs()).toEqual([]);
  });

  it("treats a payload with no item map as an empty tab, and never throws", async () => {
    sessionStorage.setItem("its.doc", JSON.stringify({ id: "x", name: "Half a document" }));
    expect(await getDoc()).toBeNull();
    expect(await listDocs()).toEqual([]);
  });

  it("survives a payload that is not JSON", async () => {
    sessionStorage.setItem("its.doc", "{not json");
    expect(await getDoc()).toBeNull();
    expect(await listDocs()).toEqual([]);
  });
});

describe("loading a document written before 0.11.0", () => {
  it("drops the retired note and MECE fields and keeps the rest", async () => {
    const doc = buildDoc("Old", [
      { label: "Root?", depth: 1 },
      { label: "A?", depth: 2 },
    ]);
    const rootId = doc.rootId as string;
    const childId = doc.items[rootId].children[0];
    const raw = JSON.parse(JSON.stringify(doc)) as {
      items: Record<string, Record<string, unknown>>;
    };
    raw.items[childId].note = "evidence";
    raw.items[childId].mece = { exhaustive: true };
    sessionStorage.setItem("its.doc", JSON.stringify(raw));

    const loaded = await getDoc();
    expect(loaded).not.toBeNull();
    const item = loaded?.items[childId];
    expect(item).toBeTruthy();
    expect(item && "note" in item).toBe(false);
    expect(item && "mece" in item).toBe(false);
    expect(item?.label).toBe("A?");
    expect(loaded?.items[rootId].children).toEqual([childId]);
  });
});
