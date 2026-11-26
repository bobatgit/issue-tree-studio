/**
 * Visual gate: PNG evidence for an issue, taken from a real browser.
 *
 * Every visual ticket in this batch is closed with a picture attached to the
 * issue. This script takes them, at a fixed size, from the same seeded document
 * the probe measures, so the pictures and the numbers describe one state.
 *
 * Run: npm run shots                 all shots
 *      npm run shots -- tree         only shots whose name contains "tree"
 *
 * Files land in docs/screenshots/.
 */

import path from "node:path";
import { stat } from "node:fs/promises";
import { Page } from "./cdp";
import { EMPTY_DOC, fixtureWithComplete, seedSource, selectView, type ViewId } from "./fixtures";
import type { TreeDoc } from "../src/model/types";

interface Shot {
  name: string;
  note: string;
  view?: ViewId;
  size?: [number, number];
  mobile?: boolean;
  /** Overrides the seeded document, for a state the fixture cannot show. */
  doc?: TreeDoc;
  /** Page source run before the shot, for a state such as folded. */
  setup?: string;
  /** An element to put a real pointer over before the shot. */
  hover?: string;
}

const OUT = path.resolve("docs/screenshots");

const SHOTS: Shot[] = [
  {
    name: "gate-tree-1440",
    note: "the list at desktop width",
    view: "tree",
    size: [1440, 900],
  },
  {
    name: "gate-rail-1440",
    note: "the collapsed panel's rail, which must stay in its column",
    view: "tree",
    size: [1440, 900],
    setup: `const collapse = document.querySelector('[aria-label="Collapse panel"]');
      if (collapse) collapse.click();`,
  },
  {
    name: "gate-tree-360",
    note: "the list at phone width",
    view: "tree",
    size: [360, 780],
    mobile: true,
  },
  {
    name: "gate-tree-folded-1440",
    note: "a folded branch and its hidden count",
    view: "tree",
    size: [1440, 900],
    setup: `const chevron = document.querySelector(".row .chevron"); if (chevron) chevron.click();`,
  },
  {
    name: "ticket-18-items-1440",
    note: "the interface after the rename: every count reads items (#18)",
    view: "tree",
    size: [1440, 900],
  },
  {
    name: "ticket-18-empty-1440",
    note: "the empty state a tab from before the rename lands on (#18)",
    view: "tree",
    size: [1440, 900],
    doc: EMPTY_DOC,
  },
  {
    name: "ticket-25-footer-tree-1440",
    note: "the Tree view footer: its counts on the left, the build on the right (#25)",
    view: "tree",
    size: [1440, 900],
  },
  {
    name: "ticket-25-footer-360",
    note: "the footer at 360, where it wraps rather than clipping (#25)",
    view: "tree",
    size: [360, 780],
    mobile: true,
  },
  {
    name: "ticket-25-footer-diagram-1440",
    note: "the Diagram footer carrying its counts and the build (#25)",
    view: "diagram",
    size: [1440, 900],
  },
  {
    name: "ticket-22-folded-1440",
    note: "a folded branch: the connector ends at the chevron, and the box counts what it hides (#22)",
    view: "diagram",
    size: [1440, 900],
    doc: fixtureWithComplete(),
    setup: `const chevron = document.querySelector('[aria-label="Collapse Did revenue decline?"]');
      if (chevron) chevron.dispatchEvent(new MouseEvent("click", { bubbles: true }));`,
  },
  {
    name: "ticket-23-markers-1440",
    note: "a complete marker beside an open one, in the shared square (#23)",
    view: "diagram",
    size: [1440, 900],
    doc: fixtureWithComplete(),
  },
  {
    name: "ticket-21-zoom-400",
    note: "the canvas at 400 percent, where the wrapper scrolls (#21)",
    view: "diagram",
    size: [1440, 900],
    setup: `const plus = document.querySelector('[aria-label="Zoom in"]');
      for (let step = 0; step < 12; step += 1) { if (plus) plus.click(); }`,
  },
  {
    name: "ticket-24-inset-1440",
    note: "the diagram view inset to 16px, with its legend as a section label (#24)",
    view: "diagram",
    size: [1440, 900],
  },
  {
    name: "ticket-16-headings-1440",
    note: "the four column headings over their columns, and hidden on a phone (#16)",
    view: "tree",
    size: [1440, 900],
  },
  {
    name: "ticket-15-levels-1440",
    note: "elbows and rails at four levels, and the arrow states (#15)",
    view: "tree",
    size: [1440, 900],
  },
  {
    name: "ticket-15-folded-1440",
    note: "a folded branch: the filled arrow and the count of what it hides (#15)",
    view: "tree",
    size: [1440, 900],
    setup: `const rows = [...document.querySelectorAll(".row")];
      const second = rows.find((row) => row.getAttribute("aria-level") === "2");
      const arrow = second ? second.querySelector(".chevron") : null;
      if (arrow) arrow.click();`,
  },
  {
    name: "ticket-27-keys-1440",
    note: "key chips reading A3E-B88 shape, and the row wide enough to hold them (#27)",
    view: "tree",
    size: [1440, 900],
  },
  {
    name: "ticket-27-keys-360",
    note: "the phone row with a dashed key on the second line (#27)",
    view: "tree",
    size: [360, 780],
    mobile: true,
  },
  {
    name: "ticket-27-diagram-1440",
    note: "dashed keys in the diagram boxes (#27)",
    view: "diagram",
    size: [1440, 900],
  },
  {
    name: "ticket-12-numbers-1440",
    note: "the number column, Q0 to Q2.2.2, at desktop width (#12)",
    view: "tree",
    size: [1440, 900],
  },
  {
    name: "ticket-12-numbers-360",
    note: "the phone row, where the number joins the key on the second line (#12)",
    view: "tree",
    size: [360, 780],
    mobile: true,
  },
  {
    name: "ticket-12-diagram-1440",
    note: "every box leads with its number, beside the status marker (#12)",
    view: "diagram",
    size: [1440, 900],
  },
  {
    name: "ticket-17-type-1440",
    note: "the type scale at desktop width, where the labels are 18px and the root 20px (#17)",
    view: "tree",
    size: [1440, 900],
  },
  {
    name: "ticket-17-type-360",
    note: "the type scale at phone width, where the two-line row must still hold (#17)",
    view: "tree",
    size: [360, 780],
    mobile: true,
  },
  {
    name: "ticket-19-rail-1440",
    note: "the collapsed rail, with the clock beside the details glyph (#19)",
    view: "tree",
    size: [1440, 900],
    setup: `const collapse = document.querySelector('[aria-label="Collapse panel"]'); if (collapse) collapse.click();`,
  },
  {
    name: "ticket-26-settings-1440",
    note: "the settings dialog after the Keys section was deleted (#26)",
    view: "tree",
    size: [1440, 900],
    setup: `const cog = document.querySelector('[aria-label="Settings"]'); if (cog) cog.click();`,
  },
  {
    name: "gate-markdown-1440",
    note: "the live markdown view",
    view: "markdown",
    size: [1440, 900],
  },
  {
    name: "gate-diagram-1440",
    note: "the diagram view",
    view: "diagram",
    size: [1440, 900],
  },
  {
    name: "gate-diagram-hover-1440",
    note: "a hovered box, for the outline thickness",
    view: "diagram",
    size: [1440, 900],
    hover: ".diagram-svg .nrect",
  },
];

