import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { copyText } from "../lib/ui";
import { SAMPLES } from "../model/sample";
import { descendantIds, maxDepth, parentOf, visibleEntries } from "../model/tree";
import type { Workspace } from "../store/useWorkspace";

interface Props {
  ws: Workspace;
  onImport: () => void;
}

type DropPosition = "before" | "after" | "into";

interface DropTarget {
  id: string;
  position: DropPosition;
}

export function Outline({ ws, onImport }: Props) {
  const doc = ws.doc;
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const focusRequest = useRef(false);

  const flat = useMemo(() => (doc ? visibleEntries(doc, ws.collapsed) : []), [doc, ws.collapsed]);
  const depth = useMemo(() => (doc ? maxDepth(doc) : 0), [doc]);

  useEffect(() => {
    if (!focusRequest.current || !ws.selection) return;
    const input = document.querySelector<HTMLTextAreaElement>(`textarea[data-label-id="${ws.selection}"]`);
    if (input) {
      focusRequest.current = false;
      input.focus();
      input.select();
    }
  }, [ws.selection, doc]);

  if (!doc) return null;

  const focusNode = (id: string | null): void => {
    if (!id) return;
    const input = document.querySelector<HTMLTextAreaElement>(`textarea[data-label-id="${id}"]`);
    input?.focus();
    input?.select();
  };

  const moveFocus = (currentIndex: number, delta: number): void => {
    const nextEntry = flat[currentIndex + delta];
    if (nextEntry) focusNode(nextEntry.node.id);
  };

  const onKeyDown = (
    event: KeyboardEvent<HTMLTextAreaElement>,
    nodeId: string,
    label: string,
    index: number,
    parentId: string | null,
    siblingIndex: number,
  ): void => {
    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown") && parentId) {
      event.preventDefault();
      const delta = event.key === "ArrowUp" ? -1 : 1;
      ws.move(nodeId, parentId, Math.max(0, siblingIndex + delta));
      return;
    }
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      focusRequest.current = true;
      ws.addChild(nodeId);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      focusRequest.current = true;
      ws.addSibling(nodeId);
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      if (event.shiftKey) ws.outdent(nodeId);
      else ws.indent(nodeId);
      return;
    }
    if (event.key === "Backspace" && label === "") {
      event.preventDefault();
      ws.remove(nodeId);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveFocus(index, 1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(index, -1);
      return;
    }
    if (event.key === "Escape") event.currentTarget.blur();
  };

  const handleDrop = (targetId: string, position: DropPosition): void => {
    if (!dragId || dragId === targetId) return;
    if (position === "into") {
      const target = doc.nodes[targetId];
      const index = target.children.filter((id) => id !== dragId).length;
      ws.move(dragId, targetId, index);
    } else {
      const parentId = parentOf(doc, targetId);
      if (!parentId) {
        const target = doc.nodes[targetId];
        ws.move(dragId, targetId, target.children.filter((id) => id !== dragId).length);
      } else {
        const siblings = doc.nodes[parentId].children.filter((id) => id !== dragId);
        const index = siblings.indexOf(targetId);
        ws.move(dragId, parentId, position === "before" ? index : index + 1);
      }
    }
    setDragId(null);
    setDrop(null);
  };

  const copyKey = async (key: string, nodeId: string, label: string): Promise<void> => {
    const ok = await copyText(key);
    ws.select(nodeId);
    ws.toast(ok ? "success" : "error", ok ? `Copied ${key} (${label || "untitled"})` : "Could not copy the key.");
  };

  return (
    <div className="editor">
      <div className="editor-head">
        <span>{flat.length} nodes</span>
        <span className="muted">·</span>
        <span>{depth} levels</span>
        <span className="spacer" />
        <span className="muted">Keys follow label and path</span>
        <button
          type="button"
          className="text-btn ghost"
          onClick={() => (ws.collapsed.size > 0 ? ws.expandAll() : ws.collapseAll())}
        >
          {ws.collapsed.size > 0 ? "Expand all" : "Collapse all"}
        </button>
        <button type="button" className="text-btn ghost" onClick={onImport}>
          Paste outline
        </button>
      </div>

      <div className="editor-scroll" onClick={() => ws.select(null)}>
        {flat.length === 0 ? (
          <div className="empty-outline">
            <p>
              <strong>This tree is empty.</strong>
            </p>
            <p className="muted">Paste a markdown list to start, or add a root question.</p>
            <div className="sample-row">
              {SAMPLES.map((sample) => (
                <button
                  key={sample.id}
                  type="button"
                  className="text-btn"
                  title={sample.description}
                  onClick={() => void ws.loadSample(sample.id)}
                >
                  {sample.name}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="outline" role="tree" aria-label="Issue tree outline">
            {flat.map((entry, index) => {
              const node = entry.node;
              const keyInfo = ws.keyMap.byNode[node.id];
              const isRoot = entry.depth === 1;
              const dropClass = drop?.id === node.id ? ` drop-${drop.position}` : "";
              return (
                <div
                  key={node.id}
                  role="treeitem"
                  aria-level={entry.depth}
                  aria-selected={ws.selection === node.id}
                  data-row-id={node.id}
                  className={[
                    "row",
                    ws.selection === node.id ? "selected" : "",
                    dragId === node.id ? "dragging" : "",
                    dropClass,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={{ marginLeft: (entry.depth - 1) * 15 }}
                  onClick={(event) => {
                    event.stopPropagation();
                    ws.select(node.id);
                  }}
                  onDragOver={(event) => {
                    if (!dragId || dragId === node.id) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    const rect = event.currentTarget.getBoundingClientRect();
                    const ratio = (event.clientY - rect.top) / rect.height;
                    const position: DropPosition = ratio < 0.3 ? "before" : ratio > 0.7 ? "after" : "into";
                    setDrop({ id: node.id, position });
                  }}
                  onDragLeave={() => setDrop((current) => (current?.id === node.id ? null : current))}
                  onDrop={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    handleDrop(node.id, drop?.position ?? "into");
                  }}
                >
                  <button
                    type="button"
                    className="grip"
                    draggable
                    aria-label="Drag to move"
                    title="Drag to move"
                    onDragStart={(event) => {
                      event.stopPropagation();
                      setDragId(node.id);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", node.id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setDrop(null);
                    }}
                  >
                    ⠿
                  </button>

                  {node.children.length > 0 ? (
                    <button
                      type="button"
                      className={`chevron ${ws.collapsed.has(node.id) ? "closed" : "open"}`}
                      aria-label={
                        ws.collapsed.has(node.id)
                          ? `Expand ${node.label || "node"}`
                          : `Collapse ${node.label || "node"}`
                      }
                      aria-expanded={!ws.collapsed.has(node.id)}
                      title="Collapse or expand this branch. Alt+click folds the whole branch."
                      onClick={(event) => {
                        event.stopPropagation();
                        if (event.altKey) ws.setBranchCollapsed(node.id, !ws.collapsed.has(node.id));
                        else ws.toggleCollapse(node.id);
                      }}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      ▸
                    </button>
                  ) : (
                    <span className="tree-line" aria-hidden="true">
                      └
                    </span>
                  )}

                  <div className="label-wrap">
                  <textarea
                    rows={1}
                    className={`label-input ${isRoot ? "root-label" : ""}`}
                    data-label-id={node.id}
                    value={node.label}
                    placeholder={isRoot ? "Write the root as a precise question" : "Write a question"}
                    aria-label={`Label for ${keyInfo?.key ?? "node"} at level ${entry.depth}`}
                    onChange={(event) => ws.editLabel(node.id, event.target.value)}
                    onFocus={() => ws.select(node.id)}
                    onKeyDown={(event) => onKeyDown(event, node.id, node.label, index, entry.parentId, entry.index)}
                    onInput={(event) => {
                      const field = event.currentTarget;
                      field.style.height = "auto";
                      field.style.height = `${Math.min(field.scrollHeight, 72)}px`;
                    }}
                    ref={(field) => {
                      if (!field) return;
                      field.style.height = "auto";
                      field.style.height = `${Math.min(field.scrollHeight, 72)}px`;
                    }}
                  />
                  {ws.collapsed.has(node.id) && descendantIds(doc, node.id).length > 0 ? (
                    <span className="collapsed-count" title="Hidden nodes beneath this one">
                      +{descendantIds(doc, node.id).length}
                    </span>
                  ) : null}
                  </div>

                  <button
                    type="button"
                    className={`status-box ${node.status}`}
                    aria-label={node.status === "complete" ? "Mark this node open" : "Mark this node complete"}
                    aria-pressed={node.status === "complete"}
                    title={node.status === "complete" ? "Complete. Click to reopen." : "Open. Click to mark complete."}
                    onClick={(event) => {
                      event.stopPropagation();
                      ws.setStatus(node.id, node.status === "complete" ? "open" : "complete");
                    }}
                  >
                    {node.status === "complete" ? "✓" : ""}
                  </button>

                  <button
                    type="button"
                    className={`key-chip ${keyInfo?.promoted ? "promoted" : ""}`}
                    title={`Copy key ${keyInfo?.key ?? ""} — level ${entry.depth}, ${node.status}${keyInfo?.promoted ? " (extended after a collision)" : ""}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      void copyKey(keyInfo?.key ?? "", node.id, node.label);
                    }}
                  >
                    {keyInfo?.key ?? "····"}
                  </button>

                  <div className="row-actions">
                    <button
                      type="button"
                      className="mini-btn"
                      title="Add child (Ctrl+Enter)"
                      aria-label="Add child"
                      onClick={(event) => {
                        event.stopPropagation();
                        focusRequest.current = true;
                        ws.addChild(node.id);
                      }}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="mini-btn"
                      title="Add sibling (Enter)"
                      aria-label="Add sibling"
                      onClick={(event) => {
                        event.stopPropagation();
                        focusRequest.current = true;
                        ws.addSibling(node.id);
                      }}
                    >
                      ⏎
                    </button>
                    <button
                      type="button"
                      className="mini-btn danger"
                      title="Delete node and its children (Backspace on an empty label)"
                      aria-label="Delete node"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (node.children.length > 2 && !window.confirm(`Delete "${node.label}" and its ${node.children.length} branches?`)) {
                          return;
                        }
                        ws.remove(node.id);
                      }}
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="hint-bar">
          <span>
            <kbd>Enter</kbd> add sibling
          </span>
          <span>
            <kbd>Ctrl</kbd>+<kbd>Enter</kbd> add child
          </span>
          <span>
            <kbd>Tab</kbd> indent
          </span>
          <span>
            <kbd>Shift</kbd>+<kbd>Tab</kbd> outdent
          </span>
          <span>
            <kbd>↑</kbd>/<kbd>↓</kbd> move
          </span>
          <span>
            <kbd>Backspace</kbd> on an empty row deletes it
          </span>
          <span>Drag the handle to reorder</span>
        </div>
      </div>
    </div>
  );
}
