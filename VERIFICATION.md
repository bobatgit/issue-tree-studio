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

## Phase K - the list and the frame (0.10.1)

Four tickets in one visual pass, because three of them move the same row and the fourth is the frame around it.

| Ticket | What shipped |
| --- | --- |
| #15 | Box-drawing elbows and rails at a 22px step in one colour, a drawn arrow with three states, and a folded branch counting every item inside it |
| #16 | `Item no. / Item / Key / Status` over their columns to the pixel, sticky, outside the tree role, hidden on a phone |
| #24 | The Diagram view inset to 16px like the Tree view, and its legend brought to the section label's treatment |
| #25 | One footer in every view, carrying the view's state and the build, with the duplicated counts removed |

## Commands

| Command | Result |
| --- | --- |
| `npx tsc -b` | Clean |
| `npm run build` | Clean; the bundle carries 0.10.1 |
| `npx vitest run` | 15 files, 180 tests, all passing (170 before the phase, ten added, none deleted) |
| `npm run smoke` | Four decks and four CSVs, every CSV round-trips |
| `npm run perf` | 500 items, exporting without refusal |
| `npm run probe` | 40 of 40 checks |
| `npm run shots` | Tree at both widths, folded, Markdown, Diagram, rail, dialog, empty state and the three footers |

## What the measurements caught

* **The elbow column sat in the grip's column.** The row's grid gave the grip 20px and the elbow cell `auto`, but the
  elbow cell came first in the document, so the two were swapped and the item column started ten pixels early. The
  heading alignment measurement found it: `labelOffset` was `-10` before the fix and `0` after.
* **The status heading could not be centred over its column** while the status box sat at the column's start. The box
  is now centred, and the offset is 0.
* **Two of my own checks pointed at metrics that were never measured.** `paddingLeft` was not in the probe's metric
  set, and the footer was not in the selector list of the cases that asserted about it. Both are fixed, which is why
  the probe has 40 checks rather than the 37 it had.
* **The vocabulary guard caught my own new code.** `ReactNode` contains the word the guard forbids. The component now
  takes `PropsWithChildren`, and the guard did exactly what it was written for.

## Decisions worth recording

* **#16 forced a row change.** The ticket's column order is number, item, key, status, but the row rendered the status
  box before the key chip. The two swapped, with the widths, so the headings sit over the columns they name.
* **The tree case folds a second-level branch, not the root.** Folding the root leaves one row on screen, which made
  the first version of the elbow and slot counts assert `0` against `17`. The counts moved to the unfolded case and
  the folded case now folds a branch that leaves the rest of the tree visible.

## Known gaps in this phase

* The heading row's stickiness is asserted as a computed `position: sticky`, not by scrolling. A visual check at
  200 items would be better.
* Nothing was opened in PowerPoint by hand, and the rails add drawn elements to every row, so the merged view at 500
  items has not been looked at.

## Phase L - the diagram canvas (0.10.2)

The three tickets that make a large tree readable on screen, and that give the screen and the slide one idea of
what a finished item looks like.

| Ticket | What shipped |
| --- | --- |
| #20 | All three box outlines moved into CSS in user units, so the hover band went from 165.75px to 1.61px, and a hovered and selected box keeps the selected treatment |
| #21 | Zoom and pan: control and the wheel about the pointer, drag to pan, pinch and two-finger pan, a toolbar and a keyboard, 25 to 400 percent, starting at Fit and remembered per tab |
| #23 | One shared marker module: a rounded square with a tick when complete, drawn as SVG on screen and as editable shapes in the deck |

## Commands

| Command | Result |
| --- | --- |
| `npx tsc -b` | Clean |
| `npm run build` | Clean; the bundle carries 0.10.2 |
| `npx vitest run` | 15 files, 192 tests, all passing (180 before the phase, twelve added, none deleted) |
| `npm run smoke` | Four decks and four CSVs; the marker warnings the first attempt produced are gone |
| `npm run perf` | 500 items, exporting without refusal |
| `npm run probe` | 49 of 49 checks |
| `npm run shots` | The canvas at 400 percent, a complete marker beside an open one, and the earlier views |

