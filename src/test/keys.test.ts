import { describe, expect, it } from "vitest";
import { collisionRisk, computeKeyMap, keyForPath, normalizeLabel, toBase32 } from "../model/keys";
import { parseMarkdown } from "../model/markdown";
import { createDoc, updateLabel } from "../model/tree";

function docFrom(markdown: string) {
  return parseMarkdown(markdown, "test").doc;
}

function keyByLabel(doc: ReturnType<typeof docFrom>): Record<string, string> {
  const map = computeKeyMap(doc);
  const out: Record<string, string> = {};
  for (const item of Object.values(doc.items)) out[item.label] = map.byItem[item.id].key;
  return out;
}

describe("label normalisation", () => {
  it("ignores case, extra spaces and tabs", () => {
    expect(normalizeLabel("  Why   DID\tprofit fall? ")).toBe("why did profit fall?");
  });

  it("folds typographic dashes and quotes", () => {
    expect(normalizeLabel("Revenue \u2013 cost")).toBe("revenue - cost");
    expect(normalizeLabel("\u201cPrice\u201d fell")).toBe('"price" fell');
  });
});

describe("key encoding", () => {
  it("returns 5 Crockford Base32 characters", () => {
    const key = keyForPath("why did profit fall?");
    expect(key).toHaveLength(5);
    expect(key).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}$/);
  });

  it("never emits the ambiguous letters I, L, O or U", () => {
    for (let index = 0; index < 300; index += 1) {
      const key = keyForPath(`item ${index}`);
      expect(key).not.toMatch(/[ILOU]/);
    }
  });

  it("is deterministic for the same path and differs for a different path", () => {
    expect(keyForPath("root / price")).toBe(keyForPath("root / price"));
    expect(keyForPath("root / price")).not.toBe(keyForPath("root / volume"));
  });

  it("pads correctly for short byte slices", () => {
    expect(toBase32(new Uint8Array([0, 0]), 4)).toBe("0000");
    expect(toBase32(new Uint8Array([255, 255, 255]), 4)).toBe("ZZZZ");
  });

  it("reports a collision risk below one percent at the 100-item cap", () => {
    expect(collisionRisk(100, 4)).toBeGreaterThan(0.004);
    expect(collisionRisk(100, 4)).toBeLessThan(0.006);
    expect(collisionRisk(100, 5)).toBeLessThan(0.0002);
  });
});

describe("document keys", () => {
  const markdown = `- Why did profit fall?
  - Did revenue fall?
    - Did price fall?
    - Did volume fall?
  - Did cost rise?
`;

  it("gives every item a key", () => {
    const doc = docFrom(markdown);
    const map = computeKeyMap(doc);
    expect(Object.keys(map.byItem)).toHaveLength(Object.keys(doc.items).length);
    for (const info of Object.values(map.byItem)) {
      expect(info.key).toHaveLength(5);
      expect(info.path).toContain("why did profit fall?");
    }
  });

  it("puts the same wording under different parents on different keys", () => {
    const doc = docFrom(`- Root?
  - Alpha?
    - Price fell?
  - Beta?
    - Price fell?
`);
    const map = computeKeyMap(doc);
    const prices = Object.values(doc.items).filter((item) => item.label === "Price fell?");
    expect(prices).toHaveLength(2);
    expect(map.byItem[prices[0].id].key).not.toBe(map.byItem[prices[1].id].key);
  });

  it("keeps keys unchanged when siblings are reordered", () => {
    const before = keyByLabel(docFrom(markdown));
    const after = keyByLabel(
      docFrom(`- Why did profit fall?
  - Did cost rise?
  - Did revenue fall?
    - Did volume fall?
    - Did price fall?
`),
    );
    expect(after).toEqual(before);
  });

  it("changes the item and its descendants when a label changes, but not its siblings", () => {
    const doc = docFrom(markdown);
    const map = computeKeyMap(doc);
    const root = doc.items[doc.rootId as string];
    const revenue = doc.items[root.children[0]];
    const cost = doc.items[root.children[1]];
    const price = doc.items[revenue.children[0]];
    const revenueKey = map.byItem[revenue.id].key;
    const priceKey = map.byItem[price.id].key;
    const costKey = map.byItem[cost.id].key;
    const rootKey = map.byItem[root.id].key;

    const edited = updateLabel(doc, revenue.id, "Did total revenue fall?");
    const next = computeKeyMap(edited);

    expect(next.byItem[revenue.id].key).not.toBe(revenueKey);
    expect(next.byItem[price.id].key).not.toBe(priceKey);
    expect(next.byItem[cost.id].key).toBe(costKey);
    expect(next.byItem[root.id].key).toBe(rootKey);
  });

  it("gives duplicate wording on the same path different keys", () => {
    const doc = docFrom(`- Root?
  - Other?
  - Other?
`);
    const map = computeKeyMap(doc);
    const keys = Object.values(map.byItem).map((info) => info.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("promotes colliding short keys until every key is unique", () => {
    const doc = createDoc("collision probe");
    const rootId = doc.rootId as string;
    let current = doc;
    for (let index = 0; index < 40; index += 1) {
      const id = `probe-${index}`;
      current = {
        ...current,
        items: {
          ...current.items,
          [id]: { id, label: `Branch ${index}?`, status: "open", children: [] },
          [rootId]: { ...current.items[rootId], children: [...current.items[rootId].children, id] },
        },
      };
    }
    const map = computeKeyMap(current, 1);
    const keys = Object.values(map.byItem).map((info) => info.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(map.collisions).toHaveLength(0);
    expect(keys.some((key) => key.length > 1)).toBe(true);
    expect(Object.values(map.byItem).some((info) => info.promoted)).toBe(true);
  });

});
