# Changelog

All notable changes are recorded here. The format follows Keep a Changelog, and versions follow Semantic
Versioning. The build stamp in the app header, for example `0.2.0 · c861e80`, matches a tag in this repository.

## [0.10.1] - 2026-11-26

### Changed

- The list draws its depth: a box-drawing elbow on every row below the root and a rail for every level still open,
  in one monochrome colour, at a 22px step. Depth is carried by shape, never by colour.
- The collapse arrow is drawn rather than typed: a filled triangle pointing right when folded, an outline triangle
  pointing down when open, at 1.4 times its old size with a bigger target. A leaf draws no arrow at all and keeps
  the slot, so labels still line up column to column.
- A folded branch says how many items it hides, counting every item inside it at any depth, from one pass over the
  map rather than a walk per row.
- Column headings above the list: `Item no.`, `Item`, `Key`, `Status`, each over its own column to the pixel, sticky
  while the list scrolls, outside the tree role, absent when the tree is empty and hidden at 640px. The row's key and
  status columns swap so the headings match the order they name.
- One footer in every view, reusing the markdown footer's class: the state of that view on the left, the build on the
  right. The build leaves the top bar and is no longer hidden on a phone, where the footer wraps instead. The `v1`
  document pill stays in the top bar.
- The Diagram view is inset by the same 16px the Tree view uses, so its legend, its box and its plan head line up
  with the outline's rows, and its legend takes the section label's treatment.

### Removed

- The Tree head's `18 items · 4 levels`, the Diagram's `18 items · layout 10.0in × 1.9in` line, and the plan head's
  slide count. Each fact now appears once, in the footer of the view it belongs to.

## [0.10.0] - 2026-11-26

### Changed

- **Breaking: keys are six Crockford Base32 characters, and the key string carries a hyphen after the third**:
  `A3E-B88`, so a person can say `A3E` or `B88`. Six characters hold 1,073,741,824 values, which puts a real
  collision at the 500-item cap at about 0.012 percent instead of 0.37. The hyphen is part of the key everywhere
  it appears: the CSV `key`, `parent_key` and `path` columns, the markdown token `{[A3E-B88]}`, the clipboard, the
  row chip, the diagram box, the Details panel and the deck. On a real collision the first group stays three
  characters and the second extends, `A3E-B88C`.
- **Breaking: five-character keys no longer resolve, and the alias mechanism is gone.** No alias records, no
  Previous keys list, no key-change count in History, and no `aliases` field in the saved document. The markdown
  reader no longer accepts the older `K7M2 · Label` prefix. Version compatibility is explicitly not a concern.

## [0.9.0] - 2026-11-26

### Added

- **Position numbers**, derived from where an item sits: the root is `Q0`, its children `Q1`, `Q2`, and anything
  deeper appends its position among its siblings, so `Q2.4.1`. A number is never stored, never enters the key
  hash and never reaches a version snapshot or a diff. It is shown in a column at the left of every tree row, on
  its own first line inside a diagram box and a slide box, and it leads the CSV.
- A report after a paste that removed pasted numbering, naming each line with the number the item received. The
  full list is kept for Copy diagnostics.

### Changed

- **Breaking: the CSV header is nine columns and `number` leads it.**
  `number,label,key,level,parent_key,status,path,branch_index,version`. The importer resolves columns by name, so
  a file exported before this release still imports.
- **Breaking: the markdown export is a plain list with no heading**, and the key moves to the end:
  `- [ ] Q2.1. How did revenue change? {[2GK88]}`. The root is the first list line and carries `Q0`. The reader
  still accepts the form older releases wrote, `K7M2 · Label`.
- Pasted numbering is stripped before a label is stored, so it never reaches the key hash: `1. Revenue` and
  `Revenue` now share one key. An enumerator is only dropped when a separator follows it, so `2024 revenue`,
  `3-way split` and `Q1 results` stay whole. Letters and roman numerals are stripped whenever a separator
  follows them, with no sequence check.
- A trailing `{[2GK88]}` is read on shape alone and dropped whether or not it resolves, because a key is always
  recomputed from the wording and its path.
