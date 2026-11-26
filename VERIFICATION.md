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

---

# Verification record: 0.8.0 and later

Date: 2026-11-26. Environment: Windows 11, Node 22.23.2, Edge 158 (headless, over the DevTools protocol),
provider-independent.

## Phase G - one word for one thing (0.8.0, breaking)

| Ticket | What shipped |
| --- | --- |
| #18 | The word and the stored field both become **item**: 977 occurrences across 34 source files and the scripts. The saved map is `items` with no fallback, so a file exported before this release no longer imports and a tab open across the deploy returns as a fresh tree |
| #26 | The Settings dialog holds settings only: the key index table, the "Resolve a key" search and `KeyPanel` are gone. The key rule moved to the Details panel and was corrected to five characters and 33,554,432 values |

## Commands

| Command | Result |
| --- | --- |
| `npx tsc -b` | Clean. It also proves the identifier rename is complete, because a stale reference fails |
| `npm run build` | Clean; the bundle carries 0.8.0 |
| `npx vitest run` | 13 files, 117 tests, all passing (107 before this phase, 10 added, none deleted) |
| `npm run smoke` | Four `.pptx` and four `.csv`; every CSV round-trips to the same tree |
| `npm run perf` | 500 items, 5-character keys, deck 2.42 MB in 374 ms |
| `npm run probe` | 10 of 10 checks |
| `npm run shots` | 8 PNGs; `ticket-18-items-1440.png` and `ticket-26-settings-1440.png` are the issue evidence |

## Tests added in this phase

| Test | What it proves |
| --- | --- |
| `vocabulary.test.ts` | No file under `src` or `scripts` contains the old word outside a comment. It earned its keep immediately: it caught a missed uppercase `NODE_CAP` in `scripts/perf.ts` that the first pass had renamed in `src` only |
| `storage.test.ts` | A stored document from before the rename is an empty tab, never an error, and a payload that is not JSON behaves the same way |
| `project.test.ts` | A file carrying the old field imports as nothing; a file written by this release round-trips |
| `app.test.tsx` | A tab from before the rename starts a fresh tree; the dialog shows Display and Slides only; a display toggle survives closing the dialog; no view says the old word |

## The break, checked rather than assumed

The deliberate break is that a document written before 0.8.0 no longer loads. Three tests hold it in place: the
project file import, the tab store, and the app boot. The app boots to a fresh tree with no stack trace, which
is the same state a new tab starts in.

## Baselines this phase recorded, for later phases

* The diagram box outline computes to `0.02` user units, which is 1.66 px at Fit. The hover outline computes to
  `2` user units, which is 165.75 px on screen: that is defect #20, measured rather than described.
* The list row label is 16 px and the root label 17 px, so #17 has a starting number.
* The indent step is 15 px per level, so #15 has a starting number.
* The fixture is 18 items at four levels, so a count assertion has something to count.

## Known gaps, unchanged from the previous record

* The probe and the shots need a local browser on port 9222, so neither runs in CI. The five commands that do
  run there are `tsc -b`, `build`, `vitest run`, `smoke` and `perf`.

## Phase H - bigger type and a clock (0.8.1)

| Ticket | What shipped |
| --- | --- |
| #17 | The item label is 18px and the root 20px; panel body 14px, small and muted text 13px, buttons 14px, the markdown editor 16px. Row geometry grows with the text |
| #19 | The collapsed rail draws an inline clock for History instead of `⟲`, which read as undo |

## Commands

| Command | Result |
| --- | --- |
| `npx tsc -b` | Clean |
| `npm run build` | Clean; the bundle carries 0.8.1 |
| `npx vitest run` | 13 files, 118 tests, all passing (117 before, one added) |
| `npm run smoke` | Four `.pptx` and four `.csv`, every CSV round-trips. The deck byte sizes are **identical** to 0.8.0: 300,793, 181,760, 1,220,519 and 119,904 bytes. A screen-only change did not touch the export, and that is the check |
| `npm run perf` | 500 items, deck 2.42 MB in 340 ms |
| `npm run probe` | 18 of 18 checks |
| `npm run shots` | Tree at 1440 and 360, markdown, diagram, hover, folded, the rail and the settings dialog |

## What the measurements caught

* **A partial line, found in a screenshot and then made impossible.** The three-line label cap was a hard 72px, which
  stopped landing on a line boundary once the type grew: the phone shot showed a sliver of a fourth line above the
  next row. The cap now comes from the computed line height, and `partialClips` in the probe fails if any label hides
  part of a line at either width. The same probe check would have caught the original defect.
* **The type scale's "now" column was wrong.** The ticket described panel headings as 13px, buttons as 13px and body
  as 12px. The classes it named mostly belong to the document library that was removed in an earlier release, and the
  live uppercase panel label is 11px. Where the number and the role disagreed, the role decided: a uniform factor of
  about 1.15, with the two values the ticket states exactly applied exactly, which lands panel body on 14px and small
  and muted text on 13px as it asks.
* **A line-ending trap.** The first commit of the type scale stored `src/styles.css` with CRLF line endings against an
  LF history, which turned a 72-line change into a 1584-line diff. It was amended, and the whole change is reviewable
  again. Any script that rewrites a source file should write bytes, or check the diff afterwards.

## Known gaps in this phase

* The rail's clock is verified by a component test that an `svg` with a `circle` is present and by the rail screenshot.
  Whether it reads as a clock at a glance was judged from the picture, not measured.
* Touch targets are asserted at 44px in the phone probe, but pinching and two-finger panning still need a real
  device and belong to #21.

## Phase I - the numbering spine (0.9.0, breaking)

