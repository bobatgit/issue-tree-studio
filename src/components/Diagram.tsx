import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { layoutTree, packSlides } from "../model/layout";
import { subtreeSizes, visibleEntries } from "../model/tree";
import { countItems } from "../model/tree";
import type { Workspace } from "../store/useWorkspace";
import { MARKER, markerFor } from "../model/marker";
import { Footer } from "./Footer";

interface Props {
  ws: Workspace;
}

const ITEM_STYLE = { fill: "#F8FAFC", border: "#94A3B8", text: "#1E293B" };

const ROOT = { fill: "#1E293B", border: "#0F172A", text: "#FFFFFF" };

/** Zoom is remembered per tab, like the fold state, and never touches the document. */
const ZOOM_KEY = "its.zoom";
const ZOOM_MIN = 25;
const ZOOM_MAX = 400;
const ZOOM_STEP = 1.25;

function readZoom(): number {
  try {
    const raw = Number.parseFloat(sessionStorage.getItem(ZOOM_KEY) ?? "");
    return Number.isFinite(raw) ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, raw)) : 100;
  } catch {
    return 100;
  }
}

export function Diagram({ ws }: Props) {
  const doc = ws.doc;
  const showKeys = doc?.settings.showKeysInEditor ?? true;

  /**
   * The folded set is the Tree view's, so a branch folded in one view is folded
   * in the other. A folded branch leaves the layout entirely, which closes the
   * gap and takes its edges with it.
   */
  const visible = useMemo(
    () => (doc ? visibleEntries(doc, ws.collapsed) : []),
    [doc, ws.collapsed],
  );

  const hiddenCounts = useMemo(() => (doc ? subtreeSizes(doc) : {}), [doc]);

  const layout = useMemo(() => {
    if (!doc) return null;
    return layoutTree(doc, ws.keyMap, visible.map((entry) => entry.item.id), {
      maxWidth: 12.1,
      maxHeight: 5.7,
      gapX: 0.36,
      gapY: 0.16,
      maxLines: 4,
      showKeys,
    });
  }, [doc, ws.keyMap, showKeys, visible]);

  const groups = useMemo(() => (doc ? packSlides(doc) : []), [doc]);

  const pad = 0.14;
  const viewW = layout ? Math.max(1, layout.width) + pad * 2 : 1;
  const viewH = layout ? Math.max(1, layout.height) + pad * 2 : 1;
  /** Height per unit of width, so the SVG keeps its aspect at any level. */
  const ratio = viewH / viewW;

  const wrapRef = useRef<HTMLDivElement>(null);
  const [level, setLevel] = useState<number>(readZoom);
  /** The live level, so a burst of clicks cannot each read a stale render. */
  const levelRef = useRef(level);
  const [fitWidth, setFitWidth] = useState(0);
  const [panning, setPanning] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const pinch = useRef<{ distance: number; level: number } | null>(null);
  /** A click that ends a pan must not also select the box under the pointer. */
  const panned = useRef(false);

  const sized = fitWidth > 0;
  const width = sized ? (fitWidth * level) / 100 : 0;
  const height = sized ? (fitWidth * level * ratio) / 100 : 0;

  // Fit follows the window, so a resize while zoomed keeps the level.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = (): void => {
      const style = getComputedStyle(wrap);
      // A stylesheet may not be loaded yet, so a missing length counts as zero.
      const pixels = (value: string): number => {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : 0;
      };
      const inner = wrap.clientWidth - pixels(style.paddingLeft) - pixels(style.paddingRight);
      setFitWidth(Math.max(120, inner));
    };
    measure();
    // Without a resize observer, one measurement is still correct at load.
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(ZOOM_KEY, String(Math.round(level)));
    } catch {
      /* storage is unavailable */
    }
  }, [level]);

  /**
   * Change the level, keeping whatever is under the focus point under it. The
   * content coordinate under a point is (scroll + point) / width, so restoring
   * the same fraction after the size changes is what holds the point still.
   */
  const zoomTo = useCallback(
    (next: number, focusX?: number, focusY?: number): void => {
      const wrap = wrapRef.current;
      const current = levelRef.current;
      const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(next)));
      levelRef.current = clamped;
      if (!wrap || !sized || clamped === current) {
        setLevel(clamped);
        return;
      }
      const pointX = focusX ?? wrap.clientWidth / 2;
      const pointY = focusY ?? wrap.clientHeight / 2;
      const fractionX = width > 0 ? (wrap.scrollLeft + pointX) / width : 0;
      const fractionY = height > 0 ? (wrap.scrollTop + pointY) / height : 0;
      setLevel(clamped);
      requestAnimationFrame(() => {
        const nextWidth = (fitWidth * clamped) / 100;
        const nextHeight = (fitWidth * clamped * ratio) / 100;
        wrap.scrollLeft = fractionX * nextWidth - pointX;
        wrap.scrollTop = fractionY * nextHeight - pointY;
      });
    },
    [fitWidth, height, ratio, sized, width],
  );

  /** A factor, read against the live level, so repeated clicks accumulate. */
  const zoomBy = useCallback(
    (factor: number, focusX?: number, focusY?: number): void => {
      zoomTo(levelRef.current * factor, focusX, focusY);
    },
    [zoomTo],
  );

  const fit = useCallback((): void => {
    levelRef.current = 100;
    setLevel(100);
    const wrap = wrapRef.current;
    if (wrap) {
      requestAnimationFrame(() => {
        wrap.scrollLeft = 0;
        wrap.scrollTop = 0;
      });
    }
  }, []);

  // A wheel listener has to be non-passive to cancel the browser's own zoom.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const rect = wrap.getBoundingClientRect();
      zoomBy(
        event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP,
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
    };
    wrap.addEventListener("wheel", onWheel, { passive: false });
    return () => wrap.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) {
      panned.current = false;
      drag.current = {
        x: event.clientX,
        y: event.clientY,
        left: wrap.scrollLeft,
        top: wrap.scrollTop,
        moved: false,
      };
      setPanning(true);
      return;
    }
    if (pointers.current.size === 2) {
      drag.current = null;
      const [first, second] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(first.x - second.x, first.y - second.y), level };
      // Two fingers are a gesture, never a click, so capturing at once is safe.
      capture(event);
    }
  };

  /**
   * Capture keeps a drag tracking when the pointer leaves the canvas.
   *
   * It is deliberately not taken on pointer down. While a pointer is captured the click
   * is retargeted to the capturing element, so a click on a box or on a fold control
   * never reached its own handler, and the whole diagram was unclickable. Capturing when
   * the drag passes its threshold keeps the pan and leaves a click alone.
   */
  const capture = (event: React.PointerEvent<HTMLDivElement>): void => {
    const target = event.currentTarget;
    // Not available in every environment, and the drag works without it.
    if (typeof target.setPointerCapture !== "function") return;
    if (typeof target.hasPointerCapture === "function" && target.hasPointerCapture(event.pointerId)) return;
    target.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const wrap = wrapRef.current;
    if (!wrap || !pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    // Two fingers pinch about their own centre.
    if (pointers.current.size === 2 && pinch.current) {
      const [first, second] = [...pointers.current.values()];
      const distance = Math.hypot(first.x - second.x, first.y - second.y);
      const rect = wrap.getBoundingClientRect();
      if (pinch.current.distance > 0) {
        zoomTo(
          (pinch.current.level * distance) / pinch.current.distance,
          (first.x + second.x) / 2 - rect.left,
          (first.y + second.y) / 2 - rect.top,
        );
      }
      capture(event);
      return;
    }

    const start = drag.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!start.moved && Math.abs(dx) + Math.abs(dy) > 3) {
      start.moved = true;
      // The gesture is a pan now rather than a click, so capturing the pointer costs
      // nothing: a click would not have fired anyway, and the pan keeps tracking.
      capture(event);
    }
    wrap.scrollLeft = start.left - dx;
    wrap.scrollTop = start.top - dy;
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>): void => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) {
      panned.current = drag.current?.moved ?? false;
      drag.current = null;
      setPanning(false);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      zoomBy(1 / ZOOM_STEP);
      return;
    }
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomBy(ZOOM_STEP);
      return;
    }
    if (event.key === "0") {
      event.preventDefault();
      fit();
    }
  };

  if (!doc || !layout) return null;

  return (
    <div className="diagram-view">
      <div className="diagram-bar">
        <div className="legend">
          <span>{layout.leaves} leaf rows</span>
        </div>
        <div className="diagram-zoom">
          <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => zoomBy(1 / ZOOM_STEP)}>
            −
          </button>
          <span className="zoom-level" aria-live="polite">
            {Math.round(level)}%
          </span>
          <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => zoomBy(ZOOM_STEP)}>
            +
          </button>
          <button type="button" aria-label="Fit the diagram" title="Fit" onClick={fit}>
            Fit
          </button>
        </div>
      </div>

      <div
        className={`diagram-wrap ${panning ? "panning" : ""}`}
        ref={wrapRef}
        tabIndex={0}
        role="application"
        aria-label="Diagram canvas. Control and the wheel zooms, drag pans."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <svg
          className="diagram-svg"
          style={sized ? { width: `${width}px`, height: `${height}px` } : undefined}
          viewBox={`-${pad} -${pad} ${viewW} ${viewH}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Issue tree diagram preview"
        >
          {layout.edges.map((edge) => (
            <polyline
              key={edge.id}
              points={edge.points.map((point) => `${point.x},${point.y}`).join(" ")}
              fill="none"
              stroke="#B8C4D4"
              strokeWidth={0.012}
            />
          ))}

          {layout.items.map((item) => {
            const hasChildren = (doc.items[item.id]?.children.length ?? 0) > 0;
            const foldX = item.x + item.w + 0.12;
            const foldY = item.y + item.h / 2;
            return (
              <g key={`stub-${item.id}`}>
                {hasChildren && ws.collapsed.has(item.id) ? (
                  <polyline
                    points={`${item.x + item.w},${foldY} ${foldX},${foldY}`}
                    fill="none"
                    stroke="#B8C4D4"
                    strokeWidth={0.012}
                  />
                ) : null}
              </g>
            );
          })}

          {layout.items.map((item) => {
            const isRoot = item.depth === 1;
            const style = isRoot ? ROOT : ITEM_STYLE;
            const lineHeight = (item.fontSize * 1.24) / 72;
            const marker = markerFor(item.status, item.x, item.y + 0.05, lineHeight);
            return (
              <g
                key={item.id}
                onClick={() => {
                  if (panned.current) return;
                  ws.select(item.id);
                  document.querySelector(`[data-row-id="${item.id}"]`)?.scrollIntoView({ block: "center" });
                }}
              >
                <rect
                  className={[
                    "nrect",
                    isRoot ? "root" : "",
                    ws.selection === item.id ? "selected" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  x={item.x}
                  y={item.y}
                  width={item.w}
                  height={item.h}
                  rx={0.04}
                  fill={style.fill}
                />
                <rect
                  className={`marker-square ${item.status}`}
                  x={marker.x}
                  y={marker.y}
                  width={marker.w}
                  height={marker.h}
                  rx={marker.r}
                  fill={item.status === "complete" ? `#${MARKER.colour.completeFill}` : MARKER.colour.openFill}
                  stroke={
                    item.status === "complete"
                      ? `#${MARKER.colour.completeFill}`
                      : `#${MARKER.colour.openBorder}`
                  }
                  strokeWidth={marker.stroke}
                />
                {ws.collapsed.has(item.id) && (hiddenCounts[item.id] ?? 0) > 0 ? (
                  <text
                    className="folded-count"
                    x={item.x + item.w - 0.06}
                    y={item.y + 0.05 + lineHeight * 0.8}
                    textAnchor="end"
                    fontSize={Math.max(0.05, (item.fontSize / 72) * 0.8)}
                    fontFamily="Segoe UI, system-ui, sans-serif"
                    fill="#64748B"
                  >
                    {hiddenCounts[item.id]} hidden
                  </text>
                ) : null}
                {marker.tick.length > 0 ? (
                  <polyline
                    className="marker-tick"
                    points={marker.tick.map((point) => `${point.x},${point.y}`).join(" ")}
                    fill="none"
                    stroke={`#${MARKER.colour.completeTick}`}
                    strokeWidth={marker.stroke}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null}
                {/* The number leads, beside the status marker, on its own line. */}
                <text
                  x={item.x + 0.17}
                  y={item.y + 0.05 + lineHeight * 0.8}
                  fontSize={item.fontSize / 72}
                  fontFamily="Consolas, monospace"
                  fontWeight={600}
                  fill={isRoot ? "#94A3B8" : "#64748B"}
                >
                  {item.number}
                </text>
                {item.lines.map((line, index) => (
                  <text
                    key={index}
                    x={item.x + 0.17}
                    y={item.y + 0.05 + lineHeight * (index + 1.8)}
                    fontSize={item.fontSize / 72}
                    fontFamily="Segoe UI, system-ui, sans-serif"
                    fontWeight={isRoot ? 600 : 400}
                    fill={style.text}
                  >
                    {line}
                  </text>
                ))}
                {showKeys ? (
                  <text
                    x={item.x + item.w - 0.05}
                    y={item.y + 0.14}
                    textAnchor="end"
                    fontSize={Math.max(0.06, Math.min(0.1, item.fontSize / 72 * 0.9))}
                    fontFamily="Consolas, monospace"
                    fontWeight={600}
                    fill={isRoot ? "#CBD5E1" : "#64748B"}
                  >
                    {item.key}
                  </text>
                ) : null}
              </g>
            );
          })}
          {layout.items
            .filter((item) => (doc.items[item.id]?.children.length ?? 0) > 0)
            .map((item) => {
              const folded = ws.collapsed.has(item.id);
              const centreX = item.x + item.w + 0.12;
              const centreY = item.y + item.h / 2;
              return (
                <g
                  key={`fold-${item.id}`}
                  className="diagram-fold"
                  onClick={(event) => {
                    event.stopPropagation();
                    ws.toggleCollapse(item.id);
                  }}
                  role="button"
                  aria-label={folded ? `Expand ${item.label || "item"}` : `Collapse ${item.label || "item"}`}
                >
                  {/* A hit area the size of a Tree row's target, in diagram units. */}
                  <rect
                    className="fold-hit"
                    x={centreX - 0.1}
                    y={centreY - 0.1}
                    width={0.2}
                    height={0.2}
                    rx={0.05}
                  />
                  {/* The Tree view's two shapes, in diagram units rather than pixels. */}
                  <svg
                    x={centreX - 0.055}
                    y={centreY - 0.055}
                    width={0.11}
                    height={0.11}
                    viewBox="0 0 12 12"
                    aria-hidden="true"
                  >
                    {folded ? (
                      <path d="M4 2.5L9 6L4 9.5Z" fill="#4a5666" />
                    ) : (
                      <path
                        d="M2.5 4.5L6 8.5L9.5 4.5"
                        fill="none"
                        stroke="#9aa5b4"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                  </svg>
                </g>
              );
            })}
        </svg>
      </div>

      <div className="section" style={{ marginTop: 14 }}>
        <div className="section-head">
          <span>PowerPoint plan</span>
        </div>
        <p className="small muted" style={{ marginTop: 0 }}>
          Slide 1 is a structure overview. Branch slides pack several branches together so two to five levels share a
          page; the root is repeated as context.
        </p>
        <ol className="small muted" style={{ paddingLeft: 18, lineHeight: 1.7, margin: "6px 0 10px" }}>
          {groups.slice(0, 6).map((group, index) => (
            <li key={index}>{group.title}</li>
          ))}
          {groups.length > 6 ? <li>…and {groups.length - 6} more</li> : null}
        </ol>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <label className="small muted" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={showKeys}
              onChange={(event) => ws.setSettings({ showKeysInEditor: event.target.checked })}
            />
            Show keys in the diagram
          </label>
        </div>
        {layout.fontSize < 6.5 ? (
          <p className="small muted">The diagram is dense at this size; the branch slides will be larger.</p>
        ) : null}
      </div>

      <Footer>
        <span>
          {countItems(doc)} items · {groups.length} slide{groups.length === 1 ? "" : "s"}
        </span>
      </Footer>
    </div>
  );
}
