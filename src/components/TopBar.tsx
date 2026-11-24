import { useEffect, useState } from "react";
import type { Workspace } from "../store/useWorkspace";

interface Props {
  ws: Workspace;
  onImport: () => void;
  onExport: () => void;
}

export function TopBar({ ws, onImport, onExport }: Props) {
  const doc = ws.doc;
  const [name, setName] = useState(doc?.name ?? "");

  useEffect(() => {
    setName(doc?.name ?? "");
  }, [doc?.id, doc?.name]);

  if (!doc) return null;

  const commitName = (): void => {
    const next = name.trim();
    if (next && next !== doc.name) ws.renameDoc(next);
    else setName(doc.name);
  };

  const capClass = ws.nodeCount >= 100 ? "full" : ws.nodeCount >= 80 ? "warn" : "";

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          IT
        </span>
        Issue Tree Studio
      </div>

      <input
        className="doc-name"
        value={name}
        aria-label="Tree name"
        onChange={(event) => setName(event.target.value)}
        onBlur={commitName}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            setName(doc.name);
            event.currentTarget.blur();
          }
        }}
      />

      <span className="pill version" title="Every change increments the version">
        v{doc.version}
        {ws.pendingVersion ? <span className="dot" title="A version is being written" /> : null}
      </span>

      <span className={`pill cap ${capClass}`} title="Hard cap of 100 nodes keeps the tree readable">
        {ws.nodeCount} / 100 nodes
      </span>

      <span className="topbar-spacer" />

      <button
        type="button"
        className="icon-btn"
        title="Undo (Ctrl+Z)"
        aria-label="Undo"
        disabled={!ws.canUndo}
        onClick={ws.undo}
      >
        ↺
      </button>
      <button
        type="button"
        className="icon-btn"
        title="Redo (Ctrl+Shift+Z)"
        aria-label="Redo"
        disabled={!ws.canRedo}
        onClick={ws.redo}
      >
        ↻
      </button>

      <button type="button" className="text-btn" onClick={onImport}>
        Import
      </button>
      <button type="button" className="text-btn primary" onClick={onExport}>
        Export
      </button>
    </header>
  );
}
