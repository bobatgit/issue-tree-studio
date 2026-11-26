/**
 * One definition of the status marker, shared by the diagram and the deck.
 *
 * The marker is a rounded square: filled in the accent with a white tick when the
 * item is complete, empty with a quiet border when it is open. Both callers work
 * in inches, so one definition serves the screen and the slide and the two cannot
 * drift apart.
 *
 * The marker sits on a box's first line, which is the number line, centred on
 * that line's optical middle rather than on its baseline, where a text glyph
 * reads low.
 */

import type { ItemStatus } from "./types";

/**
 * The marker's proportions. Nothing here is in pixels or points: it is a fraction
 * of the line it sits on, or of its own box.
 */
export const MARKER = {
  /** Never taller than its line. */
  sizeRatio: 0.62,
  /** A ceiling, so an unusually tall line does not grow a huge marker. */
  maxSize: 0.1,
  /** The centre, measured from the left edge of the box it belongs to. */
  centre: 0.1,
  radiusRatio: 0.24,
  strokeRatio: 0.14,
  /** The tick, as fractions of the marker's own box. */
  tick: [
    [0.24, 0.52],
    [0.44, 0.71],
    [0.76, 0.3],
  ],
  colour: {
    /**
     * A complete marker is filled, so its tick has to be the light colour to be
     * seen at all. This is also what the Tree view's checkbox already does.
     */
    completeFill: "2F6FEB",
    completeTick: "FFFFFF",
    openFill: "none",
    openBorder: "94A3B8",
  },
} as const;

export interface MarkerGeometry {
  status: ItemStatus;
  /** The rounded square, in inches. */
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  stroke: number;
  /** The tick through three points, empty when the item is open. */
  tick: { x: number; y: number }[];
}

/**
 * The marker for one box's first line.
 *
 * `boxX` is the box's left edge, `lineTop` the top of the first line's text and
 * `lineHeight` its height in inches.
 */
export function markerFor(
  status: ItemStatus,
  boxX: number,
  lineTop: number,
  lineHeight: number,
): MarkerGeometry {
  const size = Math.min(lineHeight * MARKER.sizeRatio, MARKER.maxSize);
  const x = boxX + MARKER.centre - size / 2;
  const y = lineTop + lineHeight / 2 - size / 2;
  return {
    status,
    x,
    y,
    w: size,
    h: size,
    r: size * MARKER.radiusRatio,
    stroke: size * MARKER.strokeRatio,
    tick:
      status === "complete"
        ? MARKER.tick.map(([fx, fy]) => ({ x: x + fx * size, y: y + fy * size }))
        : [],
  };
}
