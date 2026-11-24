import type { Workspace } from "../store/useWorkspace";
import { SAMPLES } from "../model/sample";

interface Props {
  ws: Workspace;
}

export function Sidebar({ ws }: Props) {
  return (
    <aside className="sidebar" aria-label="Trees">
      <div className="pane-head">
        <span>Trees</span>
        <button type="button" className="text-btn ghost" onClick={() => void ws.newDoc()}>
          + New
        </button>
      </div>

      <div className="doc-list" role="list">
        {ws.library.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="listitem"
            className={`doc-item ${ws.doc?.id === entry.id ? "active" : ""}`}
            onClick={() => void ws.openDoc(entry.id)}
          >
            <span className="title">{entry.name}</span>
            <span className="meta">
              <span>v{entry.version}</span>
              <span>{entry.nodeCount} nodes</span>
              <span>{new Date(entry.updatedAt).toLocaleDateString()}</span>
            </span>
          </button>
        ))}
        {ws.library.length === 0 ? <p className="empty-note">No trees yet.</p> : null}
      </div>

      <div className="sidebar-foot">
        <span className="small muted">Start from a sample</span>
        {SAMPLES.map((sample) => (
          <button
            key={sample.id}
            type="button"
            className="sample-btn"
            title={sample.description}
            onClick={() => void ws.loadSample(sample.id)}
          >
            {sample.name}
          </button>
        ))}
        <span className="small muted" style={{ marginTop: 4 }}>
          Stored in this browser. Export a project file to move a tree.
        </span>
      </div>
    </aside>
  );
}
