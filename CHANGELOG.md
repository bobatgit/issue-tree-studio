# Changelog

All notable changes are recorded here. The format follows Keep a Changelog, and versions follow Semantic
Versioning. The build stamp in the app header, for example `0.2.0 · c861e80`, matches a tag in this repository.

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

### Fixed

- "a item" reads as "an item" in every message the rename touched.

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
