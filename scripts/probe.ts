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
import { CAN_SCROLL, OVERFLOWS, fixtureLongLabel, fixtureManyFindings, fixtureWithComplete, seedSource, selectView, type ViewId } from "./fixtures";
import type { TreeDoc } from "../src/model/types";
import type { Metrics } from "./cdp";

type Field = keyof Metrics;

/**
 * Label fields hiding part of a line. A field is either entirely visible or it
 * scrolls, and what it scrolls past must be whole lines, or the eye sees a cut
 * glyph above the next row.
 */
const PARTIAL_CLIPS = `[...document.querySelectorAll(".row .label-input")].filter((field) => {
  const overflow = field.scrollHeight - field.clientHeight;
  if (overflow <= 1) return false;
  const line = Number.parseFloat(getComputedStyle(field).lineHeight);
  const hidden = overflow / line;
  return Math.abs(hidden - Math.round(hidden)) > 0.2;
}).length`;

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
  /** Overrides the seeded document, for a state the fixture cannot show. */
  doc?: TreeDoc;
  /** Elements to report. */
  selectors?: string[];
  /** Page source run before measuring, for a state such as folded. */
  setup?: string;
  /** An element to put a real pointer over before measuring. */
  hover?: string;
  /** A real wheel over an element before measuring, for scroll behaviour. */
  wheel?: { selector: string; deltaY: number };
  /** Real typed text at the end of an element's value, for caret behaviour. */
  type?: { selector: string; text: string };
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
      ".markdown-foot",
      ".row .label-input",
      ".row .label-input:not(.root-label)",
      ".row .label-input.root-label",
      ".row .key-chip",
      ".chevron",
      ".section-head",
      ".icon-btn",
      ".doc-title",
    ],
    derived: {
      rows: `document.querySelectorAll(".row").length`,
      partialClips: PARTIAL_CLIPS,
      numberedRows: `document.querySelectorAll(".row-number").length`,
      elbows: `document.querySelectorAll(".elbow").length`,
      /** A leaf draws no arrow, so the slot count is the leaf count. */
      slots: `document.querySelectorAll(".chevron-slot").length`,
      /** A chip whose own text is wider than the box the row gives it. */
      chipsOverflowing: `[...document.querySelectorAll(".row .key-chip")].filter((element) => element.scrollWidth > element.clientWidth + 1).length`,
      /** The spread of the numbers' left edges: a column has none. */
      numberSpread: `(() => {
        const lefts = [...document.querySelectorAll(".row-number")].map((element) => Math.round(element.getBoundingClientRect().left));
        if (lefts.length === 0) return null;
        return Math.max(...lefts) - Math.min(...lefts);
      })()`,
      indentStep: `(() => {
        const rows = [...document.querySelectorAll(".row")];
        const second = rows.find((row) => row.getAttribute("aria-level") === "2");
        const elbows = second ? second.querySelector(".elbows") : null;
        return elbows ? Math.round(elbows.getBoundingClientRect().width) : null;
      })()`,
    },
    checks: [
      { label: "the fixture renders every item", derived: "rows", exact: 18 },
      { label: "no label hides part of a line", derived: "partialClips", exact: 0 },
      { label: "every row carries a number", derived: "numberedRows", exact: 18 },
      { label: "the numbers line up in one column", derived: "numberSpread", exact: 0 },
      { label: "the footer text starts at the outline's inset", from: ".markdown-foot", field: "paddingLeft", exact: 16 },
      { label: "an item label is 18px", from: ".row .label-input:not(.root-label)", field: "fontSize", exact: 18 },
      { label: "the root label is 20px", from: ".row .label-input.root-label", field: "fontSize", exact: 20 },
      { label: "a panel heading is 13px", from: ".section-head", field: "fontSize", exact: 13 },
      { label: "a button is 14px", from: ".icon-btn", field: "fontSize", exact: 14 },
      { label: "the key chip is 13px", from: ".row .key-chip", field: "fontSize", exact: 13 },
      { label: "every key chip holds its whole key", derived: "chipsOverflowing", exact: 0 },
      { label: "the indent step is 22px", derived: "indentStep", exact: 22 },
      { label: "every row below the root draws an elbow", derived: "elbows", exact: 17 },
      { label: "every leaf keeps an empty arrow slot", derived: "slots", exact: 10 },
    ],
  },
  {
    name: "tree-folded-1440",
    note: "a folded branch: the elbow, the rail, the arrow states and the hidden count (#15)",
    view: "tree",
    size: [1440, 900],
    setup: `const rows = [...document.querySelectorAll(".row")];
      const second = rows.find((row) => row.getAttribute("aria-level") === "2");
      const arrow = second ? second.querySelector(".chevron") : null;
      if (arrow) arrow.click();`,
    selectors: [".elbows", ".elbow", ".rail", ".chevron", ".chevron-icon", ".chevron-slot", ".collapsed-count"],
    derived: {
      elbows: `document.querySelectorAll(".elbow").length`,
      slots: `document.querySelectorAll(".chevron-slot").length`,
      /** The count is every item inside the branch, at any depth. */
      hiddenCount: `(() => {
        const element = document.querySelector(".collapsed-count");
        if (!element) return null;
        const value = Number.parseInt((element.textContent || "").trim(), 10);
        return Number.isFinite(value) ? value : null;
      })()`,
    },
    checks: [
      { label: "a folded branch says what unfolding reveals", derived: "hiddenCount", exact: 6 },
    ],
  },
  {
    name: "headings-1440",
    note: "the four column headings sit over their own columns (#16)",
    view: "tree",
    size: [1440, 900],
    selectors: [".row-head", ".head-number", ".head-label", ".head-key", ".head-status", ".row .row-number", ".row .label-wrap", ".row .label-input", ".row .key-chip", ".row .status-box"],
    derived: {
      /** Each heading against its column, in the first row. Distance in pixels. */
      numberOffset: `(() => {
        const head = document.querySelector(".row-head");
        const cell = document.querySelector(".row .row-number");
        const heading = head ? head.querySelector(".head-number") : null;
        if (!heading || !cell) return null;
        return Math.round(heading.getBoundingClientRect().left - cell.getBoundingClientRect().left);
      })()`,
      labelOffset: `(() => {
        const head = document.querySelector(".row-head");
        const cell = document.querySelector(".row .label-input");
        const heading = head ? head.querySelector(".head-label") : null;
        if (!heading || !cell) return null;
        return Math.round(heading.getBoundingClientRect().left - cell.getBoundingClientRect().left);
      })()`,
      keyOffset: `(() => {
        const head = document.querySelector(".row-head");
        const cell = document.querySelector(".row .key-chip");
        const heading = head ? head.querySelector(".head-key") : null;
        if (!heading || !cell) return null;
        return Math.round(heading.getBoundingClientRect().left - cell.getBoundingClientRect().left);
      })()`,
      /** The status heading is centred, so its centre is what has to line up. */
      headSticky: `(() => {
        const head = document.querySelector(".row-head");
        return head && getComputedStyle(head).position === "sticky" ? 1 : 0;
      })()`,
      editorHead: `document.querySelectorAll(".editor-head").length`,
      obsoleteControls: `[...document.querySelectorAll("button")].filter((button) =>
        /Expand all|Collapse all|Paste outline/.test(button.textContent || "")).length`,
      statusOffset: `(() => {
        const head = document.querySelector(".row-head");
        const cell = document.querySelector(".row .status-box");
        const heading = head ? head.querySelector(".head-status") : null;
        if (!heading || !cell) return null;
        const centre = (element) => element.getBoundingClientRect().left + element.getBoundingClientRect().width / 2;
        return Math.round(centre(heading) - centre(cell));
      })()`,
    },
    checks: [
      { label: "Item no. sits over the number column", derived: "numberOffset", exact: 0 },
      { label: "Item sits over the item column", derived: "labelOffset", exact: 0 },
      { label: "Key sits over the key column", derived: "keyOffset", exact: 0 },
      { label: "Status is centred over the status column", derived: "statusOffset", min: -1, max: 1 },
      { label: "the heading row sticks while the list scrolls", derived: "headSticky", exact: 1 },
      { label: "no second heading line remains", derived: "editorHead", exact: 0 },
      { label: "the expand and paste controls are gone", derived: "obsoleteControls", exact: 0 },
    ],
  },
  {
    name: "rail-1440",
    note: "the collapsed panel's rail stays inside its column, below the top bar",
    view: "tree",
    size: [1440, 900],
    setup: `const collapse = document.querySelector('[aria-label="Collapse panel"]');
      if (collapse) collapse.click();`,
    selectors: ['[aria-label="Tree panels"] > *', ".topbar", ".rail-btn"],
    derived: {
      /** The rail must not be positioned against an ancestor outside its column. */
      railIsAbsolute: `(() => {
        const rail = document.querySelector('[aria-label="Tree panels"] > *');
        return rail && getComputedStyle(rail).position === "absolute" ? 1 : 0;
      })()`,
      /** Nor may it sit over the top bar, which is what a stray absolute line does. */
      railOverlapsBar: `(() => {
        const rail = document.querySelector('[aria-label="Tree panels"] > *');
        const bar = document.querySelector(".topbar");
        if (!rail || !bar) return null;
        const a = rail.getBoundingClientRect();
        const b = bar.getBoundingClientRect();
        return a.top < b.bottom && a.bottom > b.top ? 1 : 0;
      })()`,
      /** The rail is the collapsed column, not a hairline. */
      railWidth: `(() => {
        const rail = document.querySelector('[aria-label="Tree panels"] > *');
        return rail ? Math.round(rail.getBoundingClientRect().width) : null;
      })()`,
    },
    checks: [
      { label: "the rail is laid out, not positioned against an ancestor", derived: "railIsAbsolute", exact: 0 },
      { label: "the rail does not sit over the top bar", derived: "railOverlapsBar", exact: 0 },
      { label: "the rail fills its 44px column", derived: "railWidth", min: 40 },
    ],
  },
  {
    name: "scroll-1440",
    note: "every view scrolls when its content is taller than the window",
    view: "tree",
    size: [1440, 900],
    doc: fixtureManyFindings(),
    selectors: [".editor-scroll", ".panel-scroll", ".panel-scroll .finding-more", ".panel-scroll .kv", ".panel-scroll .empty-note", ".panel-scroll .key-big", ".panel-scroll .section"],
    derived: {
      listOverflow: OVERFLOWS(".editor-scroll"),
      listCanScroll: CAN_SCROLL(".editor-scroll"),
      panelOverflow: OVERFLOWS(".panel-scroll"),
      panelCanScroll: CAN_SCROLL(".panel-scroll"),
    },
    checks: [
      { label: "the list has more rows than fit", derived: "listOverflow", min: 100 },
      { label: "the list can be scrolled", derived: "listCanScroll", exact: 1 },
      { label: "the panel can be scrolled", derived: "panelCanScroll", exact: 1 },
      { label: "the panel stays bounded as the tree grows", derived: "panelOverflow", max: 40000 },
    ],
  },
  {
    name: "tree-360",
    note: "phone baseline: one pane, 44px targets",
    view: "tree",
    size: [360, 780],
    mobile: true,
    selectors: [".row", ".app.phone .label-input", ".topbar", ".markdown-foot"],
    derived: {
      rows: `document.querySelectorAll(".row").length`,
      partialClips: PARTIAL_CLIPS,
      /** Visible lines in the tallest label, which is the one at its cap. */
      tallestLabelLines: `(() => {        const fields = [...document.querySelectorAll(".row .label-input")];
        if (fields.length === 0) return null;
        const field = fields.reduce((tallest, other) => (other.scrollHeight > tallest.scrollHeight ? other : tallest));
        const style = getComputedStyle(field);
        const line = Number.parseFloat(style.lineHeight);
        const pad = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
        return Math.round(((field.clientHeight - pad) / line) * 1000) / 1000;
      })()`,
      /** On a phone the whole first line belongs to the label. */
      sideways: `document.documentElement.scrollWidth > window.innerWidth ? 1 : 0`,
      /** The phone hides nothing: the footer is the only place the build appears. */
      stampShown: `(() => {
        const stamp = document.querySelector(".footer-build");
        return stamp && getComputedStyle(stamp).display !== "none" ? 1 : 0;
      })()`,
      headHidden: `(() => {
        const head = document.querySelector(".row-head");
        return head && getComputedStyle(head).display === "none" ? 1 : 0;
      })()`,
      numberOnSecondLine: `(() => {
        const row = document.querySelector(".app.phone .row");
        const number = row ? row.querySelector(".row-number") : null;
        const label = row ? row.querySelector(".label-input") : null;
        if (!number || !label) return null;
        return number.getBoundingClientRect().top > label.getBoundingClientRect().top ? 1 : 0;
      })()`,
    },
    checks: [
      { label: "every item renders on a phone", derived: "rows", exact: 18 },
      { label: "a row is at least 44px tall", from: ".row", field: "height", min: 44 },
      { label: "the phone label is 18px too", from: ".app.phone .label-input", field: "fontSize", exact: 18 },
      { label: "no phone label hides part of a line", derived: "partialClips", exact: 0 },
      { label: "the phone does not scroll sideways", derived: "sideways", exact: 0 },
      { label: "the build is reachable on a phone", derived: "stampShown", exact: 1 },
      { label: "the footer wraps rather than clipping", from: ".markdown-foot", field: "height", min: 30 },
      { label: "the number sits on the second line", derived: "numberOnSecondLine", exact: 1 },
      { label: "the heading row is hidden on a phone", derived: "headHidden", exact: 1 },
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
      { label: "the editor is 16px", from: ".markdown-area", field: "fontSize", exact: 16 },
      { label: "the footer is present", from: ".markdown-foot", field: "width", min: 200 },
      { label: "the footer is 13px", from: ".markdown-foot", field: "fontSize", exact: 13 },
    ],
  },
  {
    name: "diagram-1440",
    note: "diagram baseline: box, legend and the left inset (#20, #24)",
    view: "diagram",
    size: [1440, 900],
    selectors: [".diagram-svg", ".diagram-svg .nrect", ".legend", ".diagram-wrap", ".diagram-view .section-head"],
    derived: {
      boxes: `document.querySelectorAll(".diagram-svg .nrect").length`,
      /** Boxes whose first text is a number, so the first line is the number. */
      /** A horizontal scrollbar means the view is wider than the window. */
      sideways: `document.documentElement.scrollWidth > window.innerWidth ? 1 : 0`,
      numberedBoxes: `[...document.querySelectorAll(".diagram-svg text")].filter((element) => /^Q[0-9]/.test((element.textContent || "").trim())).length`,
    },
    checks: [
      { label: "every item has a box", derived: "boxes", exact: 18 },
      { label: "every box leads with its number", derived: "numberedBoxes", exact: 18 },
      { label: "the legend shares the outline's 16px inset", from: ".legend", field: "left", exact: 16 },
      { label: "the diagram border shares it", from: ".diagram-wrap", field: "left", exact: 16 },
      { label: "the plan head shares it", from: ".diagram-view .section-head", field: "left", exact: 16 },
      { label: "the view does not scroll sideways", derived: "sideways", exact: 0 },
      { label: "the canvas is present", from: ".diagram-svg", field: "width", min: 200 },
      // #35 gave the canvas the panel's width, and #20 defines outlines in SVG user units, so the
      // stroke scales with the canvas. The boxes scale by the same factor, so the ratio is unchanged
      // and the number to hold is "thin", not 1.6px at one particular window width.
      { label: "the resting outline is thin too", from: ".diagram-svg .nrect", field: "strokePx", min: 0.5, max: 3 },
      { label: "at Fit the canvas is exactly the frame", from: ".diagram-svg", field: "width", min: 200 },
    ],
  },
  {
    name: "diagram-zoom",
    note: "the canvas grows with the level, and the wrapper scrolls (#21)",
    view: "diagram",
    size: [1440, 900],
    selectors: [".diagram-svg", ".zoom-level", ".diagram-wrap"],
    setup: `const plus = document.querySelector('[aria-label="Zoom in"]');
      for (let step = 0; step < 12; step += 1) { if (plus) plus.click(); }`,
    derived: {
      /** The level the toolbar shows, which is what the twelve steps reached. */
      zoomLevel: `(() => {
        const label = document.querySelector(".zoom-level");
        const value = Number.parseInt((label ? label.textContent : "") || "", 10);
        return Number.isFinite(value) ? value : null;
      })()`,
      /** Wider than the wrapper means the wrapper can finally scroll. */
      scrollsSideways: `(() => {
        const wrap = document.querySelector(".diagram-wrap");
        return wrap && wrap.scrollWidth > wrap.clientWidth + 1 ? 1 : 0;
      })()`,
    },
    checks: [
      { label: "twelve steps reach the ceiling", derived: "zoomLevel", exact: 400 },
      { label: "the zoomed canvas is wider than its frame", derived: "scrollsSideways", exact: 1 },
    ],
  },
  {
    name: "diagram-folded-1440",
    note: "a folded branch leaves the layout, and the box counts what it hides (#22)",
    view: "diagram",
    size: [1440, 900],
    doc: fixtureWithComplete(),
    setup: `const chevron = document.querySelector('[aria-label="Collapse Did revenue decline?"]');
      if (chevron) chevron.dispatchEvent(new MouseEvent("click", { bubbles: true }));`,
    selectors: [".diagram-svg .nrect", ".legend", ".folded-count"],
    derived: {
      boxes: `document.querySelectorAll(".diagram-svg .nrect").length`,
      foldedCount: `(() => {
        const element = document.querySelector(".folded-count");
        if (!element) return null;
        const value = Number.parseInt((element.textContent || "").trim(), 10);
        return Number.isFinite(value) ? value : null;
      })()`,
    },
    checks: [
      { label: "the folded branch left the layout", derived: "boxes", exact: 12 },
      { label: "the box says what it hides", derived: "foldedCount", exact: 6 },
    ],
  },
  {
    name: "diagram-markers-1440",
    note: "the shared status marker: a rounded square, and a tick when complete (#23)",
    view: "diagram",
    size: [1440, 900],
    doc: fixtureWithComplete(),
    selectors: [".diagram-svg .marker-square", ".diagram-svg .marker-tick", ".diagram-svg .nrect"],
    derived: {
      squares: `document.querySelectorAll(".diagram-svg .marker-square").length`,
      ticks: `document.querySelectorAll(".diagram-svg .marker-tick").length`,
      completeSquares: `document.querySelectorAll(".diagram-svg .marker-square.complete").length`,
      /** The glyph the marker replaced was a circle; none should be left. */
      circles: `document.querySelectorAll(".diagram-svg circle").length`,
    },
    checks: [
      { label: "every box carries a marker square", derived: "squares", exact: 18 },
      { label: "only the complete item carries a tick", derived: "ticks", exact: 1 },
      { label: "the complete square says so", derived: "completeSquares", exact: 1 },
      { label: "no circle marker is left", derived: "circles", exact: 0 },
    ],
  },
  {
    name: "diagram-hover",
    note: "hover outline thickness, which must read 2 to 4px (#20)",
    view: "diagram",
    size: [1440, 900],
    selectors: [".diagram-svg .nrect"],
    hover: ".diagram-svg .nrect",
    checks: [
      {
        label: "the hover outline is a thin band, not a filled box",
        from: ".diagram-svg .nrect",
        field: "strokePx",
        min: 0.5,
        max: 4,
      },
    ],
  },
  {
    name: "wheel-over-field-1440",
    note: "a wheel over a row's label field scrolls the tree, not the field (#30)",
    view: "tree",
    size: [1440, 900],
    doc: fixtureLongLabel(),
    selectors: [".editor-scroll", ".row .label-input"],
    wheel: { selector: ".row .label-input", deltaY: 400 },
    derived: {
      /** What the field hides of its own text. Zero would make this case vacuous. */
      fieldClip: `(() => {
        const field = document.querySelector(".row .label-input");
        return field ? Math.round(field.scrollHeight - field.clientHeight) : -1;
      })()`,
      treeScrollTop: `Math.round(document.querySelector(".editor-scroll").scrollTop)`,
      fieldScrollTop: `Math.round((document.querySelector(".row .label-input") || { scrollTop: -1 }).scrollTop)`,
    },
    checks: [
      { label: "the field really does hide text, so the wheel had something to take", derived: "fieldClip", min: 8 },
      { label: "the wheel scrolled the tree", derived: "treeScrollTop", min: 100 },
      { label: "the field did not scroll itself", derived: "fieldScrollTop", exact: 0 },
    ],
  },
  {
    name: "caret-in-field-1440",
    note: "the browser still reveals the caret while typing a long label (#30)",
    view: "tree",
    size: [1440, 900],
    doc: fixtureLongLabel(),
    selectors: [".row .label-input"],
    type: { selector: ".row .label-input", text: "X" },
    derived: {
      fieldClip: `(() => {
        const field = document.querySelector(".row .label-input");
        return field ? Math.round(field.scrollHeight - field.clientHeight) : -1;
      })()`,
      /** Nonzero only because typing scrolled the field to keep the caret in view. */
      fieldScrollTop: `Math.round((document.querySelector(".row .label-input") || { scrollTop: -1 }).scrollTop)`,
    },
    checks: [
      { label: "the field hides text", derived: "fieldClip", min: 8 },
      {
        label: "typing still scrolls the field to the caret",
        derived: "fieldScrollTop",
        min: 1,
        max: 60,
      },
    ],
  },
  {
    name: "panel-details-1440",
    note: "the Details tab holds the Key and the Checks, and no item budget meter (#38)",
    view: "tree",
    size: [1440, 900],
    selectors: [".panel-scroll"],
    derived: {
      headings: `document.querySelectorAll(".panel-scroll .section-head").length`,
      meters: `document.querySelectorAll(".meter").length`,
      /** Named for the log, so the two headings are visible and not just counted. */
      names: `[...document.querySelectorAll(".panel-scroll .section-head span:first-child")]
        .map((span) => (span.textContent || "").trim())
        .join("|")`,
    },
    checks: [
      { label: "the Details tab holds exactly two sections", derived: "headings", exact: 2 },
      { label: "no item budget meter is left", derived: "meters", exact: 0 },
    ],
  },
  {
    name: "panel-markdown-1440",
    note: "Markdown has no right panel, and the workspace takes the width (#35)",
    view: "markdown",
    size: [1440, 900],
    selectors: [".workspace"],
    derived: {
      panels: `document.querySelectorAll(".rightbar").length`,
      widthGap: `(() => {
        const body = document.querySelector(".body");
        const workspace = document.querySelector(".workspace");
        if (!body || !workspace) return null;
        return Math.round(body.getBoundingClientRect().width - workspace.getBoundingClientRect().width);
      })()`,
    },
    checks: [
      { label: "no right panel exists", derived: "panels", exact: 0 },
      { label: "the workspace fills the body", derived: "widthGap", min: 0, max: 2 },
      { label: "the markdown editor keeps most of the window", from: ".workspace", field: "width", min: 1000 },
    ],
  },
  {
    name: "panel-diagram-1440",
    note: "Diagram has no right panel either (#35)",
    view: "diagram",
    size: [1440, 900],
    selectors: [".workspace"],
    derived: {
      panels: `document.querySelectorAll(".rightbar").length`,
      widthGap: `(() => {
        const body = document.querySelector(".body");
        const workspace = document.querySelector(".workspace");
        if (!body || !workspace) return null;
        return Math.round(body.getBoundingClientRect().width - workspace.getBoundingClientRect().width);
      })()`,
    },
    checks: [
      { label: "no right panel exists", derived: "panels", exact: 0 },
      { label: "the workspace fills the body", derived: "widthGap", min: 0, max: 2 },
      { label: "the canvas keeps most of the window", from: ".workspace", field: "width", min: 1000 },
    ],
  },
];

function format(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "missing";
  if (typeof value === "string") return value;
  if (Number.isNaN(value)) return "missing";
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
    seed: seedSource(probe.doc),
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
    if (probe.wheel) await page.wheel(probe.wheel.selector, probe.wheel.deltaY);
    if (probe.type) await page.type(probe.type.selector, probe.type.text);

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
