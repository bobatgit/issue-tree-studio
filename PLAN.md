# Implementation plan: fifteen tickets, six phases

The tracked work lives in the GitHub issues, #12 to #26. The issue bodies hold the decisions and the
reasoning behind them. This file holds the sequence: what order the work goes in, what proves each
ticket, and what each phase must show before it is pushed.

Nothing here restates an issue. If a decision is missing, the issue is the place to write it, not this file.

## Phase table

| Phase | Tickets | Theme | Version | Push |
| --- | --- | --- | --- | --- |
| 1 | #18, #26 | Vocabulary and the settings dialog | 0.8.0 | once |
| 2 | #17, #19 | Type scale and the history glyph | 0.8.1 | once |
| 3 | #12, #13, #14 | The numbering spine | 0.9.0 | once |
| 4 | #27 | Six-character keys | 0.10.0 | once |
| 5 | #15, #16, #24, #25 | The list and the frame | 0.10.1 | once |
| 6 | #20, #21, #23 | The diagram canvas | 0.10.2 | once |
| 7 | #22 | Folding in the diagram | 0.10.3 | once |

Within a phase, one commit per ticket, each carrying its own `Fixes #N`. All commits for the phase push
together, once the phase is green. A phase is a release.

## Order rule

The dependency chain, and nothing else:

```
#18  ->  every later ticket        the vocabulary all new code is written in
#17  ->  #15, #16, #25             layout is tuned against the final type scale
#27  ->  #15, #16, #24, #25       the row and box geometry is tuned around the chip's width
#12  ->  #13  ->  #14              atomic; the markdown round trip needs all three
#24  ->  #25                       the footer shares the inset
#21  ->  #22                       folding sits inside the zoomable canvas
#20  ->  #21                       #20 is measured at the zoom levels #21 introduces
```

Phase 4 carries four tickets because all four are chrome, none of them touches the model, and splitting
them means screenshotting the same three views three times.

## Definition of done, every phase

1. `npm test` green, and the test count only grows. A phase that removes tests is wrong.
2. `npm run build` clean. This also proves an identifier rename is complete, because TypeScript fails on a
   stale reference.
3. `npm run smoke` regenerates `artifacts/` with no errors, and the CSV round trip still holds.
4. `npm run probe` prints the phase's numbers and they match the issue.
5. `npm run shots` writes the phase's PNGs, and each one is attached to the issue it proves.
6. `npm run perf` recorded when the phase touches the layout or the deck, so a regression is a number
   rather than an impression.
7. The CHANGELOG gains an entry. For a breaking change it says so in the first line.
8. Push once. The Pages run is green, the live URL answers 200, and the bundle shows the new version.

## Test kinds

| Kind | Command | What it proves | Cannot prove |
| --- | --- | --- | --- |
| Unit | `npm test`, `src/test/*.test.ts` | Model logic: numbering, keys, markdown, CSV, tree, layout, quality, apply, diff | anything rendered |
| Component | `npm test` under jsdom, `app.test.tsx` | Rendered behaviour: rows, headings, dialogs, footers, clicks, aria labels | size, colour, position |
| Smoke | `npm run smoke` | Real `.pptx` and `.csv` files, the CSV round trip, item counts | layout |
| Perf | `npm run perf` | Timings and the deck's slide count at 500 items | correctness |
| Probe | `npm run probe` | Computed metrics: font size, left edge, stroke width, SVG size | intent |
| Shots | `npm run shots` | PNG evidence attached to an issue | anything precise |
| Manual | a person | PowerPoint, a real phone | repeatability |

Four tickets in this batch are measurable rather than unit-testable: #20 is a stroke width, #17 is a font
size, #24 is a left edge, and #25 is a footer height and wrap. Those are the probe's job.

## The two visual tools, new in this batch

Both are local only. CI has no browser, so neither runs in the workflow.