- Slide boxes carry the number on a first line with the status marker, so they are taller and a deck packs
  fewer boxes per slide. Exporting still never refuses, including at 500 items.

## [0.8.1] - 2026-11-26

### Changed

- Bigger type across the interface: the item label is 18px and the root 20px, panel body 14px, small and muted
  text 13px, buttons 14px, the markdown editor 16px. Row geometry, the key chip, the status box, the chevron,
  the top bar and the phone row grow with the text. The deck does not move, because it sizes text in points.
- The collapsed rail draws a clock for History instead of `⟲`, which read as undo beside the real undo buttons.

### Fixed

- A label's three-line limit was a hand-written 72px. It no longer landed on a line boundary, so a sliver of the
  next line showed above the following row. The limit is read from the computed line height now, so the cut
  always falls between lines, and a probe check fails if any label ever hides part of a line.

## [0.8.0] - 2026-11-26

### Changed

- **Breaking: the saved map is `items`, not `nodes`.** A project file exported before this release no longer
  imports, and a tab that is open when this version loads comes up as a fresh tree instead of recovering. The
  tab is the document boundary and closing it ends the tree, so nothing is recovered by design. If that ever
  becomes unacceptable the mitigation is one line: read `nodes` when `items` is absent. It changes nothing
  about how new files are written.
- One word for one thing: the interface, the code and the saved file now say **item**. Was `node` in counts,
  panel headings, warnings, toasts, tooltips, placeholders, aria-labels, empty states, diagnostics and quality
  wording, and in the identifiers `TreeNode`, `FlatNode`, `NodeStatus`, `NodeKey`, `nodeCount`, `NODE_CAP`,
  `byNode` and `nodeId`. Only `tree`, `branch`, `leaf`, `level`, `depth`, `path`, `key` and `hash` are
  unchanged vocabulary.
- A stored document whose shape cannot be read is an empty tab, never an error.

### Added

- A vocabulary test fails when the word `node` appears anywhere in the source, ignoring comments, so it cannot
  creep back into the interface.

### Removed

- The Keys section of the Settings dialog: the key index table and the "Resolve a key" search, with the
  `KeyPanel` component behind them. A settings dialog holds settings, and an item's key is already on its row
  and on its key chip. Per-item key changes stay in the Details panel and per-version key counts stay in
  History, so alias information remains visible. Searching for an item by a key or an old key is no longer
  possible.

### Fixed

- "a item" reads as "an item" in every message the rename touched.
- The key rule moved to the Details panel and was corrected there: five characters hold 33,554,432 values and
  a real collision is promoted to six and flagged. The paragraph it replaced still said four characters and
  1,048,576 values.

## [0.7.0] - 2026-11-25

### Added

- A phone layout below 640px wide or 480px tall: one pane, the tree full screen, Details in a bottom sheet opened
  from the header, two-line rows with status, key and an action sheet (add, sibling, indent, outdent, move, copy
  key, delete), 44px targets, 16px inputs, safe-area insets and `visualViewport` scrolling.
- Tree and Markdown only on a phone; the diagram stays a desktop view.

### Fixed

- The legacy IndexedDB connection is closed before the database is deleted, and startup waits at most three
  seconds for the migration, so a blocked database can no longer leave the app on its loading screen.

## [0.6.0] - 2026-11-25

### Changed

- Keys are five Crockford Base32 characters. The length no longer grows with the node count; a real collision
  still promotes deterministically to six or more. Existing trees are re-keyed on load, old keys stay resolvable
  as aliases, and importing a file with four-character keys says they were upgraded.
- The 100-node block becomes a nudge at 100 and a hard cap at 500. CSV and markdown imports keep the first 500
  rows with a corrected warning; the markdown apply refuses text above 500.
- The counter reads `n / 500` and turns amber at 100.

### Measured

- At 500 nodes: `computeKeyMap` 12 ms, `reviewTree` 23 ms, `toMarkdown` 2 ms, `exportCsv` 2 ms, deck build and
  write 469 ms (2.4 MB). Recorded by `npm run perf`.

## [0.5.0] - 2026-11-25

