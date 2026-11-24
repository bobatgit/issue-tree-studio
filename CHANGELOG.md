# Changelog

All notable changes are recorded here. The format follows Keep a Changelog, and versions follow Semantic
Versioning. The build stamp in the app header, for example `0.2.0 · c861e80`, matches a tag in this repository.

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
