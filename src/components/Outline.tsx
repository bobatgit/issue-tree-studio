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

/** A label shows this many lines and scrolls beyond them. */
const LABEL_LINES = 3;

/**
 * Grow a label field to its content, never past three lines. The cap is read
 * from the computed style rather than written down, so it stays exactly three
 * lines at any type size and the cut lands on a line boundary.
 */
function fitLabel(field: HTMLTextAreaElement): void {
  field.style.height = "auto";
  const style = getComputedStyle(field);
  const line = Number.parseFloat(style.lineHeight);
  if (!Number.isFinite(line)) {
    field.style.height = `${field.scrollHeight}px`;
    return;
  }
  const vertical =
    Number.parseFloat(style.paddingTop) +
    Number.parseFloat(style.paddingBottom) +
    Number.parseFloat(style.borderTopWidth) +
    Number.parseFloat(style.borderBottomWidth);
  const cap = Math.round(line * LABEL_LINES + vertical);
  field.style.height = `${Math.min(field.scrollHeight, cap)}px`;
}

interface DropTarget {
  id: string;
  position: DropPosition;
}

export function Outline({ ws, onImport }: Props) {
  const doc = ws.doc;
  const [dragId, setDragId] = useState<string | null>(null);
  const [actionsFor, setActionsFor] = useState<string | null>(null);
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

  const actionItem = actionsFor ? doc.items[actionsFor] : null;
  const actionParent = actionsFor ? parentOf(doc, actionsFor) : null;
  const actionSiblings = actionParent ? doc.items[actionParent]?.children ?? [] : [];
  const actionIndex = actionsFor ? actionSiblings.indexOf(actionsFor) : -1;

  const focusItem = (id: string | null): void => {
    if (!id) return;
    const input = document.querySelector<HTMLTextAreaElement>(`textarea[data-label-id="${id}"]`);
    input?.focus();
    input?.select();
  };

  const moveFocus = (currentIndex: number, delta: number): void => {
    const nextEntry = flat[currentIndex + delta];
    if (nextEntry) focusItem(nextEntry.item.id);
  };

  const onKeyDown = (
    event: KeyboardEvent<HTMLTextAreaElement>,
    itemId: string,
    label: string,
    index: number,
    parentId: string | null,
    siblingIndex: number,
  ): void => {
    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown") && parentId) {
      event.preventDefault();
      const delta = event.key === "ArrowUp" ? -1 : 1;
      ws.move(itemId, parentId, Math.max(0, siblingIndex + delta));
      return;
    }
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      focusRequest.current = true;
      ws.addChild(itemId);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      focusRequest.current = true;
      ws.addSibling(itemId);
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      if (event.shiftKey) ws.outdent(itemId);
      else ws.indent(itemId);
      return;
    }
    if (event.key === "Backspace" && label === "") {
      event.preventDefault();
      ws.remove(itemId);
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
      const target = doc.items[targetId];
      const index = target.children.filter((id) => id !== dragId).length;
      ws.move(dragId, targetId, index);
    } else {
      const parentId = parentOf(doc, targetId);
      if (!parentId) {
        const target = doc.items[targetId];
        ws.move(dragId, targetId, target.children.filter((id) => id !== dragId).length);
      } else {
        const siblings = doc.items[parentId].children.filter((id) => id !== dragId);
        const index = siblings.indexOf(targetId);
        ws.move(dragId, parentId, position === "before" ? index : index + 1);
      }
    }
    setDragId(null);
    setDrop(null);
  };

  const copyKey = async (key: string, itemId: string, label: string): Promise<void> => {
    const ok = await copyText(key);
    ws.select(itemId);
    ws.toast(ok ? "success" : "error", ok ? `Copied ${key} (${label || "untitled"})` : "Could not copy the key.");
  };

  return (
    <div className="editor">
      <div className="editor-head">
        <span>{flat.length} items</span>
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
              const item = entry.item;
              const keyInfo = ws.keyMap.byItem[item.id];
              const isRoot = entry.depth === 1;
              const dropClass = drop?.id === item.id ? ` drop-${drop.position}` : "";
              return (
                <div
                  key={item.id}
                  role="treeitem"
                  aria-level={entry.depth}
                  aria-selected={ws.selection === item.id}
                  data-row-id={item.id}
                  className={[
                    "row",
                    ws.selection === item.id ? "selected" : "",
                    dragId === item.id ? "dragging" : "",
                    dropClass,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={{ marginLeft: (entry.depth - 1) * 15 }}
                  onClick={(event) => {
                    event.stopPropagation();
                    ws.select(item.id);
                  }}
                  onDragOver={(event) => {
                    if (!dragId || dragId === item.id) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    const rect = event.currentTarget.getBoundingClientRect();
                    const ratio = (event.clientY - rect.top) / rect.height;
                    const position: DropPosition = ratio < 0.3 ? "before" : ratio > 0.7 ? "after" : "into";
                    setDrop({ id: item.id, position });
                  }}
                  onDragLeave={() => setDrop((current) => (current?.id === item.id ? null : current))}
                  onDrop={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    handleDrop(item.id, drop?.position ?? "into");
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
                      setDragId(item.id);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", item.id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setDrop(null);
                    }}
                  >
                    ⠿
                  </button>

                  {item.children.length > 0 ? (
                    <button
                      type="button"
                      className={`chevron ${ws.collapsed.has(item.id) ? "closed" : "open"}`}
                      aria-label={
                        ws.collapsed.has(item.id)
                          ? `Expand ${item.label || "item"}`
                          : `Collapse ${item.label || "item"}`
                      }
                      aria-expanded={!ws.collapsed.has(item.id)}
                      title="Collapse or expand this branch. Alt+click folds the whole branch."
                      onClick={(event) => {
                        event.stopPropagation();
                        if (event.altKey) ws.setBranchCollapsed(item.id, !ws.collapsed.has(item.id));
                        else ws.toggleCollapse(item.id);
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
                    data-label-id={item.id}
                    value={item.label}
                    placeholder={isRoot ? "Write the root as a precise question" : "Write a question"}
                    aria-label={`Label for ${keyInfo?.key ?? "item"} at level ${entry.depth}`}
                    onChange={(event) => ws.editLabel(item.id, event.target.value)}
                    onFocus={(event) => {
                      ws.select(item.id);
                      const field = event.currentTarget;
                      if (window.visualViewport && window.innerWidth <= 640) {
                        setTimeout(() => field.scrollIntoView({ block: "center", behavior: "smooth" }), 250);
                      }
                    }}
                    onKeyDown={(event) => onKeyDown(event, item.id, item.label, index, entry.parentId, entry.index)}
                    onInput={(event) => fitLabel(event.currentTarget)}
                    ref={(field) => {
                      if (field) fitLabel(field);
                    }}
                  />
                  {ws.collapsed.has(item.id) && descendantIds(doc, item.id).length > 0 ? (
                    <span className="collapsed-count" title="Hidden items beneath this one">
                      +{descendantIds(doc, item.id).length}
                    </span>
                  ) : null}
                  </div>

                  <button
                    type="button"
                    className={`status-box ${item.status}`}
                    aria-label={item.status === "complete" ? "Mark this item open" : "Mark this item complete"}
                    aria-pressed={item.status === "complete"}
                    title={item.status === "complete" ? "Complete. Click to reopen." : "Open. Click to mark complete."}
                    onClick={(event) => {
                      event.stopPropagation();
                      ws.setStatus(item.id, item.status === "complete" ? "open" : "complete");
                    }}
                  >
                    {item.status === "complete" ? "✓" : ""}
                  </button>

                  <button
                    type="button"
                    className={`key-chip ${keyInfo?.promoted ? "promoted" : ""}`}
                    title={`Copy key ${keyInfo?.key ?? ""} — level ${entry.depth}, ${item.status}${keyInfo?.promoted ? " (extended after a collision)" : ""}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      void copyKey(keyInfo?.key ?? "", item.id, item.label);
                    }}
                  >
                    {keyInfo?.key ?? "····"}
                  </button>

                  <button
                    type="button"
                    className="row-more"
                    aria-label="Row actions"
                    onClick={(event) => {
                      event.stopPropagation();
                      ws.select(item.id);
                      setActionsFor(item.id);
                    }}
                  >
                    ⋯
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
                        ws.addChild(item.id);
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
                        ws.addSibling(item.id);
                      }}
                    >
                      ⏎
                    </button>
                    <button
                      type="button"
                      className="mini-btn danger"
                      title="Delete item and its children (Backspace on an empty label)"
                      aria-label="Delete item"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (item.children.length > 2 && !window.confirm(`Delete "${item.label}" and its ${item.children.length} branches?`)) {
                          return;
                        }
                        ws.remove(item.id);
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

      {actionItem ? (
        <div className="sheet-backdrop" onClick={() => setActionsFor(null)}>
          <div
            className="action-sheet"
            role="dialog"
            aria-label="Row actions"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="action-title">{actionItem.label || "Untitled"}</div>
            <button type="button" onClick={() => { ws.addChild(actionItem.id); setActionsFor(null); }}>
              Add child
            </button>
            <button type="button" onClick={() => { ws.addSibling(actionItem.id); setActionsFor(null); }}>
              Add sibling
            </button>
            <button type="button" onClick={() => { ws.indent(actionItem.id); setActionsFor(null); }}>
              Indent
            </button>
            <button type="button" onClick={() => { ws.outdent(actionItem.id); setActionsFor(null); }}>
              Outdent
            </button>
            <button
              type="button"
              disabled={!actionParent || actionIndex <= 0}
              onClick={() => {
                if (actionParent) ws.move(actionItem.id, actionParent, actionIndex - 1);
                setActionsFor(null);
              }}
            >
              Move up
            </button>
            <button
              type="button"
              disabled={!actionParent || actionIndex < 0 || actionIndex >= actionSiblings.length - 1}
              onClick={() => {
                if (actionParent) ws.move(actionItem.id, actionParent, actionIndex + 1);
                setActionsFor(null);
              }}
            >
              Move down
            </button>
            <button
              type="button"
              onClick={() => {
                void copyKey(ws.keyMap.byItem[actionItem.id]?.key ?? "", actionItem.id, actionItem.label);
                setActionsFor(null);
              }}
            >
              Copy key
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => {
                ws.remove(actionItem.id);
                setActionsFor(null);
              }}
            >
              Delete
            </button>
            <button type="button" className="cancel" onClick={() => setActionsFor(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