| File | Job |
| --- | --- |
| `scripts/probe.ts` | Connects over CDP, seeds the fixture, switches to a named view, and prints JSON metrics for named selectors: computed style, bounding box, and any derived number such as a stroke's visible thickness. |
| `scripts/shots.ts` | Same connection and seed, writes PNGs into `docs/screenshots/`. |
| `scripts/fixtures.ts` | One seeded document shared by both, so a screenshot from phase 6 is comparable with one from phase 4. |

Setup is two commands, documented in each script's header:

1. `npm run dev` for the served app.
2. A headless browser with remote debugging on port 9222, for example `msedge --headless=new
   --remote-debugging-port=9222 --user-data-dir=<temp>`.

Both scripts fail with that instruction when either is missing, rather than hanging.

## What proves each ticket

| Ticket | New tests | Extends | Numbers or pictures | Manual |
| --- | --- | --- | --- | --- |
| #12 numbering | `numbering.test.ts`: Q0, Q1, Q2.4, Q2.4.1, renumber on move, folds ignored | `csv`, `markdown`, `layout`, `app` | probe: the number column, the box first line | a deck at 500 items |
| #13 prefixes | `prefixes.test.ts`: each form, the conservative cases, the report | `markdown`, `apply`, `app` | shots: the report | - |
| #14 markdown key | - | `markdown`, `apply`, `app` | shots: markdown, three levels | - |
| #15 levels | `tree.test.ts`: the subtree count for the hidden badge | `app`, `layout` | probe: indent step, the three arrow states; shots | - |
| #16 headings | - | `app`: the four words, absent when empty, outside the tree role | probe: the four left edges | - |
| #17 type scale | - | - | probe: computed sizes; shots at 1440 and 360 | - |
| #18 rename | `vocabulary.test.ts`: no `node` token in `src/` outside comments | `project`, `app` | shots: every screen once | - |
| #19 icon | - | `app`: the rail button's aria label and its glyph | shots: the rail | - |
| #20 hover | - | - | probe: visible stroke at 25, 100 and 400 percent | thickness by eye |
| #21 zoom | - | `app`: clamping, Fit, sessionStorage; `layout` | probe: the SVG size at 100 and 400 percent | pinch on a phone |
| #22 diagram fold | `layout.test.ts`: a folded branch leaves the layout | `app`: shared state, the legend count | shots: a folded diagram | fold while zoomed |
| #23 marker | `marker.test.ts`: one spec for screen and deck | `app`, smoke | shots: complete beside open | PowerPoint |
| #24 inset | - | - | probe: the legend, the box and the plan head against the row's 16px | - |
| #25 footer | - | `app`: three footers, the stamp position, the count under folds | probe: left edge, height, wrap at 360 | - |
| #26 settings | - | `app`: no key table, no resolver, the new subtitle | shots: the dialog | - |

## Phase detail

### Phase 1 - Vocabulary and the settings dialog (0.8.0)

Order inside the phase: #18 first, because it touches every file, then #26, which deletes what #18 has
just renamed.

#18

1. Rename the identifiers: `TreeNode`, `FlatNode`, `NodeStatus`, `NodeKey`, `nodeCount`, `NODE_CAP`,
   `byNode`, `nodeId`, and local names.
2. Rename every user-facing string, including the empty state, the toasts, the quality messages and the
   diagnostics text.
3. Rename the stored field `nodes` to `items` in the project export, the version snapshots and the tab
   store, with no fallback.
4. Make the tab store treat a shape it cannot read as an empty tab, never an exception.
5. Add `src/test/vocabulary.test.ts` and extend `project.test.ts` with a file carrying `nodes` that must
   import empty rather than throw.
6. Bump to 0.8.0 and write the breaking-change line into the CHANGELOG.

#26

1. Delete the Keys section from the settings dialog and delete `KeyPanel`.
2. Fix the dialog subtitle.
3. Move the rule sentence into the Details panel, corrected to five characters.
4. Extend `app.test.tsx`: the dialog shows Display and Slides, with no table, no resolver, and the new
   subtitle.