function slug(value: string): string {
  return value.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
}

async function runShot(shot: Shot): Promise<void> {
  const [width, height] = shot.size ?? [1440, 900];
  const page = await Page.open({
    seed: seedSource(shot.doc),
    width,
    height,
    mobile: shot.mobile ?? false,
  });

  try {
    if (shot.view) await selectView(page, shot.view);
    if (shot.setup) {
      await page.evaluate(`(() => { ${shot.setup} })()`);
      await page.pause(300);
    }
    if (shot.hover) await page.hover(shot.hover);

    const file = path.join(OUT, `${slug(shot.name)}.png`);
    await page.screenshot(file);
    const size = (await stat(file)).size;
    console.log(`${file}  ${width}x${height}  ${Math.round(size / 1024)}KB  ${shot.note}`);

    if (page.errors.length > 0) {
      console.log(`  ${page.errors.length} page error(s):`);
      for (const error of page.errors.slice(0, 5)) console.log(`    ${error.split("\n")[0]}`);
    }
  } finally {
    await page.close();
  }
}

async function main(): Promise<void> {
  const filter = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
  const shots = filter ? SHOTS.filter((entry) => entry.name.includes(filter)) : SHOTS;
  if (shots.length === 0) throw new Error(`No shot matches "${filter}".`);

  for (const shot of shots) await runShot(shot);
  console.log(`\n${shots.length} shot(s) written to ${OUT}`);
}

await main();
