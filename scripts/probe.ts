/**
 * Visual gate: computed metrics for named selectors, per view and window size.
 *
 * A unit test can prove what the model computes. It cannot prove that a label
 * renders at 16px, that a stroke is 2px thick on screen, or that a column's left
 * edge lines up with the heading above it. This script reads those numbers out
 * of a real browser, so a visual ticket is closed against a measurement rather
 * than an impression.
 *
 * Run: npm run probe              all cases
 *      npm run probe -- tree      only cases whose name contains "tree"
 *      npm run probe -- --json    the raw measurements
 *
 * Exit code 1 when any check fails, so a phase gate can use it directly.
 */

import { Page } from "./cdp";
import { seedSource, selectView, type ViewId } from "./fixtures";
import type { Metrics } from "./cdp";

type Field = keyof Metrics;

interface Check {
  label: string;
  from?: string;
  derived?: string;
  field?: Field;
  exact?: number;
  min?: number;
  max?: number;
}

interface ProbeCase {
  name: string;
  /** What this case exists to measure, usually a ticket. */
  note: string;
  view?: ViewId;
  size?: [number, number];
  mobile?: boolean;
  /** Elements to report. */
  selectors?: string[];
  /** Page source run before measuring, for a state such as folded. */
  setup?: string;
  /** An element to put a real pointer over before measuring. */
  hover?: string;
  /** Numbers computed in the page, reported beside the selectors. */
  derived?: Record<string, string>;
  checks?: Check[];
}

const CASES: ProbeCase[] = [
  {
    name: "tree-1440",
    note: "list baseline: label size, root size and the indent step (#15, #17)",
    view: "tree",
    size: [1440, 900],
    selectors: [
      ".row",
      ".row .label-input",
      ".row .label-input:not(.root-label)",
      ".row .label-input.root-label",
      ".row .key-chip",
      ".chevron",
    ],
    derived: {
      rows: `document.querySelectorAll(".row").length`,
      indentStep: `(() => {
        const rows = [...document.querySelectorAll(".row")];
        const first = rows.find((row) => row.getAttribute("aria-level") === "1");
        const second = rows.find((row) => row.getAttribute("aria-level") === "2");
        if (!first || !second) return null;
        return second.getBoundingClientRect().left - first.getBoundingClientRect().left;
      })()`,
    },
    checks: [
      { label: "the fixture renders every item", derived: "rows", exact: 18 },
      { label: "a row label is 16px", from: ".row .label-input:not(.root-label)", field: "fontSize", exact: 16 },
      { label: "the root label is 17px", from: ".row .label-input.root-label", field: "fontSize", exact: 17 },
      { label: "the indent step is 15px", derived: "indentStep", exact: 15 },
    ],
  },
  {
    name: "tree-360",
    note: "phone baseline: one pane, 44px targets",
    view: "tree",
    size: [360, 780],
    mobile: true,
    selectors: [".row", ".row .label-input", ".topbar"],
    derived: { rows: `document.querySelectorAll(".row").length` },
    checks: [
      { label: "every item renders on a phone", derived: "rows", exact: 18 },
      { label: "a row is at least 44px tall", from: ".row", field: "height", min: 44 },
    ],
  },
  {
    name: "markdown-1440",
    note: "live markdown view and its footer",
    view: "markdown",
    size: [1440, 900],
    selectors: [".markdown-area", ".markdown-head", ".markdown-foot"],
    checks: [
      { label: "the editor is present", from: ".markdown-area", field: "width", min: 200 },
      { label: "the footer is present", from: ".markdown-foot", field: "width", min: 200 },
    ],
  },
  {
    name: "diagram-1440",
    note: "diagram baseline: box, legend and the left inset (#20, #24)",
    view: "diagram",
    size: [1440, 900],
    selectors: [".diagram-svg", ".diagram-svg .nrect", ".legend", ".diagram-wrap"],
    derived: { boxes: `document.querySelectorAll(".diagram-svg .nrect").length` },
    checks: [
      { label: "every item has a box", derived: "boxes", exact: 18 },
      { label: "the canvas is present", from: ".diagram-svg", field: "width", min: 200 },
    ],
  },
  {
    name: "diagram-hover",
    note: "hover outline thickness, which must read 2 to 4px (#20)",
    view: "diagram",
    size: [1440, 900],
    selectors: [".diagram-svg .nrect"],
    hover: ".diagram-svg .nrect",
  },
];

