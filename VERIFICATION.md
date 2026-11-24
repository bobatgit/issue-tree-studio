# Verification record

Date: 2026-11-24. Environment: Windows 11, Node 22.23.2, npm 10.9.8.

## Commands

| Command | Result |
| --- | --- |
| `npx tsc -b` | Clean, no diagnostics |
| `npx vite build` | Clean; main bundle 223 kB (73 kB gzip), PowerPoint chunk lazy-loaded at 378 kB |
| `npx vitest run` | 8 files, 84 tests, all passing |
| `npm run smoke` | Four .pptx and four .csv files written to `artifacts/` |
| PowerPoint archive inspection | 15 slides, 0 images, native `p:sp` shapes, footer "version 1" |
| CSV byte inspection | UTF-8 BOM present, CRLF line endings, 8 columns |

## Acceptance checklist

### Goal 1: foundation and key engine

| Requirement | Evidence |
| --- | --- |
| React + TypeScript + Vite scaffold with build and test scripts | `npm run build`, `npm test` pass |
| SHA-256 over normalised label path, Crockford Base32, 4 characters | `keys.test.ts`: determinism, alphabet exclusion of I/L/O/U, length |
| Path sensitivity | `keys.test.ts`: same wording under two parents gets two keys |
| Reorder stability | `keys.test.ts`: swapped siblings produce identical keys |
| Deterministic collision promotion | `keys.test.ts`: forced 1-character collisions are promoted until unique |
| Duplicate content paths stay unique | `keys.test.ts`: two "Other?" siblings, distinct keys |
| 100-node hard cap in the model | `tree.test.ts`, `markdown.test.ts`, `csv.test.ts` |
| Markdown parse and export | `markdown.test.ts`: bullets, numbers, tabs, wrapping, inline cleanup, synthetic root, round-trip |
| CSV schema, BOM, quoting, import | `csv.test.ts`: exact header, CRLF, quoted commas/quotes/newlines, round-trip, id/parent aliases |

### Goal 2: editor and documents

| Requirement | Evidence |
| --- | --- |
| Three-pane shell with version, node counter, undo/redo, import, export | `app.test.tsx` renders the tree, key chips, tree name and Export button |
| Add child by button, add sibling by Enter | `app.test.tsx` interaction tests |
| Inline editing, indent/outdent, drag reorder, delete | Implemented; structural operations covered in `tree.test.ts`; drag and focus behaviour is manual |
| Node status: row checkbox, markdown checkboxes, CSV column, version entry | `app.test.tsx`, `markdown.test.ts`, `csv.test.ts`, `tree.test.ts` |
| Undo/redo | Implemented with a 100-step stack; not automated |
| Multi-document library, IndexedDB autosave | IndexedDB wrapper with in-memory fallback; persistence across reload is manual |
| Cap blocks node 101 | `tree.test.ts` |

### Goal 3: keys, quality, MECE

| Requirement | Evidence |
| --- | --- |
| Key chip on every node | `app.test.tsx` counts key chips; key chips present in the PPTX XML |
| Key index and search resolving current keys | `KeyPanel` code; key maths covered by `keys.test.ts` |
| Alias history and old-key resolution | Store records aliases on every version flush; resolution logic is in `KeyPanel`; manual |
| Deterministic quality checks | `quality.test.ts`: duplicate siblings, overlap, root phrasing, single child, complete node with an open child, empty label, depth imbalance, cap |
| MECE checklist per node | Implemented with settings persisted in the tree and exported in JSON; manual |
| AI reviewer seam, disabled with a visible reason | `mece.ts` interface plus `disabledAiReviewer`; `app.test.tsx` asserts the panel shows the disabled state |

### Goal 4: versioning

| Requirement | Evidence |
| --- | --- |
| Version increments on structural change | `app.test.tsx` asserts the version badge moves past v1 after adding a child |
| Two-second debounce for text, immediate for structure | Implemented in `useWorkspace.queueVersion`; timing is manual |
| Snapshot, keys, summary and aliases per version | `VersionEntry` model and flush code; diff logic covered by `diff.test.ts` |
| 5,000-version cap with checkpoint protection | `pruneVersions` implementation; pruning is manual |
| Diff, restore, checkpoint, history export | `diff.test.ts` covers add, remove, relabel, move, retype, key changes; restore and export are manual |

### Goal 5: exports

| Requirement | Evidence |
| --- | --- |
| Native editable shapes, 16:9, elbow connectors, key chips, footer | Unzipped `stress-100.pptx`: 15 slides, 0 images, `p:sp` shapes only, footer carries the version |
| Overview slide plus packed branch slides (2 to 5 levels) | `layout.test.ts` packing tests; smoke output shows overview plus grouped branch slides |
| Optional key index | Generated in the smoke cases; 100-row index split across 5 slides |
| CSV with the agreed columns, BOM and quoting | `csv.test.ts`; byte inspection of `artifacts/profit-decline.csv` |
| Markdown round-trip and project JSON | `markdown.test.ts`; JSON shape guards in the importer |
| Preview shares the layout engine | `Diagram` and `pptx.ts` both call `layoutTree`; `layout.test.ts` bounds |

## Known gaps

* Drag-and-drop, undo across document switches, and the version-pruning boundary were exercised by code
  review, not by an automated browser test.
* No end-to-end test opens the exported file in PowerPoint itself. The archive was inspected at the OOXML
  level instead: slide count, shape types, absence of media, presence of version text.
* IndexedDB persistence was tested through the in-memory fallback in jsdom, not against a real browser
  profile.
