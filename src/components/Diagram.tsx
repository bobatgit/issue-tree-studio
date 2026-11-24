import { useMemo } from "react";
import { layoutTree, packSlides } from "../model/layout";
import type { NodeType } from "../model/types";
import { flatten } from "../model/tree";
import type { Workspace } from "../store/useWorkspace";

interface Props {
  ws: Workspace;
  onExport: () => void;
}

const STYLE: Record<NodeType, { fill: string; border: string; text: string }> = {
  question: { fill: "#F8FAFC", border: "#94A3B8", text: "#1E293B" },
  hypothesis: { fill: "#FFF7E8", border: "#D9A441", text: "#3F2E0B" },
  issue: { fill: "#EEF2F7", border: "#B6C2D1", text: "#25303F" },
};

const ROOT = { fill: "#1E293B", border: "#0F172A", text: "#FFFFFF" };

export function Diagram({ ws, onExport }: Props) {
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
      showTypes: true,
    });
  }, [doc, ws.keyMap, showKeys]);

  const groups = useMemo(() => (doc ? packSlides(doc) : []), [doc]);

  if (!doc || !layout) return null;

  const pad = 0.14;
  const viewW = Math.max(1, layout.width) + pad * 2;
  const viewH = Math.max(1, layout.height) + pad * 2;

  return (
    <div>
      <div className="legend">
        <span>
          <span className="type-dot question" /> Question
        </span>
        <span>
          <span className="type-dot hypothesis" /> Hypothesis
        </span>
        <span>
          <span className="type-dot issue" /> Issue
        </span>
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

          {layout.nodes.map((node) => {
            const isRoot = node.depth === 1;
            const style = isRoot ? ROOT : STYLE[node.type];
            const lineHeight = (node.fontSize * 1.24) / 72;
            return (
              <g
                key={node.id}
                onClick={() => {
                  ws.select(node.id);
                  document.querySelector(`[data-row-id="${node.id}"]`)?.scrollIntoView({ block: "center" });
                }}
              >
                <rect
                  className="nrect"
                  x={node.x}
                  y={node.y}
                  width={node.w}
                  height={node.h}
                  rx={0.04}
                  fill={style.fill}
                  stroke={ws.selection === node.id ? "#2F6FEB" : style.border}
                  strokeWidth={ws.selection === node.id ? 0.022 : 0.009}
                />
                {node.lines.map((line, index) => (
                  <text
                    key={index}
                    x={node.x + 0.05}
                    y={node.y + 0.05 + lineHeight * (index + 0.8)}
                    fontSize={node.fontSize / 72}
                    fontFamily="Segoe UI, system-ui, sans-serif"
                    fontWeight={isRoot ? 600 : 400}
                    fill={style.text}
                  >
                    {line}
                  </text>
                ))}
                {showKeys ? (
                  <text
                    x={node.x + node.w - 0.05}
                    y={node.y + 0.14}
                    textAnchor="end"
                    fontSize={Math.max(0.06, Math.min(0.1, node.fontSize / 72 * 0.9))}
                    fontFamily="Consolas, monospace"
                    fontWeight={600}
                    fill={isRoot ? "#CBD5E1" : "#64748B"}
                  >
                    {node.key}
                  </text>
                ) : null}
                {node.h > 0.4 ? (
                  <text
                    x={node.x + 0.05}
                    y={node.y + node.h - 0.05}
                    fontSize={Math.max(0.055, node.fontSize / 72 * 0.6)}
                    fontFamily="Segoe UI, system-ui, sans-serif"
                    fontWeight={600}
                    fill={isRoot ? "#CBD5E1" : "#7C8798"}
                  >
                    {node.type.toUpperCase()}
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
          <button type="button" className="text-btn" onClick={onExport}>
            Export PowerPoint
          </button>
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
          {flatten(doc).length} nodes · layout {layout.width.toFixed(1)}in × {layout.height.toFixed(1)}in
        </p>
      </div>
    </div>
  );
}
