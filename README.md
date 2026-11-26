# Issue Tree Studio

A single-page application that turns any markdown nested list into an issue tree, gives every item a short
content-hash key, and exports the result as an editable PowerPoint, a CSV table, a markdown outline or a
project file.

Everything runs in the browser. There is no backend, no account and no upload.

Live site: **https://bobatgit.github.io/issue-tree-studio/** · source: **https://github.com/bobatgit/issue-tree-studio**

---

## Quick start

```
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check plus production build into dist/
npm test           # 88 unit and render tests
npm run smoke      # writes real .pptx and .csv files into artifacts/
npm run probe      # computed layout metrics read out of a real browser
npm run shots      # screenshots of every view into docs/screenshots/
```

`npm run probe` and `npm run shots` are local only: they need `npm run dev` running and a headless browser
with remote debugging on port 9222. CI has no browser, so it never runs them. Both print the setup command
when either part is missing.

```
msedge --headless=new --remote-debugging-port=9222 --user-data-dir=temp/edge-cdp about:blank
```

Requirements: Node 20 or newer. Tested on Node 22 and Windows 11.

---

## 1. The key scheme

Every item carries a key such as `K7M2`.

```
normalise(label)                     "  Why did PRICE fall? "  ->  "why did price fall?"
path = ancestors + self              "why did profit fall? \u001f revenue fell? \u001f price fell?"
digest = SHA-256(utf8(path))         e3 5c 1b ...
key = Crockford Base32(digest)[0..4] K7M2
```

* **Crockford Base32** uses the alphabet `0-9 A-Z` without `I`, `L`, `O` and `U`, so a key survives being
  read aloud, copied by hand or typed from a screenshot.
* **Five characters** give 33,554,432 values. At the hard cap of 500 items the chance that any two items share
  a key is 0.37 percent (birthday bound: `n(n-1) / 2 / 32^5`).
* **Path scope** means the same wording under two different parents gets two different keys, and a sibling
  reorder never changes a key.
* **Editing changes keys.** Change a label and that item plus all of its descendants get new keys, because
  their path changed. The old key is kept as an alias, so `K7M2` still resolves and reports "now `B8YVN`".
* **A real collision is never silent.** If two items truncate to the same five characters, the item with the
  larger full digest is promoted to five characters (then six, if needed). Promotion is ordered by digest, so
  it is stable across reorders and reloads. The quality panel and the item inspector mark promoted keys.
* **Duplicate wording on the same path** (two siblings both called "Other") gets an ordinal mixed into the
  digest, so both keep a four-character key and the quality panel flags the duplication.

Nothing is abbreviated by hand: the whole item wording takes part in the hash, after normalisation that
ignores case, spacing, typographic dashes and curly quotes.

---

## 2. Getting content in

### Markdown nested list

Paste it or drop a `.md` / `.txt` file. The importer accepts:

```
- Root question?
  - Branch?
    - Leaf?
```

* Bullets may be `-`, `*` or `+`; numbered lists (`1.` or `1)`) work too.
* Indentation may be spaces or tabs; skipped levels are fine.
* A wrapped continuation line is joined onto the previous item.
* Inline decoration is removed: `**bold**`, `_italic_`, `` `code` ``, `[text](url)` and HTML tags.
* One top-level item becomes the root. Several top-level items get a shared root named after the first
  heading, and the import warns about it.
* The first 500 items are kept and the rest are dropped with a warning.

### CSV

Header names are matched loosely, so `key`/`id`, `parent_key`/`parent`, `label`/`text` all work.
Rows are attached by parent reference. Unknown parents are attached to the top level and reported.

### Project JSON

The full project file (tree, settings, MECE flags, key aliases and every stored version) imports as a new
tree.

Any import opens as a **new** tree, so the current one is never overwritten.

---

## 3. Editing

