/**
 * One seeded document for the visual gates, plus the app-level helpers they
 * share.
 *
 * The document is written as markdown and parsed with the app's own parser, so
 * it follows every format change the app makes. Nothing here restates the
 * stored shape, which means the fixture cannot drift away from the model.
 */

import { buildDoc } from "../src/model/tree";
import { parseMarkdown } from "../src/model/markdown";
import { SAMPLES } from "../src/model/sample";
import type { TreeDoc } from "../src/model/types";
import type { Page } from "./cdp";

export type ViewId = "tree" | "markdown" | "diagram";

export const VIEW_LABELS: Record<ViewId, string> = {
  tree: "Tree",
  markdown: "Markdown",
  diagram: "Diagram",
};

/** The profit-decline sample: four levels, both statuses, fifteen items. */
export const FIXTURE_SAMPLE = SAMPLES[0];

export const FIXTURE_DOC: TreeDoc = parseMarkdown(FIXTURE_SAMPLE.markdown, FIXTURE_SAMPLE.name).doc;

/** A document with no items at all, which is the empty state of the outline. */
export const EMPTY_DOC: TreeDoc = buildDoc("Empty tree", []);

const DOC_KEY = "its.doc";
const VERSIONS_KEY = "its.versions";

/** Per-tab display state. It starts clean so every run is comparable. */
const TRANSIENT_KEYS = ["its.collapsed", "its.panel", "its.zoom"];

/**
 * Source evaluated before the app boots, so the app opens the fixture. The soft
 * cap nudge is suppressed because a toast over the layout is not evidence.
 */
export function seedSource(doc: TreeDoc = FIXTURE_DOC): string {
  return `(() => {
    try {
      sessionStorage.setItem(${JSON.stringify(DOC_KEY)}, ${JSON.stringify(JSON.stringify(doc))});
      sessionStorage.setItem(${JSON.stringify(VERSIONS_KEY)}, "[]");
      sessionStorage.setItem("its.nudged", "1");
      for (const key of ${JSON.stringify(TRANSIENT_KEYS)}) sessionStorage.removeItem(key);
    } catch (error) {
      /* storage is unavailable; the app falls back to its empty state */
    }
  })()`;
}

/** Switch workspace view by clicking its tab, so the switch is a real one. */
export async function selectView(page: Page, view: ViewId): Promise<void> {
  const label = VIEW_LABELS[view];
  const clicked = await page.evaluate<boolean>(`(() => {
    const wanted = ${JSON.stringify(label)};
    const tab = [...document.querySelectorAll(".view-tab")].find((element) =>
      (element.textContent || "").trim().startsWith(wanted),
    );
    if (!tab) return false;
    tab.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`No view tab labelled ${label}. Did the view names change?`);
  await page.pause(300);
}
