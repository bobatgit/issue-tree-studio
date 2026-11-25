import { APP_VERSION, BUILD_SHA, REPO_URL } from "../lib/appInfo";
import { titleOf } from "../model/tree";
import type { Workspace } from "../store/useWorkspace";

interface Props {
  ws: Workspace;
  onImport: () => void;
  onExport: () => void;
  onSettings: () => void;
}

export function TopBar({ ws, onImport, onExport, onSettings }: Props) {
  const doc = ws.doc;

  if (!doc) return null;

  const capClass = ws.nodeCount >= 100 ? "full" : ws.nodeCount >= 80 ? "warn" : "";

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <circle cx="2.7" cy="3.6" r="1.05" fill="currentColor" stroke="none" />
            <circle cx="2.7" cy="8" r="1.05" fill="currentColor" stroke="none" />
            <circle cx="2.7" cy="12.4" r="1.05" fill="currentColor" stroke="none" />
            <path d="M5.9 3.6h7.4M5.9 8h7.4M5.9 12.4h7.4" />
          </svg>
        </span>
        Issue Tree Studio
      </div>

      <span className="doc-title" title="The title is the root question">
        {titleOf(doc)}
      </span>

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

      <button type="button" className="icon-btn" title="Settings" aria-label="Settings" onClick={onSettings}>
        ⚙
      </button>
      <button type="button" className="text-btn" onClick={onImport}>
        Import
      </button>
      <button type="button" className="text-btn primary" onClick={onExport}>
        Export
      </button>

      <a
        className="build-stamp"
        href={`${REPO_URL}/releases`}
        target="_blank"
        rel="noreferrer"
        title="App build. Open releases for the change list."
      >
        {APP_VERSION} · {BUILD_SHA}
      </a>
    </header>
  );
}