Three tickets that had to land together, because the markdown round trip is the acceptance test for all
three: the export writes a number and reads one back, so a change to either side alone fails it.

| Ticket | What shipped |
| --- | --- |
| #12 | Numbers derived from position: `Q0`, `Q1`, `Q2.4.1`. A column at the left of every tree row, a first line of its own inside a diagram box and a slide box, and a new leading `number` column in the CSV |
| #13 | Pasted numbering stripped before the label is stored, so it never reaches the hash, with a report naming each line and the number it received |
| #14 | The markdown key moves to the end as `{[2GK88]}`, the heading is gone, and a trailing token is read on shape alone |

## Commands

| Command | Result |
| --- | --- |
| `npx tsc -b` | Clean |
| `npm run build` | Clean; the bundle carries 0.9.0 |
| `npx vitest run` | 15 files, 170 tests, all passing (118 before, 52 added, none deleted) |
| `npm run smoke` | Four decks and four CSVs, every CSV round-trips with the nine-column header |
| `npm run perf` | 500 items, deck 2.43 MB in 420 ms |
| `npm run probe` | 22 of 22 checks, including four new ones for the numbers |
| `npm run shots` | Tree, phone, diagram, markdown, rail, dialog and empty state |

## The numbers, measured

| Check | Value |
| --- | --- |
| `numberedRows` at 1440 | 18 of 18 rows carry a number |
| `numberSpread` | 0. The numbers are a column, not a ragged gutter |
| `numberedBoxes` in the diagram | 18 of 18 boxes lead with `Q…` |
| `numberOnSecondLine` at 360 | 1. The whole first phone line belongs to the label |
| `npm run perf` at 500 items | Exports with no refusal, 2.43 MB, up from 2.42 MB because boxes are taller |

## What the tests hold

* `numbering.test.ts` proves `Q0`, `Q1`, `Q1.1`, `Q1.2.1` and that a move renumbers without touching anything else.
* `prefixes.test.ts` proves 21 enumerator forms are stripped, six wordings survive, and `1. Revenue` and
  `Revenue` produce the same key. That last one is the guard that keeps the number out of the hash.
* `markdown.test.ts` proves the written form, the missing heading, a byte-identical round trip apart from the
  version stamp, and that a token is dropped whether or not it resolves while `[TREND]` in single brackets
  survives.
* `csv.test.ts` proves the nine-column header, the values, and that both the old and the new column orders
  import.
* `diagnostics.test.ts` proves the removal list is named in full and that a clean paste reports nothing.
* `app.test.tsx` proves the paste report names the item's new number in the interface.

## Two decisions worth recording

* **The three tickets are one commit.** `markdown.ts` carries all three changes inside one function, so
  splitting them would have produced three commits that are each red on their own. The commit carries three
  `Fixes` lines, which is a deliberate departure from one commit per ticket.
* **The ticket's "now" column was approximate again.** It describes 13px panel headings and a five-column CSV;
  the live values were 11px and eight columns. Roles decided, as in phase H.

## Known gaps in this phase

* A wording that itself begins with an enumerator loses it on the next apply. The rule is "a stored number is
  always discarded", and `1. Revenue` is exactly that case. The labels in the fixtures and the samples do not
  hit it.
* The stripping rule is deliberately blunt on letters: `A. Smith owns the report` becomes `Smith owns the
  report`. The ticket accepted this because the report names every removal.

## Phase J - six-character keys (0.10.0, breaking)

| Ticket | What shipped |
| --- | --- |
| #27 | The hash is six Crockford Base32 characters and the key string carries a hyphen after the third, `A3E-B88`, everywhere a key appears. The alias mechanism is gone, and five-character keys no longer resolve anywhere |

## Commands

| Command | Result |
| --- | --- |
| `npx tsc -b` | Clean |
| `npm run build` | Clean; the bundle carries 0.10.0 |
| `npx vitest run` | 15 files, 175 tests, all passing (170 before, five added, none deleted) |
| `npm run smoke` | Four decks and four CSVs; every CSV round-trips with dashes inside the key and path columns |
| `npm run perf` | 500 items, deck 2.43 MB in 402 ms |
| `npm run probe` | 23 of 23 checks, including the new chip check |
| `npm run shots` | Tree, phone, diagram, markdown, rail, dialog and the empty state |

## The chip grew, and the row grew with it

The key string went from five characters to seven with the hyphen, so the key column in a tree row went from 64px to
82px, and the phone row's key column with it. The probe now measures `chipsOverflowing`: the number of chips whose
own text is wider than the box the row gives them. It is 0. That check exists because the first measurement showed
the chip exactly filling its column with the text already at the edge, which is the failure the plan warned about.

## What the tests hold

* `keys.test.ts` proves the dashed shape, that the first group stays three characters however long the hash is
  (`formatKey("A3EB88C9")` is `A3E-B88C9`), that all 500 keys at the cap are unique, and that the collision risk at
  six characters is under one in a thousand and lower than at five.
* `markdown.test.ts` proves `{[A3E-B88]}` is dropped whether or not it resolves, that the undashed five-character
  form is no longer a key and stays as wording, and that the old `K7M2 · Label` prefix is not stripped.
* `csv.test.ts` proves dashes in the key, the parent key and the path, and that the export still round-trips.
* `app.test.tsx` proves there is no Previous keys list and no key-change count anywhere.

## Known gaps in this phase

* The deck was not opened in PowerPoint by hand for this phase. The smoke run writes it at 500 items without error,
  and the byte sizes moved by about a hundred bytes, which is the wider key text.
* Five-character keys, and the files that carry them, are refused rather than migrated. That is the decision.
