import { useEffect, useState } from "react";
import { ExportDialog, ImportDialog, Toasts } from "./components/Dialogs";
import { Diagram } from "./components/Diagram";
import { MarkdownView } from "./components/MarkdownView";
import { Outline } from "./components/Outline";
import { HistoryPanel, KeyPanel, NodePanel, QualityPanel } from "./components/Panels";
import { TopBar } from "./components/TopBar";
import { useWorkspace } from "./store/useWorkspace";

type Tab = "quality" | "diagram" | "keys" | "history" | "node";
type View = "tree" | "markdown";

const TABS: { id: Tab; label: string }[] = [
  { id: "quality", label: "Quality" },
  { id: "diagram", label: "Diagram" },
  { id: "keys", label: "Keys" },
  { id: "history", label: "History" },
  { id: "node", label: "Node" },
];

export function App() {
  const ws = useWorkspace();
  const [tab, setTab] = useState<Tab>("quality");
  const [view, setView] = useState<View>("tree");
  const [draft, setDraft] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const { undo, redo } = ws;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const typing = target ? /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) : false;
      if (event.altKey && (event.key === "1" || event.key === "2")) {
        event.preventDefault();
        setView(event.key === "1" ? "tree" : "markdown");
        return;
      }
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === "e") {
        event.preventDefault();
        setExportOpen(true);
        return;
      }
      if (!mod || typing) return;
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);

  if (!ws.ready) {
    return <div className="loading">Opening your trees…</div>;
  }

  return (
    <div className="app">
      <TopBar ws={ws} onImport={() => setImportOpen(true)} onExport={() => setExportOpen(true)} />

      <div className="body">
        <div className="workspace">
          <div className="view-switch" role="tablist" aria-label="Workspace views">
            <button
              type="button"
              role="tab"
              aria-selected={view === "tree"}
              className={`view-tab ${view === "tree" ? "active" : ""}`}
              title="Tree view (Alt+1)"
              onClick={() => setView("tree")}
            >
              Tree
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "markdown"}
              className={`view-tab ${view === "markdown" ? "active" : ""}`}
              title="Markdown view (Alt+2)"
              onClick={() => setView("markdown")}
            >
              Markdown
              {draft !== null ? <span className="dot" /> : null}
            </button>
          </div>
          {view === "tree" ? (
            <Outline ws={ws} onImport={() => setImportOpen(true)} />
          ) : (
            <MarkdownView ws={ws} draft={draft} onDraft={setDraft} />
          )}
        </div>

        <aside className="rightbar" aria-label="Tree panels">
          <div className="tabs" role="tablist">
            {TABS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={tab === entry.id}
                className={`tab ${tab === entry.id ? "active" : ""}`}
                onClick={() => setTab(entry.id)}
              >
                {entry.label}
                {entry.id === "quality" && ws.findingCounts.error > 0 ? (
                  <span className="count errors">{ws.findingCounts.error}</span>
                ) : null}
                {entry.id === "history" ? <span className="count">{ws.versionCount}</span> : null}
              </button>
            ))}
          </div>

          <div className="panel-scroll">
            {tab === "quality" ? <QualityPanel ws={ws} /> : null}
            {tab === "diagram" ? <Diagram ws={ws} onExport={() => setExportOpen(true)} /> : null}
            {tab === "keys" ? <KeyPanel ws={ws} /> : null}
            {tab === "history" ? <HistoryPanel ws={ws} /> : null}
            {tab === "node" ? <NodePanel ws={ws} /> : null}
          </div>
        </aside>
      </div>

      <ExportDialog ws={ws} open={exportOpen} onClose={() => setExportOpen(false)} />
      <ImportDialog ws={ws} open={importOpen} onClose={() => setImportOpen(false)} />
      <Toasts ws={ws} />
    </div>
  );
}