function format(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "missing";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function describe(metric: Metrics): string {
  const parts = [
    `font ${format(metric.fontSize)}px`,
    `box ${metric.left},${metric.top} ${metric.width}x${metric.height}`,
  ];
  if (metric.lineHeight > 0) parts.splice(1, 0, `line ${format(metric.lineHeight)}px`);
  if (metric.strokeWidth > 0) {
    parts.push(`stroke ${format(metric.strokeWidth)}uu = ${format(metric.strokePx)}px`);
  }
  if (metric.text) parts.push(`"${metric.text}"`);
  return parts.join("  ");
}

interface Outcome {
  check: Check;
  ok: boolean;
  value: number | null;
}

function valueOf(
  check: Check,
  metrics: Record<string, Metrics | null>,
  derived: Record<string, number | null>,
): number | null {
  if (check.derived) {
    const value = derived[check.derived];
    return value === undefined ? null : value;
  }
  if (check.from && check.field) {
    const metric = metrics[check.from];
    if (!metric) return null;
    const value = metric[check.field];
    return typeof value === "number" ? value : null;
  }
  return null;
}

function judge(check: Check, value: number | null): boolean {
  if (value === null) return false;
  if (check.exact !== undefined) return value === check.exact;
  if (check.min !== undefined && value < check.min) return false;
  if (check.max !== undefined && value > check.max) return false;
  return true;
}

function want(check: Check): string {
  if (check.exact !== undefined) return `exactly ${check.exact}`;
  if (check.min !== undefined && check.max !== undefined) return `${check.min} to ${check.max}`;
  if (check.min !== undefined) return `at least ${check.min}`;
  if (check.max !== undefined) return `at most ${check.max}`;
  return "anything";
}

async function runCase(probe: ProbeCase): Promise<Outcome[]> {
  const [width, height] = probe.size ?? [1440, 900];
  const page = await Page.open({
    seed: seedSource(),
    width,
    height,
    mobile: probe.mobile ?? false,
  });

  try {
    if (probe.view) await selectView(page, probe.view);
    if (probe.setup) {
      await page.evaluate(`(() => { ${probe.setup} })()`);
      await page.pause(300);
    }
    if (probe.hover) await page.hover(probe.hover);

    const selectors = probe.selectors ?? [];
    const metrics = selectors.length > 0 ? await page.measure(selectors) : {};

    const derived: Record<string, number | null> = {};
    for (const [name, expression] of Object.entries(probe.derived ?? {})) {
      derived[name] = await page.evaluate<number | null>(`(() => { return ${expression}; })()`);
    }

    console.log(`\n${probe.name}  ${width}x${height}${probe.mobile ? " phone" : ""}  ${probe.note}`);
    for (const selector of selectors) {
      const metric = metrics[selector];
      console.log(`  ${selector.padEnd(34)} ${metric ? describe(metric) : "not found"}`);
    }
    for (const [name, value] of Object.entries(derived)) {
      console.log(`  ${name.padEnd(34)} ${format(value)}`);
    }

    const outcomes = (probe.checks ?? []).map((check) => {
      const value = valueOf(check, metrics, derived);
      return { check, value, ok: judge(check, value) };
    });
    for (const outcome of outcomes) {
      const mark = outcome.ok ? "PASS" : "FAIL";
      console.log(`  ${mark}  ${outcome.check.label}  (want ${want(outcome.check)}, got ${format(outcome.value)})`);
    }

    if (page.errors.length > 0) {
      console.log(`  ${page.errors.length} page error(s):`);
      for (const error of page.errors.slice(0, 5)) console.log(`    ${error.split("\n")[0]}`);
    }
    return outcomes;
  } finally {
    await page.close();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const filter = args.find((arg) => !arg.startsWith("--"));
  const cases = filter ? CASES.filter((entry) => entry.name.includes(filter)) : CASES;
  if (cases.length === 0) throw new Error(`No probe case matches "${filter}".`);

  const results: Record<string, Outcome[]> = {};
  for (const probe of cases) results[probe.name] = await runCase(probe);

  if (json) console.log(`\n${JSON.stringify(results, null, 2)}`);

  const all = Object.values(results).flat();
  const failed = all.filter((outcome) => !outcome.ok);
  console.log(`\n${all.length - failed.length} of ${all.length} checks pass.`);
  if (failed.length > 0) process.exitCode = 1;
}

await main();
