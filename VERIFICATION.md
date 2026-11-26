# Verification record

Date: 2026-11-25. Environment: Windows 11, Node 22.23.2, Chromium 158 (headless Edge via CDP),
provider-independent. Live: https://bobatgit.github.io/issue-tree-studio/ at 0.7.0.

## Commands

| Command | Result |
| --- | --- |
| `npx tsc -b` | Clean |
| `npm run build` | Clean; main bundle 233 kB, PowerPoint chunk lazy at 378 kB |
| `npx vitest run` | 11 files, 107 tests, all passing |
| `npm run smoke` | Four `.pptx` and four `.csv` written to `artifacts/` |
| `npm run perf` | 500-node probe, numbers below |
| Deploy | GitHub Actions green for every phase; live URL 200 |

## What shipped

| Phase | Tickets | Release | Headline |
| --- | --- | --- | --- |
| A | #3, #4 | 0.3.0 | Type concept removed; every node is a question with Open or Complete |
| B | #5, #6, #9, #10 | 0.3.1 | Key chip right, list glyph, collapsible branches, 16px labels |
| C | #1 | 0.4.0 | One tree per tab in `sessionStorage`, root title, live markdown view, migration |
| D | #2, #7 | 0.5.0 | Three views, Details and History, Settings dialog, collapsible rail |
| E | #11 | 0.6.0 | Five-character keys, nudge at 100, hard cap 500, measured at 500 |
| F | #8 | 0.7.0 | Phone layout: one pane, details sheet, two-line rows, action sheet |

## Verification matrix

### Keys

| Requirement | Evidence |
| --- | --- |
| Five-character Crockford Base32 over the normalised label path | `keys.test.ts`: determinism, alphabet, length 5 |
| Path scope and reorder stability | `keys.test.ts`: same wording under two parents differs; sibling swap keeps keys |
| Deterministic promotion on a real collision | `keys.test.ts`: forced short lengths promote until unique, and stay stable |
| Importing an old file reports upgraded keys | `project.test.ts`: `hasLegacyKeys`; store toast on import |

### Caps

| Requirement | Evidence |
| --- | --- |
| Nudge at 100, dismissible once per tab, nothing blocked | `quality.test.ts` (`NODE_COUNT_HIGH` at 120, not the cap); App effect |
| Hard cap 500 in the model | `tree.test.ts`; `types.ts` `NODE_CAP = 500` |
| Markdown apply refuses above 500 | `apply.test.ts` over-cap preview; `MarkdownView` block |
| CSV and markdown imports keep the first 500 with a warning | `csv.test.ts`, `markdown.test.ts` |

### Status and quality

| Requirement | Evidence |
| --- | --- |
| Row checkbox, Details control, markdown task list, CSV column, version trigger | `app.test.tsx`, `markdown.test.ts`, `csv.test.ts` |
| Deck marker for every box | unzipped `stress-100.pptx`: 138 boxes, 138 markers |
| Complete node with an open child warns | `quality.test.ts` |
| Applying an outline keeps notes and MECE flags | `apply.test.ts` by path, then position |

### Storage and markdown view

| Requirement | Evidence |
| --- | --- |
| One tree per tab in `sessionStorage`, history pruned by byte budget with checkpoints kept | `storage.ts` `fitToBudget`; unit coverage of pruning via `pruneVersions` |
| Title derived from the root label | `titleOf`; `app.test.tsx` shows the root as the shell title |
| Migration adopts the newest tree, archives the rest, deletes the old database | `migrateLegacy`, guarded by a 3 s timeout; legacy connection closed before deletion |
| Markdown apply is explicit and one undo step | `app.test.tsx`: Ctrl+Enter applies; a draft survives a view switch without committing |

### Workspace and phone

| Requirement | Evidence |
| --- | --- |
| Three views, Alt+1/2/3; Diagram full width | `app.test.tsx` diagram test; screenshots |
| Panel holds Details and History; Quality folded in; error badge on Details | `app.test.tsx` panel tests; screenshots |
| Keys in a Settings dialog behind the cogwheel | `app.test.tsx`: opens the dialog and finds the key section |
| Panel collapses to a rail and returns | `app.test.tsx`; scroll and tab memory in `App.tsx` |
| Phone: one pane, details sheet, two-line rows, action sheet, 44px targets | `app.test.tsx` row actions; browser passes below |

### Exports

| Requirement | Evidence |
| --- | --- |
| Deck exports at the 500-node cap | `npm run perf`: 2.42 MB in 469 ms |
| CSV: 8 columns, BOM, CRLF, status in slot 4 | `csv.test.ts`; smoke artifacts |
| Markdown round-trips through the importer with status and key prefixes ignored | `markdown.test.ts` |

## Performance at 500 nodes

From `npm run perf` (model path, not DOM typing):

| Step | Time |
| --- | --- |
| computeKeyMap | 12.3 ms |
| reviewTree | 23.0 ms |
| toMarkdown | 2.1 ms |
| exportCsv | 2.2 ms |
| Deck build and write | 469 ms |

## Browser passes

Headless Edge through the DevTools protocol, with `sessionStorage` seeded to a fixed six-node tree, at real CSS
viewport sizes. Screenshots are committed under `docs/screenshots/` and attached to their issues.

| Viewport | What was checked | Screenshot |
| --- | --- | --- |
| 1440x900 | Type removal (#3), status (#4), collapsed branch (#9), markdown view (#1), three views and details (#2) | `ticket-3-*`, `ticket-4-*`, `ticket-9-*`, `ticket-1-*`, `ticket-2-*` |
| 1440x900 | Collapsed rail (#7) | `ticket-7-rail.png` |
| 393x852 | Phone tree with two-line rows, then the action sheet | `ticket-8-tree.png`, `ticket-8-sheet.png` |
| 360x800 | Phone with the Details sheet open | `ticket-8-360.png` |

The passes caught three defects that the unit tests could not: scrollbar arrows inside the wrapped label, a
980 px `min-width` on the shell that broke every phone layout, and an unclosed legacy IndexedDB connection that
could stall the first load. All three are fixed.

## Known gaps

* No end-to-end test opens the exported `.pptx` in PowerPoint. The archive is inspected at the OOXML level:
  slide count, `p:sp` shapes only, no media, one marker per box.
* The phone layout is verified at phone CSS viewport sizes in emulation, not on an iPhone 15 or Galaxy S21 with
  touch hardware, a soft keyboard or notch insets.
* Two-tab independence follows from `sessionStorage` and was checked by hand; there is no automated multi-tab
  test.
* Collision promotion at five characters is exercised with forced short lengths; a real five-character
  collision at 500 nodes has not been observed (probability about 0.37 percent).
* Undo depth, the 2 s text debounce and version pruning at the boundary remain code review plus manual checks.
* The stall detector added to the local watchdog extension is documented in its own header, not in this repo.