Gates: tests, build, probe on the settings dialog and a toast, shots of the dialog, the Tree and Details.
Watch for: the guard test firing on a word that should have been renamed, which is the point of it.

### Phase 2 - Type scale and the history glyph (0.8.1)

Order: #17 then #19, because the type scale moves every measurement and the probe baseline should be taken
once, at the end of the phase.

#17

1. Apply the size table from the issue.
2. Re-check the three-line wrap, the row height, the drag thirds and the phone layout at 360.

#19

1. Replace the rotation glyph with a clock, drawn inline with `currentColor`.
2. Keep the aria label and the tooltip.

Gates: probe recording the computed sizes at 1440 and at 360, and the rail button's contents. Shots of the
Tree, the Diagram, the Markdown view, the collapsed rail and the phone.
Watch for: clipping in a row where the type grew but the row did not, and the drop thirds drifting.

### Phase 3 - The numbering spine (0.9.0)

Three tickets that must land together. The markdown round trip only passes when the number is written, the
pasted number is stripped, and the key sits at the end.

Order: #12, then #13, then #14.

#12

1. Add a pure numbering module: depth 1 is `Q0`, depth 2 is `Q` plus the sibling index, deeper levels
   append a dot and the index.
2. Show it in the Tree as a column, in a diagram box as its own first line, and in a deck box the same way.
3. Change the CSV to nine columns, `number` first and `label` second, and prove the importer reads both the
   old and the new order.
4. Test renumbering on a move, and that a fold changes nothing.
5. Add the test that `1. Revenue` and `Revenue` produce the same key, which is the guard against the number
   entering the hash.

#13

1. Strip the recognised enumerators on import and on apply, including letters and roman numerals.
2. Keep the conservative cases: digits with no separator, a bracket in the middle, and a leading word.
3. Report each removal with the new number, and stay silent when nothing was removed.

#14

1. Write the key as `{[KEY]}` at the end, drop the heading, and put `Q0` on the root line.
2. Read a trailing token by shape alone and drop it whether or not it resolves.
3. Keep reading the shipped prefix form for files written before this change.

Gates: tests, smoke, perf recording the slide count at 500 items, probe on the number column and the box's
first line, shots of the Tree, the Markdown view, the Diagram and a phone row.

Watch for:

- The number leaking into the hash. If a version snapshot changes in this phase, something is wrong, because
  the number is never stored.
- The deck growing because every box gained a line. Exporting must still never refuse at 500 items.

### Phase 4 - Six-character keys (0.10.0)

The batch's third breaking change, and the only one that touches every artifact at once.

1. The hash becomes six Crockford Base32 characters, and the key string carries a hyphen after the third:
   `A3E-B88`. Six characters hold 1,073,741,824 values, so a real collision at the 500-item cap is about 0.012
   percent, against 0.37 percent at five.
2. The dash goes into the CSV `key`, `parent_key` and `path` columns, the markdown token `{[A3E-B88]}`, the row
   chip, the diagram box, the Details panel, the deck and the clipboard. Nothing strips it and nothing adds it.
3. A real collision promotes deterministically, ordered by digest, and the second group extends: `A3E-B88C`. The
   first group is always three characters, so "say the first three" keeps working.
4. The alias mechanism goes: the records, the Previous keys list, the key-change count in History, the `aliases`
   field in the stored document, and the `KeyAlias` type. An old key no longer resolves anywhere.
5. The reader stops accepting the old `K7M2 · Label` prefix, and every string that says five characters, or that
   explains a four-to-five promotion, is corrected.
6. The markdown token shape becomes three characters, a hyphen, then three or more.

Gates: tests, build, smoke with every CSV round-tripping with dashes in the key and path columns, perf at 500
items, probe on the chip width and the diagram box, shots of a row, the diagram and the deck, and a manual pass on
the deck.

