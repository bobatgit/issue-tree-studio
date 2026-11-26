/** The markdown view: the same tree as text, applied on purpose and never by accident. */

import { useMemo, useState } from "react";
import { describeApply, hasChanges, mergeParsed, previewApply } from "../model/apply";
import { parseMarkdown, toMarkdown } from "../model/markdown";
import { ITEM_CAP } from "../model/types";
import type { Workspace } from "../store/useWorkspace";

interface Props {
  ws: Workspace;
  draft: string | null;
  onDraft: (text: string | null) => void;
}

export function MarkdownView({ ws, draft, onDraft }: Props) {
  const doc = ws.doc;
  const [showKeys, setShowKeys] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const serialise = (withKeys: boolean): string => {
    if (!doc) return "";
    return toMarkdown(doc, doc.version, withKeys ? { keys: (id) => ws.keyMap.byItem[id]?.key ?? "" } : {});
  };

  const generated = useMemo(() => serialise(showKeys), [doc, showKeys, ws.keyMap.byItem]);
  const text = draft ?? generated;
  const dirty = draft !== null && draft !== generated;

  const preview = useMemo(() => {
    if (!doc) return null;
    const parsed = parseMarkdown(text, doc.name).doc;
    return previewApply(doc, mergeParsed(doc, parsed), ITEM_CAP);
  }, [doc, text]);

  if (!doc || !preview) return null;

  const blocked = preview.overCap || !text.trim();
  const apply = (): void => {
    if (blocked) {
      setError(preview.overCap ? `That outline has ${preview.total} items. The cap is ${ITEM_CAP}.` : "The outline is empty.");
      return;
    }
    if (ws.applyMarkdown(text)) {
      setError(null);
      onDraft(null);
    }
  };

  return (
    <div className="markdown-view">
      <div className="markdown-head">
        <span className="small muted">
          Task list: <code>- [ ]</code> open, <code>- [x]</code> complete. Edits change nothing until you apply.
        </span>
        <span className="spacer" />
        <label className="check small" title={dirty ? "Apply or revert first" : "Prefix every line with its key"}>
          <input
            type="checkbox"
            checked={showKeys}
            disabled={dirty}
            onChange={(event) => {
              setShowKeys(event.target.checked);
              onDraft(null);
            }}
          />
          <span>Show keys</span>
        </label>
        <button type="button" className="text-btn ghost" onClick={() => onDraft(null)} disabled={!dirty}>
          Revert
        </button>
        <button type="button" className="text-btn primary" onClick={apply} disabled={!dirty || blocked}>
          Apply
        </button>
      </div>

      <textarea
        className="markdown-area"
        aria-label="Markdown outline"
        spellCheck={false}
        value={text}
        onChange={(event) => {
          onDraft(event.target.value);
          setError(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            apply();
          } else if (event.key === "Escape") {
            event.preventDefault();
            onDraft(null);
          }
        }}
      />

      <div className={`markdown-foot ${preview.overCap ? "over" : ""}`}>
        {error ? <span className="sev error" /> : null}
        <span>{error ?? describeApply(preview)}</span>
        <span className="spacer" />
        {dirty ? <span className="small muted">Not applied. Ctrl+Enter applies, Esc reverts.</span> : null}
        {!dirty && hasChanges(preview) ? <span className="small muted">Matches the tree.</span> : null}
      </div>
    </div>
  );
}
