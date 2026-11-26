import { useEffect, useRef, useState } from "react";
import { ExportDialog, ImportDialog, SettingsDialog, Toasts } from "./components/Dialogs";
import { Diagram } from "./components/Diagram";
import { MarkdownView } from "./components/MarkdownView";
import { Outline } from "./components/Outline";
import { HistoryPanel, ItemPanel, QualityPanel } from "./components/Panels";
import { TopBar } from "./components/TopBar";
import { useMediaQuery } from "./lib/useMediaQuery";
import { ITEM_CAP, SOFT_CAP } from "./model/types";
import { useWorkspace } from "./store/useWorkspace";

type Tab = "details" | "history";
type View = "tree" | "markdown" | "diagram";

const VIEWS: { id: View; label: string; key: string }[] = [
  { id: "tree", label: "Tree", key: "Alt+1" },
  { id: "markdown", label: "Markdown", key: "Alt+2" },
  { id: "diagram", label: "Diagram", key: "Alt+3" },
];

const PANEL_KEY = "its.panel";

export function App() {
  const ws = useWorkspace();
  const [tab, setTab] = useState<Tab>("details");
  const [view, setView] = useState<View>("tree");
  const [draft, setDraft] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(PANEL_KEY) === "closed";
    } catch {
      return false;
    }
  });
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const phone = useMediaQuery("(max-width: 640px), (max-height: 480px)");
  const [sheet, setSheet] = useState(false);

  const { undo, redo } = ws;

  useEffect(() => {
    if (phone && view === "diagram") setView("tree");
  }, [phone, view]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const savedScroll = useRef(0);

  useEffect(() => {
    if (!collapsed) {
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = savedScroll.current;
      });
    }
  }, [collapsed]);

  useEffect(() => {
    if (ws.itemCount < SOFT_CAP) return;
    try {
      if (sessionStorage.getItem("its.nudged") === "1") return;
      sessionStorage.setItem("its.nudged", "1");
    } catch {
      return;
    }
    ws.toast(
      "info",
      `${ws.itemCount} items. Trees this deep get hard to read; the hard cap is ${ITEM_CAP}. Nothing is blocked.`,
    );
  }, [ws.itemCount, ws.toast]);

  useEffect(() => {
    try {
      sessionStorage.setItem(PANEL_KEY, collapsed ? "closed" : "open");
    } catch {
      // The view still works without persistence.
    }
  }, [collapsed]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const typing = target ? /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) : false;

      if (event.altKey && (event.key === "1" || event.key === "2" || event.key === "3")) {
        event.preventDefault();
        setView(event.key === "1" ? "tree" : event.key === "2" ? "markdown" : "diagram");
        return;
      }

      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key === "\\") {
        event.preventDefault();
        setCollapsed((current) => !current);
        return;
      }
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
    <div className={`app ${phone ? "phone" : ""}`}>
      <TopBar
        ws={ws}
        onImport={() => setImportOpen(true)}
        onExport={() => setExportOpen(true)}
        onSettings={() => setSettingsOpen(true)}
      />

      <div className={`body ${collapsed ? "panel-collapsed" : ""}`}>
        <div className="workspace">
          <div className="view-switch" role="tablist" aria-label="Workspace views">
            {(phone ? VIEWS.filter((entry) => entry.id !== "diagram") : VIEWS).map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={view === entry.id}
                className={`view-tab ${view === entry.id ? "active" : ""}`}
                title={`${entry.label} view (${entry.key})`}
                onClick={() => setView(entry.id)}
              >
                {entry.label}
                {entry.id === "markdown" && draft !== null ? <span className="dot" /> : null}
              </button>
            ))}
            {phone ? (
              <>
                <span className="spacer" />
                <button type="button" className="text-btn" onClick={() => setSheet(true)}>
                  Details
                </button>
              </>
            ) : null}
          </div>

          {view === "tree" ? <Outline ws={ws} onImport={() => setImportOpen(true)} /> : null}
          {view === "markdown" ? <MarkdownView ws={ws} draft={draft} onDraft={setDraft} /> : null}
          {view === "diagram" ? <Diagram ws={ws} /> : null}
        </div>

        {phone && sheet ? <div className="sheet-backdrop" onClick={() => setSheet(false)} /> : null}
        <aside
          className={`rightbar ${collapsed && !phone ? "collapsed" : ""} ${phone ? "sheet" : ""} ${phone && !sheet ? "hidden" : ""}`}
          aria-label="Tree panels"
        >
          {collapsed && !phone ? (
            <div className="rail">
              <button
                type="button"
                className="rail-btn"
                title="Details"
                aria-label="Open details"
                onClick={() => {
                  setTab("details");
                  setCollapsed(false);
                }}
              >
                ▤
                {ws.findingCounts.error > 0 ? <span className="rail-dot" aria-hidden="true" /> : null}
              </button>
              <button
                type="button"
                className="rail-btn"
                title="History"
                aria-label="Open history"
                onClick={() => {
                  setTab("history");
                  setCollapsed(false);
                }}
              >
                ⟲
              </button>
            </div>
          ) : (
            <>
              <div className="tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "details"}
                  className={`tab ${tab === "details" ? "active" : ""}`}
                  onClick={() => setTab("details")}
                >
                  Details
                  {ws.findingCounts.error > 0 ? (
                    <span className="count errors">{ws.findingCounts.error}</span>
                  ) : null}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "history"}
                  className={`tab ${tab === "history" ? "active" : ""}`}
                  onClick={() => setTab("history")}
                >
                  History
                  <span className="count">{ws.versionCount}</span>
                </button>
                <span className="spacer" />
                <button
                  type="button"
                  className="panel-collapse"
                  title="Collapse the panel (Ctrl+\\)"
                  aria-label="Collapse panel"
                  onClick={() => {
                    savedScroll.current = scrollRef.current?.scrollTop ?? 0;
                    setCollapsed(true);
                  }}
                >
                  ›
                </button>
              </div>

              <div className="panel-scroll" ref={scrollRef}>
                {tab === "details" ? (
                  <>
                    <ItemPanel ws={ws} />
                    <QualityPanel ws={ws} />
                  </>
                ) : null}
                {tab === "history" ? <HistoryPanel ws={ws} /> : null}
              </div>
            </>
          )}
        </aside>
      </div>

      <ExportDialog ws={ws} open={exportOpen} onClose={() => setExportOpen(false)} />
      <ImportDialog ws={ws} open={importOpen} onClose={() => setImportOpen(false)} />
      <SettingsDialog ws={ws} open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <Toasts ws={ws} />
    </div>
  );
}