Watch for: the chip is wider, so the row's key column and the diagram box's key text both need re-measuring. That
is why this phase lands before the layout work rather than after it.

### Phase 5 - The list and the frame (0.10.1)

Four chrome tickets, one visual pass. Order: #15, then #16, then #24, then #25.

1. #15: elbows and rails, the widened indent step, three arrow states, and the hidden count as a subtree
   size.
2. #16: the four column headings over the anatomy #15 just settled.
3. #24: the 16px inset for the Diagram view, and the two labels brought to one treatment.
4. #25: one footer in every view, the build stamp moved into it, and the count as `12 of 47 items` when
   branches are folded.

Gates: tests, probe recording the indent step, the hidden count, the four heading left edges, the footer
left edge, the footer height, and the footer's wrap at 360. Shots of the Tree, the Diagram and the Markdown
view at 1440 and 360, plus a folded row.

Watch for: the four tickets sharing one stylesheet, so a change for the footer moving a heading. The phase-2
probe numbers are the reference.

### Phase 6 - The diagram canvas (0.10.2)

Order: #20, then #21, then #23.

1. #20: move all three box outlines into CSS classes in user units, and delete the inline stroke from the
   component.
2. #21: the zoom and pan state, the toolbar, Ctrl and the wheel, drag, pinch, and two-finger pan.
3. #23: one shared marker module, used by the screen and by the deck, with the tick as a shape rather than
   a text glyph.

Gates: tests, smoke, probe measuring the hover stroke's visible thickness at 25, 100 and 400 percent, and
the SVG size at 100 and 400. Shots of a hovered box, a zoomed canvas and two status markers side by side.
Manual: open the deck in PowerPoint and confirm the tick is two editable shapes.

Watch for: the hover fix only being correct at Fit. The stroke is in user units, so it must be measured at
each zoom level.

### Phase 7 - Folding in the diagram (0.10.3)

One ticket, because it is the most interactive change in the batch and it sits on the canvas from phase 5
and the fold state from phase 4.

1. Share the Tree view's folded set, and draw the chevron on the connector rather than in the box.
2. Remove a folded branch from the layout with its edges, so the space closes.
3. Count the legend's leaves from what is visible.

Gates: tests, probe on the legend count and the chevron's three states, shots of a folded diagram, and a
manual pass folding while zoomed.

Watch for: a pan drag being read as a chevron click. They are different targets and must stay that way.

## Cross-ticket constraints

- #12 and #13 must ship in one push. The round trip is the acceptance test for both.
- The number is never stored. A version snapshot change in phase 3 is a defect.
- The first four CSV columns never move again after phase 3.
- Folding never changes the deck.
- The key name is `key` in the CSV, the heading, the Details panel and the quality messages. Only the
  explanation of hashing uses the word hash.

## Human verification, once each

| Check | Ticket |
| --- | --- |
| A deck at 500 items opens in PowerPoint and contains every item | #12 |
| The tick is two editable shapes, a rounded rectangle and a line | #23 |
| A real phone: pinch, two-finger pan, the footer wrap, and `Q1.1 - 2GK88` on the row's second line | #21, #25, #12 |
| The hover outline measures 2 to 4 px at 25 percent and at 400 percent | #20 |

## Accepted trade-offs, recorded so they are not rediscovered as defects

1. **`nodes` becomes `items` with no fallback.** A project file exported before 0.8.0 stops importing, and a
   tab open during the deploy comes up empty. Deliberate.
2. **The key is written as `{[KEY]}`.** Braces are meaningful to MDX and to Pandoc. The destinations are
   Word, Notion, GitHub and PowerPoint, where they are plain text.

## Goal creation order

The seven phases are tracked as the ordered task tree of one Sisyphus goal. Each phase task names its tickets
and the gate it must pass, and refers to the issue for the detail rather than repeating it. A phase task is
completed only once its own tickets are, and the phase's push has produced a green deploy.
