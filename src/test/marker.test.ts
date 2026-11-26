/**
 * One definition of the status marker.
 *
 * The diagram draws it as SVG and the deck as PowerPoint shapes, so the test that
 * matters is that both callers take their geometry from one place, and that the
 * geometry behaves the way the ticket describes.
 */

import { describe, expect, it } from "vitest";
import { MARKER, markerFor } from "../model/marker";
import { deckMarker } from "../export/pptx";

/** The line height the diagram uses for a nine-unit box. */
const LINE = (9 * 1.24) / 72;

describe("the status marker", () => {
  it("gives the deck exactly what it gives the diagram", () => {
    expect(deckMarker("complete", 1, 2.05, 9)).toEqual(markerFor("complete", 1, 2.05, LINE));
    expect(deckMarker("open", 1, 2.05, 9)).toEqual(markerFor("open", 1, 2.05, LINE));
  });

  it("draws a square with a tick for a complete item", () => {
    const marker = markerFor("complete", 1, 2, LINE);
    expect(marker.tick).toHaveLength(3);
    expect(marker.w).toBeCloseTo(marker.h, 6);
    expect(marker.r).toBeGreaterThan(0);
  });

  it("leaves the square empty for an open item", () => {
    expect(markerFor("open", 1, 2, LINE).tick).toEqual([]);
  });

  it("is larger than the circle it replaced, and never taller than its line", () => {
    const marker = markerFor("open", 1, 2, LINE);
    expect(marker.w).toBeGreaterThan(0.076);
    expect(marker.h).toBeLessThanOrEqual(LINE);
    expect(markerFor("open", 1, 2, 0.5).h).toBe(MARKER.maxSize);
  });

  it("centres on the line rather than sitting on the baseline", () => {
    expect(markerFor("open", 1, 2, LINE).y + markerFor("open", 1, 2, LINE).h / 2).toBeCloseTo(
      2 + LINE / 2,
      6,
    );
  });

  it("keeps the centre at the x the circle used", () => {
    const marker = markerFor("open", 1.5, 2, LINE);
    expect(marker.x + marker.w / 2).toBeCloseTo(1.6, 6);
  });
});
