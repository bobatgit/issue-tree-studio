# Implementation plan: six tickets, four phases

The tracked work lives in GitHub issues. This file is the execution plan: order, gates, and the goal
objectives. Issue bodies hold the reasoning; this holds the sequence.

## Phase table

| Phase | Goals | Issue | Push at the end of the phase |
| --- | --- | --- | --- |
| A | 3, 4 | Remove the type concept, then add Complete/Open | once, both inside |
| B | 5, 6 | Key chip to the right, brand glyph | once, both inside |
| C | 1 | One tree, live markdown view | once |
| D | 2 | Workspace restructure | once |

Nothing reaches `origin/main` until a phase is green. Commits land locally, the push is the gate.
Each ticket closes with `Fixes #N` in the commit message, so it closes when the phase is pushed.

## Order rule

`3 -> 4 -> 5 -> 6 -> 1 -> 2`. The one hard dependency: 4 before 1, because the markdown pane writes
task lists and must not be built against a plain-bullet spec.

## Definition of done, every phase

1. `npm test` green, `npm run build` clean.
2. `npm run smoke` regenerates `artifacts/` without errors.
3. Push, then the Pages run is green and the live URL answers 200 with the change present in the bundle.
4. Browser pass on A, C and D: click through the changed flow, and attach a screenshot to the issue.
   B is visual too; screenshot the header and the row at depth 8.

## Goal objectives

Create in reverse order (2, 1, 6, 5, 4, 3) so that 3 ends up focused.

### #3 Remove the node type concept

1. Delete `NodeType`, `NODE_TYPES` and `TreeNode.type` from `src/model/types.ts`.
2. Remove promotion-on-split and the hypothesis defaults in `src/model/tree.ts`; drop type arguments
   from the create, add and import helpers.
3. Delete the "hypothesis has children" check in `src/model/quality.ts` and its import counterpart in
   `src/model/csv.ts`.
4. Collapse the palettes and the legend in `src/components/Diagram.tsx` and `src/export/pptx.ts`;
   remove both type pickers in `src/components/Outline.tsx` and `src/components/Panels.tsx`.
5. Remove type counts from `src/model/diagnostics.ts` and update its test.
6. Keep legacy JSON importing: a document carrying `type` imports with the field ignored.
7. Update fixtures and tests until `npm test` and `npm run build` are green.

Done when: no `type` symbol remains in `src/`, an old project file imports cleanly, tests pass, build clean.

### #4 Status: Complete or Open

1. Add `status: "open" | "complete"` to `TreeNode`; default open on create and import; add `status`
   to `VersionTrigger`.
2. Add `setStatus` in the workspace store: one toggle is one version and one undo step.
3. Markdown: parse `- [ ]` and `- [x]`; tolerate a key prefix; write a box on every line; a bare
   bullet reads as open.
4. CSV: column 4 becomes `status`; header exactly
   `key,parent_key,level,status,label,path,branch_index,version`; keep UTF-8 BOM and CRLF.
5. Outline: checkbox in the right cluster, before the key chip, plus a keyboard toggle for the
   selected node. Details: a status control where the type picker was.
6. PowerPoint and the SVG diagram: a filled marker for complete, hollow for open, before the label,
   with box size and contrast unchanged.
7. Quality: warn when a node is complete and a child is open. Never change status automatically.
8. Diagnostics: status counts replace type counts.
9. Tests: markdown round trip, CSV header, the new warning, and one marker per box on a 100-node deck.

Done when: tests green, build clean, a 100-node deck carries one marker per box, the CSV opens with
eight columns and non-ASCII labels intact.

### #5 Key chip to the right

1. Row order becomes: drag handle, branch glyph, label, then `[checkbox] [key] [+][outdent][delete]`.
2. Key chip tooltip names the level and status, no type.
3. CSS: label flexes, key chip keeps its width, right cluster stays one line.
4. If the label measures under 160px at depth 8 in a 1280px window, collapse the row actions into a
   hover menu. Never shrink the key chip.
5. Render test asserting the DOM order; screenshot at depth 8 attached to the issue.

Done when: the row reads label first, the key still copies on click, tests green, build clean.

### #6 Brand glyph

1. Replace the "IT" text with an inline SVG bulleted list in `src/components/TopBar.tsx`.
2. Keep the 26px tile; white stroke; still legible at 20px.
3. No network request; `aria-hidden` stays.

Done when: no letters remain, no request is added, screenshots at 26px and 20px are on the issue.

### #1 One tree with a live markdown view

1. Replace the IndexedDB library with one record per tab in `sessionStorage`: the document plus a
   byte-budgeted history, pruning the oldest automatic versions first and never a named checkpoint.
2. Delete the sidebar, the library actions and the samples drawer. Samples survive as empty-state
   starts only.
3. Derive the title from the root label: remove the name input and `renameDoc`, follow the root in the
   browser tab title, and slug the root for export filenames.
4. Add the markdown view beside the editor: view switcher (Tree, Markdown), task-list syntax, the
   optional key prefix, Apply or `Ctrl+Enter` with a change preview, `Esc` reverts, one apply is one
   version and one undo step. A view switch never commits.
5. One-time migration: adopt the most recently opened tree from the old library, offer the rest as a
   single JSON bundle, then delete the old records.
6. Tests: storage round trip, title slug, apply preview and diff, a dirty draft surviving a view switch.

Done when: tests green, build clean, and a browser pass shows apply, switch-with-draft, reload
restoring the tree, and two tabs holding two independent trees. Screenshots on the issue.

### #2 Workspace restructure

1. The diagram becomes a third workspace view: Tree, Markdown, Diagram, with `Alt+1`, `Alt+2`, `Alt+3`.
2. The right panel holds Details and History only; the five-tab strip is deleted.
3. Details shows the selected node's fields, status and findings, then the tree-level checks always at
   the bottom. With nothing selected, the tree checks stand alone.
4. The quality error badge moves to the Details tab.
5. Keys move into a Settings dialog opened by a cogwheel button placed immediately left of Import. The
   dialog holds the key index with search, the display options and the slide options.

Done when: tests green, build clean, and a browser pass covers the three views, the two tabs, the
Settings dialog and the diagram click-to-select. Screenshots on the issue.

## Constraints that outlive a single goal

- 100-node cap, 4-character Crockford Base32 keys, path-scoped with deterministic promotion.
- Offline only: no network calls, no telemetry. The AI reviewer stays behind its disabled interface.
- CSV: eight columns, UTF-8 with BOM, CRLF, RFC 4180 quoting.
- PowerPoint: native editable shapes, 16:9, overview slide plus packed branch slides.
- Storage is per tab and dies with the tab. There is no recovery, by explicit decision.
