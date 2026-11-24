import { useEffect, useRef, useState } from "react";
import { APP_VERSION, BUILD_SHA, NEW_ISSUE_URL, browserMeta } from "../lib/appInfo";
import { buildDiagnostics } from "../model/diagnostics";
import { copyText, downloadText, slugify } from "../lib/ui";
import { exportCsv } from "../model/csv";
import { toMarkdown } from "../model/markdown";
import type { ImportFormat, Workspace } from "../store/useWorkspace";

interface DialogProps {
  ws: Workspace;
  open: boolean;
  onClose: () => void;
}

export function ExportDialog({ ws, open, onClose }: DialogProps) {
  const doc = ws.doc;
  const [showKeys, setShowKeys] = useState(true);
  const [includeOverview, setIncludeOverview] = useState(true);
  const [includeKeyIndex, setIncludeKeyIndex] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !doc) return;
    setShowKeys(doc.settings.showKeysInExport);
    setIncludeOverview(doc.settings.includeOverviewSlide);
    setIncludeKeyIndex(doc.settings.includeKeyIndexSlide);
  }, [open, doc]);

  if (!open || !doc) return null;

  const base = `${slugify(doc.name)}-v${doc.version}`;

  const exportSlides = async (): Promise<void> => {
    setBusy(true);
    try {
      const { buildPresentation } = await import("../export/pptx");
      const pptx = buildPresentation(doc, { showKeys, includeOverview, includeKeyIndex });
      await pptx.writeFile({ fileName: `${base}.pptx` });
      ws.toast("success", "PowerPoint exported with editable shapes.");
      onClose();
    } catch (error) {
      ws.toast("error", `PowerPoint export failed: ${error instanceof Error ? error.message : "unknown error"}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Export">
        <h2>Export</h2>
        <p className="sub">
          Every export is stamped with version {doc.version}. The PowerPoint carries native shapes, so every box and
          label stays editable.
        </p>

        <div className="section">
          <div className="section-head">
            <span>PowerPoint</span>
            <span>.pptx</span>
          </div>
          <label className="check">
            <input type="checkbox" checked={showKeys} onChange={(event) => setShowKeys(event.target.checked)} />
            <span>
              <strong>Key chip on every box</strong>
              <br />
              <span className="small muted">The 4-character key sits in the corner of the node.</span>
            </span>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={includeOverview}
              onChange={(event) => setIncludeOverview(event.target.checked)}
            />
            <span>
              <strong>Structure overview as slide 1</strong>
              <br />
              <span className="small muted">
                The whole tree when it stays legible, otherwise the first levels. Branch slides cover every node.
              </span>
            </span>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={includeKeyIndex}
              onChange={(event) => setIncludeKeyIndex(event.target.checked)}
            />
            <span>
              <strong>Key index slides</strong>
              <br />
              <span className="small muted">A table that resolves each key back to its wording.</span>
            </span>
          </label>
          <button type="button" className="text-btn primary" disabled={busy} onClick={() => void exportSlides()}>
            {busy ? "Building…" : "Download PowerPoint"}
          </button>
        </div>

        <div className="section">
          <div className="section-head">
            <span>Other formats</span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="text-btn"
              onClick={() => {
                downloadText(exportCsv(doc, ws.keyMap), `${base}.csv`, "text/csv;charset=utf-8");
                ws.toast("success", "CSV downloaded (UTF-8 with BOM for Excel).");
              }}
            >
              CSV table
            </button>
            <button
              type="button"
              className="text-btn"
              onClick={() => {
                downloadText(toMarkdown(doc), `${base}.md`, "text/markdown;charset=utf-8");
                ws.toast("success", "Markdown downloaded.");
              }}
            >
              Markdown outline
            </button>
            <button
              type="button"
              className="text-btn"
              onClick={() => {
                void ws.exportProject().then((json) => {
                  downloadText(json, `${base}.json`, "application/json;charset=utf-8");
                  ws.toast("success", "Project exported with settings and history.");
                });
              }}
            >
              Project JSON
            </button>
          </div>
          <p className="small muted" style={{ marginBottom: 0 }}>
            CSV columns: key, parent_key, level, type, label, path, branch_index, version.
          </p>
        </div>

        <div className="section">
          <div className="section-head">
            <span>Support</span>
            <span>
              build {APP_VERSION} · {BUILD_SHA}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="text-btn"
              onClick={() => {
                const text = buildDiagnostics(doc, ws.keyMap, {
                  appVersion: APP_VERSION,
                  buildSha: BUILD_SHA,
                  ...browserMeta(),
                });
                void copyText(text).then((ok) => {
                  ws.toast(
                    ok ? "success" : "error",
                    ok ? "Diagnostics copied. Paste them into the new issue." : "Could not copy diagnostics.",
                  );
                });
              }}
            >
              Copy diagnostics
            </button>
            <a className="text-btn" href={NEW_ISSUE_URL} target="_blank" rel="noreferrer">
              Report a problem
            </a>
          </div>
          <p className="small muted" style={{ marginBottom: 0 }}>
            Diagnosis text contains the build, your browser, the tree statistics and the tree itself, so a report can
            be reproduced without guesswork.
          </p>
        </div>

        <div className="modal-actions">
          <button type="button" className="text-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function ImportDialog({ ws, open, onClose }: DialogProps) {
  const [format, setFormat] = useState<ImportFormat>("markdown");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setText("");
      setFileName("");
      setFormat("markdown");
    }
  }, [open]);

  if (!open) return null;

  const readFile = (file: File): void => {
    const lower = file.name.toLowerCase();
    const nextFormat: ImportFormat = lower.endsWith(".json")
      ? "json"
      : lower.endsWith(".csv")
        ? "csv"
        : "markdown";
    setFormat(nextFormat);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ""));
    reader.readAsText(file, "utf-8");
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Import">
        <h2>Import a tree</h2>
        <p className="sub">
          A markdown nested list, an issue-tree CSV, or a project JSON file. The import opens as a new tree, so the
          current one is untouched.
        </p>

        <div className="format-tabs">
          {(["markdown", "csv", "json"] as ImportFormat[]).map((entry) => (
            <button
              key={entry}
              type="button"
              className={format === entry ? "active" : ""}
              onClick={() => setFormat(entry)}
            >
              {entry === "markdown" ? "Markdown / outline" : entry === "csv" ? "CSV" : "Project JSON"}
            </button>
          ))}
        </div>

        <div
          className={`drop-zone ${dragging ? "over" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files[0];
            if (file) readFile(file);
          }}
          style={{ marginBottom: 10 }}
        >
          {fileName ? `Loaded ${fileName}` : "Drop a .md, .txt, .csv or .json file here"} ·{" "}
          <button type="button" className="text-btn ghost" onClick={() => fileRef.current?.click()}>
            choose a file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".md,.markdown,.txt,.csv,.json"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) readFile(file);
            }}
          />
        </div>

        <textarea
          className="textarea import-text"
          placeholder={
            format === "markdown"
              ? "- Why did profit fall 20%?\n  - Did revenue decline?\n    - Did price per unit fall?\n  - Did cost increase?"
              : format === "csv"
                ? "key,parent_key,level,type,label\n..."
                : '{ "app": "issue-tree-studio", "doc": { ... } }'
          }
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setFileName("");
          }}
          aria-label="Content to import"
        />

        <div className="modal-actions">
          <button type="button" className="text-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="text-btn primary"
            disabled={!text.trim()}
            onClick={() => {
              void ws.importAsNew(text, format, fileName.replace(/\.[^.]+$/, "") || undefined).then(onClose);
            }}
          >
            Import as a new tree
          </button>
        </div>
      </div>
    </div>
  );
}

export function Toasts({ ws }: { ws: Workspace }) {
  if (ws.toasts.length === 0) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {ws.toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.kind}`}>
          <span>{toast.message}</span>
          <button type="button" aria-label="Dismiss" onClick={() => ws.dismissToast(toast.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
