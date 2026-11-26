/**
 * Content-addressed keys.
 *
 * An item key is the first N characters of the Crockford Base32 encoding of a
 * SHA-256 digest over the item's normalised label plus the normalised labels of
 * its ancestors. Five characters give 33,554,432 values; at the 500-item hard cap
 * the chance of any two items colliding is about 0.37 percent. Real collisions are
 * detected and deterministically promoted to a longer key.
 */

import { sha256 } from "@noble/hashes/sha256";
import type { KeyMap, TreeDoc } from "./types";

export const KEY_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const DEFAULT_KEY_LENGTH = 5;
export const MAX_KEY_LENGTH = 10;
const PATH_SEPARATOR = "\u001f";

const QUOTE_MAP: Record<string, string> = {
  "\u2018": "'",
  "\u2019": "'",
  "\u201b": "'",
  "\u201c": '"',
  "\u201d": '"',
  "\u2013": "-",
  "\u2014": "-",
  "\u2212": "-",
  "\u2010": "-",
  "\u2011": "-",
};

/** Normalise a label so that cosmetic edits do not change its key. */
export function normalizeLabel(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u2018\u2019\u201b\u201c\u201d]/g, (c) => QUOTE_MAP[c] ?? c)
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Join normalised labels into a single hashing path. */
export function joinPath(labels: string[]): string {
  return labels.map(normalizeLabel).join(PATH_SEPARATOR);
}

/** Crockford Base32, most significant bits first. */
export function toBase32(bytes: Uint8Array, chars: number): string {
  let out = "";
  let bitBuffer = 0;
  let bitCount = 0;
  for (const byte of bytes) {
    bitBuffer = (bitBuffer << 8) | byte;
    bitCount += 8;
    while (bitCount >= 5 && out.length < chars) {
      bitCount -= 5;
      out += KEY_ALPHABET[(bitBuffer >>> bitCount) & 31];
    }
    if (out.length >= chars) break;
    bitBuffer &= (1 << bitCount) - 1;
  }
  // Zero-extend when the digest is shorter than the requested key length.
  while (out.length < chars) out += KEY_ALPHABET[0];
  return out;
}

export function digestHex(text: string): string {
  return Array.from(sha256(new TextEncoder().encode(text)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function keyForPath(path: string, length = DEFAULT_KEY_LENGTH): string {
  return toBase32(sha256(new TextEncoder().encode(path)), length);
}

/**
 * Compute every item key in a document.
 *
 * Two passes:
 *  1. Identical content paths (same labels all the way down) get a stable
 *     ordinal mixed into the digest, so two "Other" branches never share a key.
 *  2. Distinct digests that truncate to the same short key are promoted to the
 *     next length. Promotion is ordered by full digest, so it is independent of
 *     tree order and survives reordering.
 */
export function computeKeyMap(doc: TreeDoc, baseLength = DEFAULT_KEY_LENGTH): KeyMap {
  interface Candidate {
    itemId: string;
    rawPath: string;
    digest: string;
    key: string;
    length: number;
    promoted: boolean;
    depth: number;
    pathKeys: string[];
  }

  const candidates: Candidate[] = [];
  const seenPaths = new Map<string, number>();

  const walk = (itemId: string, ancestors: string[], depth: number): void => {
    const item = doc.items[itemId];
    if (!item) return;
    const labels = [...ancestors, item.label];
    const rawPath = joinPath(labels);
    const seen = seenPaths.get(rawPath) ?? 0;
    seenPaths.set(rawPath, seen + 1);
    const ordinal = Math.min(seen, 999);
    const digest = digestHex(ordinal > 0 ? `${rawPath}${PATH_SEPARATOR}#${ordinal}` : rawPath);
    const length = baseLength;
    candidates.push({
      itemId,
      rawPath,
      digest,
      key: toBase32(hexToBytes(digest), length),
      length,
      promoted: false,
      depth,
      pathKeys: [],
    });
    for (const childId of item.children) walk(childId, labels, depth + 1);
  };

  if (doc.rootId && doc.items[doc.rootId]) walk(doc.rootId, [], 1);

  // Any item not reachable from the root (defensive) still gets a key.
  for (const id of Object.keys(doc.items)) {
    if (!candidates.some((c) => c.itemId === id)) walk(id, [], 1);
  }

  const byKey = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const bucket = byKey.get(candidate.key);
    if (bucket) bucket.push(candidate);
    else byKey.set(candidate.key, [candidate]);
  }

  // Promote colliding candidates, longest first is not needed: repeat until stable.
  for (let guard = 0; guard < 64; guard += 1) {
    let changed = false;
    const buckets = new Map<string, Candidate[]>();
    for (const candidate of candidates) {
      const bucket = buckets.get(candidate.key);
      if (bucket) bucket.push(candidate);
      else buckets.set(candidate.key, [candidate]);
    }
    for (const bucket of buckets.values()) {
      if (bucket.length < 2) continue;
      const ordered = [...bucket].sort((a, b) =>
        a.digest === b.digest ? a.itemId.localeCompare(b.itemId) : a.digest.localeCompare(b.digest),
      );
      for (const loser of ordered.slice(1)) {
        if (loser.length >= MAX_KEY_LENGTH) continue;
        loser.length += 1;
        loser.key = toBase32(hexToBytes(loser.digest), loser.length);
        loser.promoted = true;
        changed = true;
      }
    }
    if (!changed) break;
  }

  const byItem: KeyMap["byItem"] = {};
  const keyIndex = new Map<string, string[]>();
  for (const candidate of candidates) {
    byItem[candidate.itemId] = {
      itemId: candidate.itemId,
      key: candidate.key,
      length: candidate.length,
      path: candidate.rawPath,
      pathKeys: [],
      digestHex: candidate.digest,
      promoted: candidate.promoted,
      depth: candidate.depth,
    };
    const list = keyIndex.get(candidate.key);
    if (list) list.push(candidate.itemId);
    else keyIndex.set(candidate.key, [candidate.itemId]);
  }

  // Fill key paths (ancestor keys) now that every key is known.
  const fillPathKeys = (itemId: string, parentPathKeys: string[]): void => {
    const info = byItem[itemId];
    const item = doc.items[itemId];
    if (!info || !item) return;
    info.pathKeys = [...parentPathKeys, info.key];
    for (const childId of item.children) fillPathKeys(childId, info.pathKeys);
  };
  if (doc.rootId && byItem[doc.rootId]) fillPathKeys(doc.rootId, []);

  const collisions = [...keyIndex.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([key, itemIds]) => ({ key, itemIds }));

  return { byItem, collisions };
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Probability that at least two of `count` uniformly distributed keys collide. */
export function collisionRisk(count: number, length = DEFAULT_KEY_LENGTH): number {
  const space = KEY_ALPHABET.length ** length;
  return 1 - Math.exp((-count * (count - 1)) / (2 * space));
}
