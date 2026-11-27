# Implementation plan: nine tickets, five phases

The tracked work lives in the GitHub issues, #28 and #30 to #38. Each issue body holds its decisions and the
reasoning behind them, including the answers given while grilling. This file holds the sequence: what order
the work goes in, what proves each ticket, and what each phase must show before it is pushed.

Nothing here restates an issue. If a decision is missing, the issue is the place to write it, not this file.

## Phase table

| Phase | Tickets | Theme | Version | Push |
| --- | --- | --- | --- | --- |
| 1 | #35, #36, #37, #38 | The panel diet | 0.11.0 | once |
| 2 | #30, #34 | The tree's frame | 0.11.1 | once |
| 3 | #32, #33 | The diagram's controls | 0.11.2 | once |
| 4 | #31 | The diagram's geometry | 0.11.3 | once |
| 5 | #28 | Item order | 0.11.4 | once |

Within a phase, one commit per ticket, each carrying its own `Fixes #N`. All commits for the phase push
together, once the phase is green. A phase is a release.

## Order rule

The dependency chain, and nothing else:

```
#37                 ->  #36                 the MECE flags go before the review that reads them
#32                 ->  #33                 a click cannot be tested while pointer capture swallows it
#30, #34            ->  #31                 the frame settles before the geometry inside it is re-measured
#35, #36, #37, #38  ->  nothing else        four changes to one panel, and one file
#28                 ->  last                p3, and the only ticket whose intent was never written down
```

Phase 1 carries four tickets because all four change the Details panel and three of them remove sections from
it. Splitting them means screenshotting one panel four times and resolving four conflicts in one file.

## Definition of done, every phase

1. `npm test` green. The count may fall in a phase that removes features, and only then: the fall is recorded
   in the commit with its arithmetic. A phase that removes tests silently is wrong.
2. `npm run build` clean. This proves an identifier removal is complete, because TypeScript fails on a stale
   reference. It does not prove anything about `scripts/`, which it does not check.
3. `npm run smoke` regenerates `artifacts/` with no errors, and the CSV round trip still holds.
4. `npm run probe` prints the phase's numbers and they match the issue.
5. `npm run shots` writes the phase's PNGs, committed as `ticket-*.png` and referenced from the issues they
   prove.
6. `npm run perf` recorded when the phase touches the layout or the deck.
7. The CHANGELOG gains an entry. For a breaking change it says so in the first line.
8. Push once. The Pages run is green, the live URL answers 200, and the bundle shows the new version, before
   the phase's issues are closed.

## What this cycle learned to check differently

1. **A check that a control exists is not a check that it does anything.** 0.10.4's probe asserted that the
   diagram's fold controls were present and inside the SVG, and passed while they were dead, because
   `setPointerCapture` on the canvas retargeted every click away from them. Every check for #32, #33 and #34
   clicks its target with real input events and asserts the effect.
2. **A reported number gets a reproduction before it gets an issue.** Four of this cycle's eight reports were
   not what they first appeared to be: the diagram text was truncated rather than overflowing its box, the
   Tree's expand and collapse controls were broken rather than merely unwanted, and the "dead" Paste outline
   opened the import dialog.
3. **The probe is not typechecked by the build.** `tsc -b` reports success for `scripts/probe.ts`, so a syntax
   error there appears only when it runs. The probe gate is load-bearing, not a formality.

## What proves each ticket

| Ticket | New tests | Numbers or pictures | Manual |
| --- | --- | --- | --- |
| #35 the panel in two views | `app.test.tsx`: the panel's absence, the `no-panel` class, Ctrl+backslash outside Tree | probe: no panel in either view and the workspace fills the body; shots of both views | - |
| #36 the MECE review | `app.test.tsx`: no MECE section, and Checks still renders | probe stays at 66 of 66 | - |
| #37 note, label and status | `tree.test.ts`: the drop and an untouched document returned as it was; `storage.test.ts`: the load path; `apply.test.ts`: identity kept and status from the outline; `app.test.tsx`: the panel and the row | - | a document saved before 0.11.0 loads |
| #38 the budget meter | `app.test.tsx`: two headings, named | probe: two sections, no meter, headings printing as `Key|Checks` | - |
| #30 the wheel | `app.test.tsx`: the rule | probe: a real wheel over the field scrolls the tree | - |
| #34 the heading row | `app.test.tsx`: one row, no controls | probe: the four left edges; shots | - |
| #32 the fold click | `app.test.tsx`: shared state | probe: real clicks change the box count, and a pan still tracks | fold while zoomed |
| #33 the checkbox | `app.test.tsx`: the toggle and the complete class | probe: a click changes the status, a box click does not | a real phone |
| #31 the box height | `layout.test.ts`: no box shorter than its own text | probe: zero overflowing boxes at three tree sizes; `perf` | a deck in PowerPoint |
| #28 item order | `project.test.ts`: a root id that is all digits | `smoke`: the slide count at 500 items | - |