| Action | Mouse | Keyboard |
| --- | --- | --- |
| Add sibling | `⏎` button | `Enter` |
| Add child | `+` button | `Ctrl+Enter` |
| Indent (become a child of the previous sibling) | drag | `Tab` |
| Outdent | drag | `Shift+Tab` |
| Delete item and its subtree | `×` button | `Backspace` on an empty label |
| Reorder / reparent | drag the handle | `Alt+Arrow` (use the handle for cross-level moves) |
| Undo / redo | toolbar | `Ctrl+Z` / `Ctrl+Shift+Z` |
| Open export | toolbar | `Ctrl+E` |
| Switch view | Tree, Markdown, Diagram tabs | `Alt+1`, `Alt+2`, `Alt+3` |
| Collapse the panel | chevron in the tab strip | `Ctrl+\` |

Every item is a question. Each item also has a status, **Open** or **Complete**: the checkbox on the row
toggles it, the markdown export writes `- [ ]` and `- [x]`, and a complete item with an open child raises a
warning instead of changing anything automatically.

### Phone

Below 640px wide, or 480px tall, the shell becomes one pane. The tree fills the screen and Details opens as a
bottom sheet from the header. Rows put the label on the first line and status, key and an actions button on the
second; the actions button opens Add child, Add sibling, Indent, Outdent, Move up, Move down, Copy key and
Delete, because drag and hover are not available. The diagram stays a desktop view.

The soft cap is **100 items**: past it a dismissible nudge suggests the tree has outgrown a single page, and
nothing is blocked. The hard cap is **500**: the 501st add is refused, and the counter turns amber at 100.

---

## 4. Quality and MECE checks

The panel runs on every change and is fully deterministic:

| Check | Level |
| --- | --- |
| Empty label | error |
| Two siblings with identical wording | error |
| A complete item with an open child | warning |
| Two items with identical wording on the same path | error |
| Siblings that share most of their wording (token overlap of 0.6 or more) | warning |
| Root that is not phrased as a question | warning |
| Root with no branches or a single branch | warning |
| Item with a single child | note |
| Uneven leaf depth (three or more levels apart) | note |
| More than seven branches on one item | note |
| Key promoted past five characters | note |
| 80 items used, or the cap reached | note / warning |
| Splits not yet confirmed as MECE | note |

Each finding jumps to its item. The **MECE checklist** stores two booleans per item (exhaustive, mutually
exclusive), and the split review adds wording-level overlap and the missing-"other" nudge.

### The AI seam

An AI reviewer is **not configured** in this build. The interface already exists in
`src/model/mece.ts`:

```ts
export interface MeceReviewer {
  id: string;
  label: string;
  available: boolean;
  reason?: string;
  review(request: MeceRequest): Promise<MeceSuggestion[]>;
}
```

To enable a model later, implement `review()` against your provider, export it, and swap it in where
`disabledAiReviewer` is used in `src/components/Panels.tsx`. No other file needs to change. Keep the API key
on a server or a local proxy; never ship it in the browser bundle.

---

## 5. Versions

* The version starts at 1 and increments on **every committed change**.
* Text edits coalesce for **two seconds** of quiet, so typing a sentence produces one version.
* Structural changes (add, delete, move, indent, retype, MECE tick), imports and restores are versioned
  **immediately**.
* Each version stores the full snapshot, the per-item keys, and a diff summary such as
  "2 relabelled, 1 moved, 3 keys changed".
* History keeps as many versions as fit in the tab's `sessionStorage` budget. The oldest automatic version is pruned first; named checkpoints never are.
* A **checkpoint** is a named version that is never pruned.
* **Restore** takes an old snapshot and writes it as a new version. Nothing is ever overwritten.
* The history panel compares any version with the current tree: added, removed, relabelled, moved, re-typed
  and re-keyed items.

---

## 6. Export

### PowerPoint

Native, editable shapes written by PptxGenJS. No images, no screenshots.

* 16:9, rounded rectangles, text boxes, elbow connectors made of line segments.
* Slide 1 is a **structure overview**: the whole tree when it stays legible (at most 30 boxes and 16 leaf
  rows), otherwise the deepest levels that fit, with a subtitle saying so. The fallback still shows the root
  and its top-level branches.
* **Branch slides** pack several top-level branches together, aiming for two to five levels per slide, and
  repeat the root as context. Packing limits: 30 items, 12 leaf rows and depth 5 per slide.
* Every box carries its **key chip** and a type label. The footer carries the tree name, version, date and
  page number.
* An optional **key index** table lists key, type, level and wording so a reader can resolve a key from a
  meeting note.

### CSV

```
key,parent_key,level,status,label,path,branch_index,version
```

* UTF-8 **with BOM** and CRLF, so Excel on Windows reads non-ASCII labels correctly.
* RFC 4180 quoting: commas, quotes and line breaks inside labels are escaped.
* `status` is `open` or `complete`.
* `path` is the key path (`R4KQ/K7M2/T3PW`); `branch_index` is the 1-based position among siblings, and 0 for
  the root; `version` is the version the export was taken from.

### Markdown

A task list with a version comment: `- [ ]` for open and `- [x]` for complete. It round-trips through the
importer without losing wording, structure or status, and a leading key in the form `K7M2 · ` is ignored.

### Project JSON

The tree, settings, MECE flags, key aliases and the full version history. This is the file to move a tree
between machines or to archive it.

---

## 7. Architecture

```
src/
  model/        pure functions, no React
    keys.ts     normalisation, SHA-256, Crockford Base32, collision promotion
    tree.ts     immutable tree operations, soft 100 and hard 500 caps
    markdown.ts generic list parsing and export
    csv.ts      RFC 4180 export and import
    layout.ts   one layout engine for the preview and the slides, plus slide packing
    quality.ts  deterministic checks and token overlap
    mece.ts     MECE self-check, heuristic review, AI adapter interface
    diff.ts     version comparison
    sample.ts   two sample trees
  store/
    storage.ts          per-tab sessionStorage: one tree, one history
    db.ts               legacy IndexedDB, read once for migration
    useWorkspace.ts     documents, editing, undo, versions, autosave
  export/pptx.ts        native-shape PowerPoint builder
  components/           TopBar, Sidebar, Outline, Diagram, Panels, Dialogs
  test/                 vitest suites
