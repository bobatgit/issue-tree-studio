import { useMemo, useState } from "react";
import { diffSnapshots } from "../model/diff";
import { copyText, downloadText, formatTime, slugify } from "../lib/ui";
import { MECE_SELF_CHECK, disabledAiReviewer, heuristicMeceReview } from "../model/mece";
import { flatten, snapshotOf } from "../model/tree";
import type { VersionDiff } from "../model/diff";
import type { Workspace } from "../store/useWorkspace";

function scrollToItem(ws: Workspace, itemId: string): void {
  ws.expandAncestors(itemId);
  requestAnimationFrame(() => {
    document.querySelector(`[data-row-id="${itemId}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  });
}

function copyKey(key: string, ws: Workspace, label: string): void {
  void copyText(key).then((ok) => {
    ws.toast(ok ? "success" : "error", ok ? `Copied ${key} (${label || "untitled"})` : "Could not copy the key.");
  });
}

/* ------------------------------ quality ------------------------------ */

export function QualityPanel({ ws }: { ws: Workspace }) {
  const doc = ws.doc;
  const counts = ws.findingCounts;
  const capClass = ws.itemCount >= 100 ? "full" : ws.itemCount >= 80 ? "warn" : "";
  const meceItem = doc && ws.selection ? doc.items[ws.selection] : null;
  const meceSplit = useMemo(() => (doc && ws.selection ? heuristicMeceReview(doc, ws.keyMap, ws.selection) : []), [doc, ws.keyMap, ws.selection]);

  if (!doc) return null;

  return (
    <div>
      <div className="section">
        <div className="section-head">
          <span>Item budget</span>
          <span>
            {ws.itemCount} / 100
          </span>
        </div>
        <div className={`meter ${capClass}`}>
          <span style={{ width: `${Math.min(100, ws.itemCount)}%` }} />
        </div>
        <p className="small muted" style={{ margin: "4px 0 0" }}>
          {ws.atCap
            ? "The cap is reached. Merge or delete an item to add more."
            : `${100 - ws.itemCount} items left. The cap keeps every label readable on a slide.`}
        </p>
      </div>

      <div className="section">
        <div className="section-head">
          <span>Checks</span>
          <span>
            {counts.error} errors · {counts.warn} warnings · {counts.info} notes
          </span>
        </div>
        {ws.findings.length === 0 ? (
          <p className="empty-note">No findings. The tree passes the deterministic checks.</p>
        ) : (
          ws.findings.map((finding) => (
            <button
              key={finding.id}
              type="button"
              className="finding"
              onClick={() => {
                if (finding.itemId) {
                  ws.select(finding.itemId);
                  scrollToItem(ws, finding.itemId);
                }
              }}
            >
              <span className="ftop">
                <span className={`sev ${finding.level}`} />
                <span className="ftitle">{finding.title}</span>
              </span>
              <span className="fdetail">{finding.detail}</span>
            </button>
          ))
        )}
      </div>

      <div className="section">
        <div className="section-head">
          <span>Selected split</span>
          <span>{meceItem ? ws.keyMap.byItem[meceItem.id]?.key ?? "none" : "none"}</span>
        </div>
        {!meceItem ? (
          <p className="empty-note">Select an item to review its split.</p>
        ) : (
          <>
            <p className="small" style={{ marginTop: 0 }}>
              <strong>{meceItem.label || "Untitled"}</strong> · {meceItem.children.length} branches
            </p>
            {meceSplit.length === 0 ? (
              <p className="small muted">No overlap or coverage warning for this split.</p>
            ) : (
              meceSplit.map((suggestion, index) => (
                <div key={index} className="diff-block">
                  <span className={`sev ${suggestion.level}`} /> <strong>{suggestion.message}</strong>
                  <div className="small muted" style={{ marginTop: 4 }}>
                    {suggestion.itemKeys.join(" · ")}
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>

      <div className="section">
        <div className="section-head">
          <span>MECE self-check</span>
        </div>
        <ul className="small muted" style={{ paddingLeft: 17, lineHeight: 1.6 }}>
          {MECE_SELF_CHECK.map((question) => (
            <li key={question}>{question}</li>
          ))}
        </ul>
        <div className="ai-box">
          <strong>AI MECE review</strong>
          <div style={{ marginTop: 3 }}>{disabledAiReviewer.reason}</div>
          <div className="small" style={{ marginTop: 6 }}>
            Status: <em>not configured</em>. The deterministic checks above still run on every keystroke.
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ keys ------------------------------ */

export function KeyPanel({ ws }: { ws: Workspace }) {
  const doc = ws.doc;
  const [query, setQuery] = useState("");
  const flat = useMemo(() => (doc ? flatten(doc) : []), [doc]);

  if (!doc) return null;

  const needle = query.trim().toUpperCase();
  const currentMatch = needle
    ? flat.find((entry) => ws.keyMap.byItem[entry.item.id]?.key === needle)
    : undefined;
  const aliasMatch =
    !currentMatch && needle
      ? [...doc.aliases].reverse().find((alias) => alias.from === needle || alias.to === needle)
      : undefined;
  const aliasItem = aliasMatch ? doc.items[aliasMatch.itemId] : undefined;

  return (
    <div>
      <div className="section">
        <div className="section-head">
          <span>Resolve a key</span>
          <span>{flat.length} keys</span>
        </div>
        <input
          className="input"
          placeholder="Type a key, e.g. K7M2"
          value={query}
          maxLength={12}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search for a key"
        />
        {needle ? (
          <div style={{ marginTop: 8 }}>
            {currentMatch ? (
              <button
                type="button"
                className="finding"
                onClick={() => {
                  ws.select(currentMatch.item.id);
                  scrollToItem(ws, currentMatch.item.id);
                }}
              >
                <span className="ftop">
                  <span className="sev info" />
                  <span className="ftitle">
                    {needle}
                  </span>
                </span>
                <span className="fdetail">{currentMatch.item.label || "Untitled"}</span>
              </button>
            ) : aliasMatch ? (
              <div className="diff-block">
                <strong>{needle}</strong> is an old key.{" "}
                {aliasItem ? (
                  <>
                    It now points to <strong>{aliasMatch.to}</strong> ({aliasItem.label || "untitled"}).
                  </>
                ) : (
                  <>That item was deleted.</>
                )}
                <div className="small muted">Changed in version {aliasMatch.v}.</div>
              </div>
            ) : (
              <p className="empty-note">No item or alias has the key {needle}.</p>
            )}
          </div>
        ) : null}
      </div>

      <div className="section">
        <div className="section-head">
          <span>Key index</span>
          <span>label + path → SHA-256 → Base32</span>
        </div>
        <table className="key-table">
          <thead>
            <tr>
              <th>Key</th>
              <th>Label</th>
            </tr>
          </thead>
          <tbody>
            {flat.map((entry) => {
              const info = ws.keyMap.byItem[entry.item.id];
              return (
                <tr
                  key={entry.item.id}
                  onClick={() => {
                    ws.select(entry.item.id);
                    scrollToItem(ws, entry.item.id);
                  }}
                >
                  <td className="key">
                    <button
                      type="button"
                      className={`key-chip ${info?.promoted ? "promoted" : ""}`}
                      title="Copy this key"
                      onClick={(event) => {
                        event.stopPropagation();
                        copyKey(info?.key ?? "", ws, entry.item.label);
                      }}
                    >
                      {info?.key ?? "····"}
                    </button>
                  </td>
                  <td>{entry.item.label || <span className="muted">Untitled</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="small muted" style={{ marginTop: 8 }}>
          A key changes when the item&apos;s own wording or an ancestor&apos;s wording changes. Old keys stay
          resolvable above. Four characters hold 1,048,576 values; a real collision is extended to five and flagged.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------ history ------------------------------ */

function DiffView({ diff }: { diff: VersionDiff }) {
  const blocks: { title: string; items: string[] }[] = [
    { title: "Added", items: diff.added.map((item) => item.label) },
    { title: "Removed", items: diff.removed.map((item) => item.label) },
    { title: "Relabelled", items: diff.relabelled.map((item) => `${item.from} → ${item.to}`) },
    { title: "Moved", items: diff.moved.map((item) => `${item.label} (${item.from || "top"} → ${item.to || "top"})`) },
    { title: "Keys changed", items: diff.rekeyed.map((item) => `${item.from} → ${item.to}  ${item.label}`) },
  ].filter((block) => block.items.length > 0);

  return (
    <div>
      <p className="small" style={{ marginTop: 0 }}>
        <strong>{diff.summary}</strong>
      </p>
      {blocks.map((block) => (
        <div key={block.title} className="diff-block">
          <h4>
            {block.title} ({block.items.length})
          </h4>
          <ul>
            {block.items.slice(0, 12).map((item, index) => (
              <li key={index}>{item}</li>
            ))}
            {block.items.length > 12 ? <li>…and {block.items.length - 12} more</li> : null}
          </ul>
        </div>
      ))}
      {diff.reordered > 0 ? <p className="small muted">{diff.reordered} items changed position.</p> : null}
    </div>
  );
}

export function HistoryPanel({ ws }: { ws: Workspace }) {
  const doc = ws.doc;
  const [checkpointName, setCheckpointName] = useState("");
  const [selectedV, setSelectedV] = useState<number | null>(null);

  const selected = ws.versions.find((entry) => entry.v === selectedV);

  const diff = useMemo(() => {
    if (!doc || !selected) return null;
    const currentKeys = Object.fromEntries(
      Object.entries(ws.keyMap.byItem).map(([id, info]) => [id, info.key]),
    );
    return diffSnapshots(
      { snapshot: selected.snapshot, keys: selected.keys },
      { snapshot: snapshotOf(doc), keys: currentKeys },
    );
  }, [doc, selected, ws.keyMap]);

  if (!doc) return null;

  return (
    <div>
      <div className="section">
        <div className="section-head">
          <span>Current version</span>
          <span>
            v{doc.version}
            {ws.pendingVersion ? " · writing…" : ""}
          </span>
        </div>
        <p className="small muted" style={{ marginTop: 0 }}>
          Text edits become a version after 2 seconds of quiet. Structural changes, imports and restores are
          versioned at once. History keeps the latest 5,000 versions; checkpoints are never pruned.
        </p>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            className="input"
            placeholder="Checkpoint name (for example: baseline for review)"
            value={checkpointName}
            onChange={(event) => setCheckpointName(event.target.value)}
            aria-label="Checkpoint name"
          />
          <button
            type="button"
            className="text-btn"
            disabled={!checkpointName.trim()}
            onClick={() => {
              void ws.checkpoint(checkpointName).then(() => setCheckpointName(""));
            }}
          >
            Save
          </button>
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <span>Versions</span>
          <span>
            {ws.versions.length} shown · {ws.versionCount} stored
          </span>
        </div>
        {ws.versions.map((entry) => (
          <div
            key={entry.v}
            className={[
              "version-row",
              entry.v === doc.version ? "current" : "",
              selectedV === entry.v ? "selected" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <div className="vtop">
              <span className="vnum">v{entry.v}</span>
              <span className="vsum">{entry.summary}</span>
            </div>
            <div className="vmeta">
              <span>{formatTime(entry.at)}</span>
              <span>{entry.trigger}</span>
              {entry.aliases && entry.aliases.length > 0 ? <span>{entry.aliases.length} key changes</span> : null}
              {entry.checkpoint ? <span>★ {entry.checkpoint}</span> : null}
            </div>
            <div className="vactions">
              <button type="button" className="text-btn ghost" onClick={() => setSelectedV(entry.v)}>
                Compare
              </button>
              <button
                type="button"
                className="text-btn ghost"
                disabled={entry.v === doc.version}
                onClick={() => {
                  if (window.confirm(`Restore version ${entry.v}? This adds a new version; nothing is overwritten.`)) {
                    void ws.restoreVersion(entry.v);
                  }
                }}
              >
                Restore
              </button>
            </div>
          </div>
        ))}
        {ws.versionCount > ws.versions.length ? (
          <button type="button" className="text-btn" onClick={() => void ws.reloadVersions(1000)}>
            Load more versions
          </button>
        ) : null}
      </div>

      {selected && diff ? (
        <div className="section">
          <div className="section-head">
            <span>
              Diff v{selected.v} → current
            </span>
          </div>
          <DiffView diff={diff} />
        </div>
      ) : null}

      <div className="section">
        <button
          type="button"
          className="text-btn"
          onClick={() => {
            void ws.exportProject().then((json) => {
              downloadText(json, `${slugify(doc.name)}-history.json`, "application/json;charset=utf-8");
              ws.toast("success", "Project and history exported.");
            });
          }}
        >
          Export project + history (JSON)
        </button>
      </div>
    </div>
  );
}

/* ------------------------------ item ------------------------------ */

export function ItemPanel({ ws }: { ws: Workspace }) {
  const doc = ws.doc;
  const item = doc && ws.selection ? doc.items[ws.selection] : null;
  const info = item ? ws.keyMap.byItem[item.id] : null;
  const aliases = useMemo(
    () => (doc && item ? doc.aliases.filter((alias) => alias.itemId === item.id).slice(-6).reverse() : []),
    [doc, item],
  );
  const suggestions = useMemo(
    () => (doc && item ? heuristicMeceReview(doc, ws.keyMap, item.id) : []),
    [doc, ws.keyMap, item],
  );

  if (!doc) return null;
  if (!item || !info) {
    return <p className="empty-note">Select an item in the outline or the diagram.</p>;
  }

  return (
    <div>
      <div className="section">
        <div className="section-head">
          <span>Key</span>
          <span>{info.promoted ? "extended after collision" : "4 characters"}</span>
        </div>
        <div className="key-big">
          <code>{info.key}</code>
          <button type="button" className="text-btn" onClick={() => copyKey(info.key, ws, item.label)}>
            Copy
          </button>
        </div>
        <p className="key-explain">
          SHA-256 of the normalised label path, cut to {info.length} Crockford Base32 characters.
          <br />
          <code>{info.path.replace(/\u001f/g, " / ")}</code>
        </p>
        <dl className="kv" style={{ marginTop: 10 }}>
          <dt>Key path</dt>
          <dd>{info.pathKeys.join(" / ")}</dd>
          <dt>Level</dt>
          <dd>{info.depth}</dd>
          <dt>Children</dt>
          <dd>{item.children.length}</dd>
        </dl>
        {aliases.length > 0 ? (
          <div style={{ marginTop: 10 }}>
            <div className="section-head">
              <span>Previous keys</span>
            </div>
            {aliases.map((alias, index) => (
              <div key={index} className="small muted">
                {alias.from} → {alias.to} <span className="faint">in v{alias.v}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="section">
        <div className="section-head">
          <span>Wording</span>
        </div>
        <div className="field">
          <label htmlFor="item-label">Label</label>
          <textarea
            id="item-label"
            className="textarea"
            value={item.label}
            onChange={(event) => ws.editLabel(item.id, event.target.value)}
          />
        </div>
        <div className="field">
          <label>Status</label>
          <button
            type="button"
            className={`status-toggle ${item.status}`}
            onClick={() => ws.setStatus(item.id, item.status === "complete" ? "open" : "complete")}
          >
            {item.status === "complete" ? "Complete" : "Open"}
          </button>
        </div>
        <div className="field">
          <label htmlFor="item-note">Note</label>
          <textarea
            id="item-note"
            className="textarea"
            placeholder="Data source, test, owner or evidence (kept in the project file)"
            value={item.note ?? ""}
            onChange={(event) => ws.setNote(item.id, event.target.value)}
          />
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <span>MECE check</span>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={Boolean(item.mece?.exhaustive)}
            onChange={(event) => ws.setMece(item.id, { ...item.mece, exhaustive: event.target.checked })}
          />
          <span>
            <strong>Exhaustive</strong>
            <br />
            <span className="muted small">The branches together cover everything that could answer this item.</span>
          </span>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={Boolean(item.mece?.exclusive)}
            onChange={(event) => ws.setMece(item.id, { ...item.mece, exclusive: event.target.checked })}
          />
          <span>
            <strong>Mutually exclusive</strong>
            <br />
            <span className="muted small">No two branches describe the same thing.</span>
          </span>
        </label>
        {suggestions.map((suggestion, index) => (
          <div key={index} className="small muted" style={{ marginTop: 6 }}>
            <span className={`sev ${suggestion.level}`} /> {suggestion.message}
          </div>
        ))}
      </div>

      <div className="section" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button type="button" className="text-btn" onClick={() => ws.addChild(item.id)}>
          Add child
        </button>
        <button type="button" className="text-btn" onClick={() => ws.addSibling(item.id)}>
          Add sibling
        </button>
        <button
          type="button"
          className="text-btn"
          onClick={() => {
            if (window.confirm(`Delete "${item.label}" and everything below it?`)) ws.remove(item.id);
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