### Added

- Three workspace views: **Tree**, **Markdown** and **Diagram**, with Alt+1, Alt+2 and Alt+3. The diagram
  leaves the side panel and takes the full width; clicking a box still selects its node.
- The right panel collapses to a 44px rail with Ctrl+backslash or the chevron in the tab strip. It keeps the
  active tab and the scroll position, persists per tab, and shows an error dot on the Details icon.

### Changed

- The right panel holds Details and History only. Quality is folded into Details, with the tree-level checks
  always at the bottom.
- Keys, display options and slide options move into a Settings dialog behind the cogwheel next to Import.

## [0.4.0] - 2026-11-25

### Added

- A Markdown view beside the tree: a task list with `- [ ]` and `- [x]`, an optional `K7M2 · ` key prefix,
  explicit Apply or Ctrl+Enter with a change preview, and Esc to revert. One apply is one version and one
  undo step; switching views keeps the draft and never commits.
- Applying an outline keeps the note and MECE flags of every node whose label path or position survived.

### Changed

- One tree per tab. The document library, sidebar, samples drawer and rename are gone; `sessionStorage` holds
  the tree and its byte-budgeted history, and closing the tab ends both.
- The title is the root question, so the name field, the export filenames and the markdown heading all follow
  the root.
- The first load adopts the most recent IndexedDB tree, downloads the rest as one JSON bundle, and deletes the
  old database.

## [0.3.1] - 2026-11-24

### Added

- Collapsible branches: a chevron replaces the branch glyph, a collapsed node shows a hidden-count badge,
  Alt+click folds the whole branch, and a header control collapses or expands all. The state is per tab and
  never enters the document, the exports or the history.
- Labels at 16px, the root at 17px, wrapping to three lines; the key chip moves to the right of the row.

### Fixed

- The wrapped label field no longer shows native scrollbar arrows.

## [0.3.0] - 2026-11-24

### Changed

- Every node is a question. The Question / Hypothesis / Issue distinction is gone from the model, the row,
  the diagram, the deck and the key index. Old project files import with the dead field dropped.
- The CSV `type` column is replaced by `status`, keeping eight columns in the same order.

### Added

- Each node is **Complete** or **Open**: a checkbox on the row, a control in the detail panel, `- [x]` and
  `- [ ]` in markdown, a filled or hollow marker in the deck and the diagram, and a warning when a complete
  node still has an open child.

## [0.2.0] - 2026-11-24

### Added

- Build stamp in the header: app version plus short commit, so every report names the exact bundle.
- Export, then Copy diagnostics: one paste-ready block with the build, browser, viewport, tree statistics, key
  state, settings and the tree JSON.
- Export, then Report a problem: a direct link to the issue chooser.
- Issue templates for bug, defect and feature, with a small label set documented in the README.

### Changed

- The Pages workflow uses Node 24 actions: checkout, setup-node, upload-pages-artifact and deploy-pages.

## [0.1.0] - 2026-11-24

### Added

- Markdown nested-list import, inline outline editor with drag reorder, keyboard editing, undo and redo.
- Node typing: question, hypothesis and issue, with leaf hypotheses and automatic promotion on split.
- 4-character Crockford Base32 keys over the normalised label path, deterministic collision promotion, alias
  history and a key index with search.
- Quality panel with deterministic checks, a MECE self-check and per-node MECE flags, plus a disabled AI
  reviewer seam with a defined interface.
- Version history: automatic versions per change, named checkpoints, diff, restore and a 5,000-version cap.
- Exports: editable PowerPoint with an overview slide, packed branch slides and an optional key index; CSV with
  BOM and CRLF; markdown; project JSON.
- Document library in IndexedDB, two sample trees and a hard 100-node cap.
- GitHub Pages deployment with a computed base path.

[0.3.0]: https://github.com/bobatgit/issue-tree-studio/releases/tag/v0.3.0
[0.2.0]: https://github.com/bobatgit/issue-tree-studio/releases/tag/v0.2.0
[0.1.0]: https://github.com/bobatgit/issue-tree-studio/releases/tag/v0.1.0