```

The preview and the PPTX share `layoutTree()`, so what you see is what lands on the slide. The model layer is
framework-free and could be reused by another UI.

---

## 8. Limits and privacy

* 500 items per tree (nudge at 100); 5-character keys; version history bounded by the tab's storage budget.
* One browser profile holds the library. Export a project file to move or back up a tree.
* No network calls at all. Nothing is sent anywhere; there is no analytics and no telemetry.
* `sessionStorage` is the store. Closing the tab ends the tree; private browsing clears it sooner.

---

## 9. Hosting on GitHub Pages

The app is a static single page with no server calls, so GitHub Pages can host it as-is. Two things need care:
the base path, and the deploy step.

### The base path

A project site lives at `https://<user>.github.io/<repo>/`, not at the domain root. Vite has to rewrite asset
URLs to match, otherwise the page loads and every script 404s. `vite.config.ts` reads `VITE_BASE_PATH`:

```
VITE_BASE_PATH=/issue-tree-studio/ npm run build
```

Local dev and a custom domain keep `/`. The included workflow works the value out from the repository name and
treats a `<user>.github.io` repository as a root site.

On Windows, Git Bash rewrites a leading slash in an environment variable into a Windows path. Use PowerShell
(`$env:VITE_BASE_PATH="/issue-tree-studio/"; npm run build`) or cmd
(`set "VITE_BASE_PATH=/issue-tree-studio/" && npm run build`), or prefix the command with
`MSYS_NO_PATHCONV=1`. The GitHub workflow is unaffected because it runs on Linux.

### One-time setup

1. Create an empty repository, then push this folder:

```
git init -b main
git add .
git commit -m "Issue Tree Studio"
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

2. In the repository: **Settings -> Pages -> Build and deployment -> Source: GitHub Actions**.
3. The push runs `.github/workflows/deploy.yml`: install, test, build with the right base path, copy
   `index.html` to `404.html`, upload and deploy. The site appears at
   `https://<user>.github.io/<repo>/`.

### What the workflow does

| Step | Why |
| --- | --- |
| `npm ci` | reproducible install from the lockfile |
| `npm test` | a broken tree model never reaches the site |
| compute the base path | project sites need `/<repo>/` |
| `npm run build` | static output in `dist/` |
| `cp dist/index.html dist/404.html` | safety net for any deep link |
| no `.nojekyll` | Actions deployments serve the artifact directly, so Jekyll never runs |
| upload and deploy | `actions/deploy-pages` publishes the artifact |

### Things that behave differently once hosted

* **Storage is per origin.** Trees saved on `localhost:5173` do not appear on the Pages site. Move a tree with
  project JSON export and import.
* **HTTPS is required** for the clipboard API behind the key chips. Pages serves HTTPS, so copying works.
* **No server features exist to break.** PowerPoint, CSV and JSON are all generated in the browser.
* **Custom domain:** put `CNAME` in `public/`, set the domain under Settings -> Pages, and build with
  `VITE_BASE_PATH=/` (or let the `<user>.github.io` branch condition handle it).