## What the measurements and the smoke run caught

* **A stale level.** Twelve rapid clicks on the zoom's plus button advanced the level by one step, because every
  handler read the level from its render and React batched them. The probe measured `zoomLevel 125` where it
  expected 400. The level now lives in a ref as well as in state, which also stopped the wheel listener
  re-attaching on every zoom.
* **A stylesheet that was not loaded.** The fit measurement treated a missing padding as `NaN`, so the canvas had
  no size at all. A missing length now counts as zero.
* **A silent black fill.** The deck's open marker was passed `"none"` as a fill colour, which the library rejects
  and replaces with black, one warning per marker. It is filled with the box it sits on instead.
* **The reason to pause #20's acceptance.** Its readings for resting and hover were both 1.61px, so the measurement
  could not yet tell the two states apart. The acceptance spans zoom levels, and zoom did not exist yet. With #21
  in place the same probe runs at 100 and 400 percent, and the checks now distinguish a fitted canvas from a
  zoomed one.

## Known gaps in this phase

* Pinch and two-finger pan are implemented but have not been exercised on real touch hardware. The ticket says so
  itself: the desktop pass cannot test them.
* Nothing has been opened in PowerPoint by hand. The deck writes editable shapes, and the smoke run confirms the
  file is produced at 500 items, but the marker as it appears in PowerPoint is unverified.
* Panning at 500 items is not measured. The ticket asks for that to be reported rather than pre-emptively
  optimised.

## Phase M - folding in the diagram (0.10.3)

| Ticket | What shipped |
| --- | --- |
| #22 | The Diagram folds on the Tree's folded set, with a chevron on the outgoing connector, a layout that closes the gap, and the hidden count on the folded box |

## Commands

| Command | Result |
| --- | --- |
| `npx tsc -b` | Clean |
| `npm run build` | Clean; the bundle carries 0.10.3 |
| `npx vitest run` | 16 files, 196 tests, all passing (192 before, four added, none deleted) |
| `npm run smoke` | Four decks and four CSVs; the deck byte sizes are **identical** to the phase before, which is what "folding must not change the deck" means |
| `npm run probe` | 51 of 51 checks, including a folded branch leaving 12 of 18 boxes in the layout and reporting 6 hidden |
| `npm run shots` | A folded diagram, and the earlier views |

## What the measurements caught

* **The legend's meaning.** My first expectation was that folding a branch leaves one leaf row. It leaves two: a
  folded branch has no visible children, so its own row is a leaf row now. That is the honest reading of "leaf
  rows", and the test records it rather than the number I first guessed.
* **A test that depended on tree order.** The probe's fold clicked the first chevron in the document, which is the
  root's, so it hid the whole tree. It now selects the chevron by its name. This is the same class of fragility
  that issue #28 is about.

## The batch, closed

Fifteen filed issues, plus #27 which the user filed during the batch, delivered across seven phases and seven
releases: 0.8.0, 0.8.1, 0.9.0, 0.10.0, 0.10.1, 0.10.2, 0.10.3. Sixteen test files and 196 tests, from eleven files
and 107 tests at the start. Every phase deployed, and the probe suite runs against the deployed bundle as well as
against a local server.

Two things remain open, both recorded and neither blocking: **#28**, the item map's order not being the tree's
order, which the slide packing reads; and the human checks this batch cannot perform for itself, which are the
exported deck in PowerPoint, pinch and two-finger pan on real touch hardware, and the diagram at 500 items.

## 0.10.4 - the fold controls, after the production probe

The probe suite runs against the deployed bundle as well as against a local server, and that is the only reason
this was caught. Locally the fold controls were found by their accessible name and took a click, so the fold
measured correctly. In the deployed bundle the same query found nothing and the fold did not happen. The controls
were children of the canvas wrapper rather than of the SVG: React created the elements either way, and a local
click reached the handler, but they were never drawn and the difference only showed in the built bundle.

Two lessons worth keeping. A measurement that passes locally is not evidence about the deployed artifact, which is
why the gate has both. And a `grep` pipeline over a build hides its failure: an earlier push in this phase went out
with `tsc` failing because the pipeline swallowed the error and the shell continued past it. Exit codes are checked
directly now.

