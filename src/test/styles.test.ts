/**
 * The row's label field must not be user-scrollable, and jsdom cannot check that.
 *
 * A wheel is a real input event over real layout, and jsdom has neither, so a
 * rendered test would pass whatever the stylesheet said. This reads the rule and
 * asserts it, which is the part CI can check. The behaviour itself is measured by
 * the wheel probe case in `scripts/probe.ts`, which needs a browser.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

function ruleFor(selector: string): string {
  const at = css.indexOf(`${selector} {`);
  if (at < 0) throw new Error(`no rule for ${selector}`);
  return css.slice(at, css.indexOf("}", at));
}

describe("the row's label field", () => {
  it("cannot be scrolled by the user, so the wheel reaches the tree", () => {
    const rule = ruleFor(".label-input");
    expect(rule).toContain("overflow: hidden");
    expect(rule).not.toContain("overflow-y: auto");
  });

  it("while the paste box keeps its own scrolling, on purpose", () => {
    // A whole outline goes in there, where scrolling inside the box is the point.
    const rule = ruleFor(".textarea");
    expect(rule).not.toContain("overflow: hidden");
  });
});