### Alternative without Actions

```
npm run build
npx gh-pages -d dist --nojekyll
```

Then set **Settings -> Pages -> Source: Deploy from a branch** and pick `gh-pages` / root.

## 10. Reporting a problem

Open https://github.com/bobatgit/issue-tree-studio/issues/new/choose and pick one of three templates. They are
different problems and they ask different questions.

| Template | Use when | Required fields |
| --- | --- | --- |
| Bug | Does not work: crash, dead button, export fails | Steps, expected, actual, build, browser |
| Defect | Runs, but the result is wrong | The rule that should hold, the actual output, how to see it |
| Feature | Needs to do something new | The problem, the decision it unlocks, the smallest useful version |

The middle case is not a bug hunt. A `defect` needs one sentence that says what should happen. That sentence
becomes the test, and often settles the ticket before any code changes. If the rule cannot be written, the
ticket gets `needs-spec` instead of a fix.

### Name the build

Every push to `main` redeploys the site, so a report without a build can describe an old bundle. The header
shows it at the right edge:

```
0.2.0 · c861e80
```

Version, then the short commit. Clicking it opens the releases page.

### Copy diagnostics

In the app: Export, then **Copy diagnostics**. The clipboard gets one block:

- build, page URL, browser and viewport
- tree name, version, item count and depth
- key length, promoted keys and collisions
- open and complete counts, and document settings
- the tree JSON, collapsed

Paste it into the issue. The tree JSON is enough to reproduce the exact state, without sending anything to a
server. Nothing personal is included beyond your browser string and window size.

### Labels

| Label | Meaning |
| --- | --- |
| `bug` | Broken: it does not work |
| `defect` | Works, but not as intended |
| `feature` | New capability |
| `p1` | Broken or data loss |
| `p2` | Wrong but usable |
| `p3` | Polish |
| `needs-spec` | The intended behaviour is not written down yet |
| `needs-repro` | Cannot reproduce yet |

`bug` and `defect` are separate on purpose. A broken export and a wrongly ordered CSV row need different
evidence, and merging them makes both slower to fix.

### Lifecycle

```
capture -> triage (type + priority) -> reproduce -> fix with a failing test -> close -> changelog -> deploy
```

A fix commit says `Fixes #12`, so the ticket closes itself. The change lands in `CHANGELOG.md` and goes live in
about a minute, because Pages deploys on every push to `main`.

## 11. Verification

```
npm test
# 11 files, 107 tests: keys, markdown, CSV, tree, layout, quality, diff, diagnostics, project, apply, app

npm run build
# tsc -b clean, vite build clean

npm run smoke
# writes artifacts/profit-decline.pptx, market-entry.pptx, stress-100.pptx,
# deep-7-levels.pptx and matching .csv files, and reports key and round-trip stats
```

The smoke output for the 100-item case confirmed: 100 items, 100 unique keys of length 4, zero collisions,
a CSV that re-imports to the same tree, and a `.pptx` that unzips to 15 slides containing 0 images and
native `p:sp` shapes only.

### Design decisions from the requirements interview

| Decision | Choice |
| --- | --- |
| What is hashed | Normalised label plus its ancestor path |
| Key length | 4 characters, Crockford Base32, promoted on a real collision |
| Item cap | 100 unique items |
| PowerPoint | Native editable shapes, 16:9 |
| Slide plan | Structure overview, then packed branch slides (2-5 levels each) |
| Key display | Chip on every item, on screen and on the slide |
| CSV | key, parent_key, level, type, label, path, branch_index, version |
| Storage | One tree per tab in `sessionStorage`; project JSON is the archive |
| Versioning | Auto-version per change, 5,000 kept, named checkpoints never pruned |
| MECE | Deterministic checks now, AI reviewer behind a defined interface |
| Stack | React, TypeScript, Vite, PptxGenJS |

---

## 12. Known trade-offs

* Keys moved from four characters to five when the hard cap became 500: 0.37 percent collision risk at the cap,
  against 38 percent for four characters at the same size.
* Because keys follow the path, restructuring a tree renames keys. That is the price of "hash of the content
  at its place in the argument". Old keys stay resolvable as aliases.
* The overview slide compresses large trees. The branch slides always carry every item.
* The AI MECE review is intentionally absent; the seam and the UI state are in place.