## 0.10.5 - the list did not scroll

Reported by the user: with many items on screen there was no way to scroll. The probe reproduced it and named the
cause in one run. `.editor-scroll` measured 5,963px tall, taller than the window, with `scrollHeight` equal to
`clientHeight`, so it had no overflow of its own and `overflow: auto` never engaged. A grid item's `min-height`
defaults to `auto`, and `.workspace` is a grid item of `.body`, so the left column grew to its content while the
right column, which already carried `min-height: 0`, scrolled correctly. `body { overflow: hidden }` clipped the
overflow and no scrollbar appeared.

The chain now carries the heights it needs, and the check that guards it scrolls each container rather than reading
its `overflow` property, because reading the property would have passed all along.

The same measurement found a second fault that is not this bug and is not fixed here: the panel reports 1,690,558px
of content, because the quality review emits one "Siblings may overlap" finding per pair of siblings, so the first
finding sits 278,383px down the panel with 120 items. That is filed separately.

## 0.10.6 - a class name collision in the collapsed panel

Reported by the user: the collapsed Details and History panel drew a straight line over the Export button, outside the
Tree's column. Two elements were both called `.rail`: the Tree's connector lines, added in phase 5, and the collapsed
panel's container, which is older. Both rules applied to the panel's container, and the Tree's
`position: absolute; width: 1px; background: var(--border-strong)` turned it into a hairline placed against its nearest
positioned ancestor. The panel's class is `.panel-rail` now.

The check was written to fail first and it did: the element measured `1x900` at `x=1397`, `railIsAbsolute` 1,
`railOverlapsBar` 1, `railWidth` 1. Only then was the class renamed, and the same three checks pass.

The reason nothing caught it in five phases of shots is worth recording: no shot after phase 5 appeared the collapsed
panel. The rail was photographed once, for #19, before the collision existed. There is a standing gate shot of the
collapsed rail now, so the state is in every run.

## 0.10.6, corrected - the two production failures were one problem

The collapsed panel's rail failed its production checks while passing locally, exactly as the fold controls had
three releases earlier. The cause was the same in both cases: the probe drove the deployed site through its normal
address, which the browser is free to serve from cache, and a cached document points at the previous bundle. The
version check was cache-busted and the navigation was not, so the two disagreed and the disagreement looked like a
deployed bug.

`Page.open` now appends a cache-buster to the address it navigates to, and with that the production run passes
57 of 57. Two things follow. The rail fix was live as soon as it deployed, and the fold-controls failure three
releases earlier was probably this same cache rather than the nesting, which the 0.10.4 changelog entry claimed as
the root cause. That entry is corrected here and in the changelog.

The general lesson, which this batch has now taught twice: a local pass is not evidence about the deployed artifact,
and a check that runs against production is worthless if it can be served something old.

## 0.10.7 - the panel that grew by a million pixels

Filed as #29 after the scrolling fix, because a measurement taken then showed the Details panel's content at
1,690,558px with the first quality finding 278,383px down it. The cause turned out to be two instances of one
mistake, in two different analyses: each reported one result per **pair** of siblings, and the panel rendered every
result. The quality check gave 6,786 findings for 117 similar siblings; the MECE review of a split gave 6,903
suggestions, each drawn as a block in the Selected split section. The findings were 733,000px of the panel and the
suggestions 680,000px, which is why fixing either alone left roughly a million.

Both now report one result per kind for the whole group, naming how many branches are involved and giving two
examples. The panel measures **2,375px**, and the section that held 6,935 blocks holds 6.

The measurement that found it is worth keeping in mind: the model had no pairwise loop left after the first fix, so
the remaining height could not be the findings, and the instrument that resolved it was asking the page to name the
tallest element it contained rather than reasoning about which one it might be. Two of my guesses about where the
height came from were wrong before that.

The list is bounded at fifty with a `Show all` control, and the counts above it are counted over every finding, so a
bounded list hides none of them. A probe case loads 120 items and asserts the panel stays under a bound, which would
fail if either analysis went back to reporting pairs.