## Phase detail

### Phase 1 - The panel diet (0.11.0, breaking)

Order: #35, #36, #37, #38. Done: commits c3f2c72, 3eee3ff, 4716341, 4a2ca0a.

1. #35 render the panel only in Tree view, add the `no-panel` grid class, and follow with Ctrl+backslash and
   the phone's Details button.
2. #36 remove the MECE self-check, the AI review box, Selected split and MECE check, and delete
   `src/model/mece.ts` with its tests.
3. #37 remove the Note field and the Label and Status editors, and delete `note` and the MECE flags from the
   model, the import path and the store. Add `dropRetiredFields` and call it from `getDoc`, so a document
   saved earlier still loads.
4. #38 remove the Item budget section, its meter and its four CSS rules.

Watched for, and it mattered: `quality.ts`'s `MECE_UNCONFIRMED` finding reads the flags, so it went in #37
rather than staying behind as a broken check. `apply.ts` preserves both fields, so it changed too. The probe's
`scroll` case needed a document whose findings still overflow the panel, because 120 similar siblings now
group into one.

### Phase 2 - The tree's frame (0.11.1)

Order: #30, then #34, because both rebuild the row and its heading row.

1. #30 stop the row's label field being user-scrollable, so the wheel chains to the tree. The import and paste
   box keeps its own scrolling.
2. #34 move the four column labels into the heading row and remove the expand, collapse and paste controls.

Watch for: the heading row's column widths must match the row's. `Collapse all` is broken for a two-level
tree, which is why it is removed here rather than fixed: it collapses the root's children, and collapsing a row
hides its descendants, so a root with branches and no grandchildren hides nothing.

### Phase 3 - The diagram's controls (0.11.2)

Order: #32, then #33, because #33 cannot be tested while clicks are swallowed.

1. #32 capture the pointer only once a drag passes its threshold, so a click reaches the SVG.
2. #33 give the status marker a painted hit area of at least 44px, toggle status on a click, leave a box click
   doing nothing, and give both controls focus, Enter and Space.

Watch for: the pan must still track when the pointer leaves the canvas, which is what the capture was for. The
marker for an open item is `fill: none` today, so it is not hit-testable at all.

### Phase 4 - The diagram's geometry (0.11.3)

1. #31 let the layout's height be what the packed rows need, and let the SVG scale it to fit.
2. Re-measure at 15, 121 and 500 items, and record `perf`.

Watch for: the deck shares the layout maths and may change. View state must not reach the export, and one
exported deck is opened in PowerPoint, because a moved box is not something a check can judge.

### Phase 5 - Item order (0.11.4)

1. #28 build the item map by walking the tree, and read that order in the CSV and the slide packing.
2. Test with a root id that is all digits, which is the input that makes JavaScript reorder object keys.

## Cross-ticket constraints

- Folding, zoom and pan are view state and never reach the export.
- The item map's order is tree preorder, everywhere.
- `Checks` stays, with the grouping and the 50-finding bound from 0.10.7.
- The key format, the nine CSV columns and the markdown round trip do not change in this cycle.

## Human verification, once each

| Check | Ticket |
| --- | --- |
| A document saved before 0.11.0 loads, with notes dropped | #37 |
| One exported deck opens in PowerPoint, every item present | #31 |
| A real phone: pinch, two-finger pan, the footer wrap | #33 |
| Folding and unfolding while zoomed | #32 |
