import { useMemo } from "react";
import { layoutTree, packSlides } from "../model/layout";
import { flatten } from "../model/tree";
import type { Workspace } from "../store/useWorkspace";

interface Props {
  ws: Workspace;
}

const ITEM_STYLE = { fill: "#F8FAFC", border: "#94A3B8", text: "#1E293B" };

const ROOT = { fill: "#1E293B", border: "#0F172A", text: "#FFFFFF" };

export function Diagram({ ws }: Props) {
  const doc = ws.doc;
  const showKeys = doc?.settings.showKeysInEditor ?? true;

  const layout = useMemo(() => {
    if (!doc) return null;
    return layoutTree(doc, ws.keyMap, null, {
      maxWidth: 12.1,
      maxHeight: 5.7,
      gapX: 0.36,
      gapY: 0.16,
      maxLines: 4,
      showKeys,
    });
  }, [doc, ws.keyMap, showKeys]);

  const groups = useMemo(() => (doc ? packSlides(doc) : []), [doc]);

  if (!doc || !layout) return null;

  const pad = 0.14;
  const viewW = Math.max(1, layout.width) + pad * 2;
  const viewH = Math.max(1, layout.height) + pad * 2;

  return (
    <div className="diagram-view">
      <div className="legend">
        <span>{layout.leaves} leaf rows</span>
      </div>

      <div className="diagram-wrap">
        <svg
          className="diagram-svg"
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
            const isRoot = item.depth === 1;
            const style = isRoot ? ROOT : ITEM_STYLE;
            const lineHeight = (item.fontSize * 1.24) / 72;
            return (
              <g
                key={item.id}
                onClick={() => {
                  ws.select(item.id);
                  document.querySelector(`[data-row-id="${item.id}"]`)?.scrollIntoView({ block: "center" });
                }}
              >
                <rect
                  className="nrect"
                  x={item.x}
                  y={item.y}
                  width={item.w}
                  height={item.h}
                  rx={0.04}
                  fill={style.fill}
                  stroke={ws.selection === item.id ? "#2F6FEB" : style.border}
                  strokeWidth={ws.selection === item.id ? 0.022 : 0.009}
                />
                <circle
                  cx={item.x + 0.1}
                  cy={item.y + 0.05 + lineHeight * 0.8}
                  r={0.038}
                  fill={item.status === "complete" ? "#2f6feb" : "none"}
                  stroke={item.status === "complete" ? "#2f6feb" : "#94A3B8"}
                  strokeWidth={0.012}
                />
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
        </svg>
      </div>

      <div className="section" style={{ marginTop: 14 }}>
        <div className="section-head">
          <span>PowerPoint plan</span>
          <span className="small muted">{groups.length} slide{groups.length === 1 ? "" : "s"}</span>
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
        <p className="small muted">
          {flatten(doc).length} items · layout {layout.width.toFixed(1)}in × {layout.height.toFixed(1)}in
        </p>
      </div>
    </div>
  );
}
