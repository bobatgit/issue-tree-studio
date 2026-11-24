import { buildDoc } from "../model/tree";
import type { TreeDoc } from "../model/types";

/** A flat root with `count` children, used to exercise caps and hashing. */
export function generateTree(count: number): TreeDoc {
  const items = [{ label: "Root question?", depth: 1 }];
  for (let index = 0; index < count - 1; index += 1) {
    items.push({ label: `Branch ${index}?`, depth: 2 });
  }
  return buildDoc("Generated", items);
}
