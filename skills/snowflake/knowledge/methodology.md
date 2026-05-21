# Methodology — How to Run a Conversion Project

Operational guide for the 6-step loop. Each project executes this loop
once per input page.

Before you start: read `architecture.md` for the overlay design and
`learnings.md` for accumulated gotchas. Don't re-discover what's been
documented.

## The phases

```
1. Capture      → /input/ holds the source page + assets
2. Analyze      → identify header/footer, segment blocks, find slots
3. Generate     → produce template, fragments, CSS, JS, DA doc
4. Wire         → deploy artifacts to template-keyed paths, scripts
5. Round-trip   → local diff + production preview
6. Reflect      → write notes, promote learnings
```

---

## 1. Capture

Goal: project is self-contained — the input can be re-analyzed without
network access.

- Create a project directory with a slug that names the source: e.g.
  `relume-pricing`.
- Save the HTML at `input/<page-slug>.html`. If the source references
  external CSS/JS files, save those alongside. Inline CSS/JS stays in
  the file.
- Write `README.md` describing: source URL, generator (if known),
  capture date, page intent, anything notable about the structure
  (e.g., "uses Stardust provenance metadata", "tailwind-style utility
  classes throughout").

## 2. Analyze

Goal: structural map of what becomes header, what becomes footer, what
becomes template, what becomes slots.

- **Header boundary.** Everything from `<body>` start until `<main>`
  start is the header fragment. Often broader than just `<header>` —
  announcement banners, mega-nav panels, sticky breadcrumbs all live
  here. Group them all into one fragment.
- **Footer boundary.** Everything from `</main>` end to `</body>`
  (minus scripts) is the footer fragment. Often includes sticky CTAs,
  modal markup, etc.
- **Main sections.** Each direct child of `<main>` (or each `<section>`
  inside it) is a candidate block. Use LLM segmentation if the
  source doesn't already mark sections; use semantic tags as ground
  truth if it does.
- **Slot identification.** Within each block, identify:
  - Visible text in headings, paragraphs, button labels, link text
    → text slot.
  - `<img>` / `<picture>` → image slot.
  - `<a>` with text and href → link slot (carries both).
  - Decorative `aria-hidden` icons, hard-coded glyphs → NOT slots,
    stay in template.
  - Generator-emitted placeholders → NOT slots; mark with
    `data-slot-skip="placeholder"`. **Detect the convention per-input
    during this phase and document it in `notes.md`** so the Generate
    subagent knows what to skip. Examples observed:
    - Stardust 0.3.0: `<element data-placeholder="true">` attribute.
    - Stardust 0.2.0: `<span class="placeholder-tag">` inline marker.

Write `notes.md` with the structural map (line numbers, section list,
header/footer boundary). The map anchors the rest of the run.

## 3. Generate

Goal: produce the five artifacts that the overlay engine consumes.

**Output layout (all under `output/`):**

```
output/
├── templates/<template>.html                  ← <main> with [data-slot] markers
├── fragments/<template>/header.html           ← full header DOM
├── fragments/<template>/footer.html           ← full footer DOM
├── styles/<template>.css                      ← extracted inline <style>
├── scripts/<template>-animations.js           ← extracted inline <script> (optional)
└── da/<page-slug>.html                        ← DA-source body fragment
```

**Rewrite relative asset paths to absolute.** When a source uses
relative paths like `assets/photos/foo.jpg`, `url(./images/bar.png)`,
`<link href="assets/css/site.css">`, they resolve against our
serving host (`localhost:3000/drafts/...` or
`<branch>--<repo>--<owner>.aem.page/<da-root>/...`) — where they
404. Rewrite them all to absolute URLs pointing back to the source
host (e.g. `https://<source-host>/path/to/assets/...`).
This applies to template HTML, fragment HTML, DA cell values
referencing images, and any CSS `url()` references. Asset migration
to DA's `/media/` is explicitly out of scope unless the user asks.

**Don't forget head-level `<link>` resources.** The source page's
`<head>` often has more than just inline `<style>` — font preconnects,
Google Fonts stylesheet links, etc. Extract those too and include them
at the **top of the template file**, above `<main>`:

```html
<!-- /templates/<template>.html -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=…">

<main>
  …slot-marked sections…
</main>
```

The overlay engine lifts any top-level `<link>` it finds in the
template into `document.head` at runtime. Without these, font stacks
that name third-party fonts (Mona Sans, Inter, etc.) silently
fall back to system-ui — visually subtle, semantically wrong.

### Template wrapping and section uniqueness

Two transformations the template needs that aren't slot-related:

1. **Synthesize `<main>` if the source doesn't have one.** The
   overlay engine `querySelector('main')`s the parsed template.
   When the source's body-level sections aren't already wrapped
   in `<main>`, wrap them in one when writing the template file.

2. **Ensure each `<section>`'s first class is unique** within
   the template. The overlay engine matches DA blocks to template
   sections by `section.className.split(' ')[0]`. If the source
   has multiple sections sharing a first class (common when
   utility classes like `section`, `card`, `tile` are used),
   rewrite so a stable discriminator becomes the first class.
   Keep the original classes in the list afterward — CSS rules
   depending on them still match.

   Discriminator priority (use the first one that works):
   1. `data-section` attribute (Stardust convention).
   2. `id` attribute on the section element.
   3. Slug from the most prominent eyebrow/label inside the
      section (`<p class="label">`, `<span class="eyebrow">`, etc).
   4. Last resort: positional `section-N`.

   Example:
   ```diff
   - <section class="section" data-section="activity-tile-grid">
   + <section class="activity-tile-grid section" data-section="activity-tile-grid">
   ```

### Critical rules for the DA doc

The DA HTML rules live in the `eds-da-content` skill. Load that skill
before writing the DA doc, especially:

- [`html-content.md §3`](../../eds-da-content/references/html-content.md) — block format (canonical `<div class="…">` form, three-layer conversion model, decoration output).
- [`html-content.md §3.9`](../../eds-da-content/references/html-content.md) — cell content normalization (preserve / rewrite / strip lists, `<br>` positional rules, `<p>` unwrapping).
- [`html-content.md §5`](../../eds-da-content/references/html-content.md) — Page Metadata block (`<div class="metadata">`).
- [`html-content.md §9`](../../eds-da-content/references/html-content.md) — image URL rules (full URLs only; no repo-relative or document-relative paths).

The rules below capture only the Snowflake-specific points that are
overlay-pattern decisions or interact with the overlay engine. They do
NOT restate eds-da-content's universal rules.

1. **Use the canonical `<div class="…">` form for blocks.** The DA
   pipeline supports both `<div>` and `<table>` forms — for
   programmatic authoring, divs are recommended because the round-trip
   with DA storage is identity (no normalization step on the way to
   render). See [eds-da-content/references/html-content.md §3.1 and
   §3.6](../../eds-da-content/references/html-content.md) for the
   three-layer conversion model and the form-selection rationale.
   Snowflake emits one outer `<div>` per section, each containing one
   `<div class="<first-class>">` block:

   ```html
   <main>
     <div>
       <div class="hero">
         <div><div>title</div><div>Be found everywhere search happens</div></div>
         <div><div>cta-primary</div><div><a href="/signup/">Sign Up</a></div></div>
       </div>
     </div>
     ... one outer-div per section ...
     <div>
       <div class="metadata">
         <div><div>template</div><div><TEMPLATE_NAME></div></div>
         <div><div>title</div><div><PAGE_TITLE></div></div>
       </div>
     </div>
   </main>
   ```

2. **The metadata block MUST live inside `<main>`.** Per
   [eds-da-content/references/html-content.md §5](../../eds-da-content/references/html-content.md),
   Page Metadata is "the last element of the last section inside
   `<main>`". The overlay-specific consequence of getting this wrong:
   if metadata lands in `<footer>` or is misspelled, the pipeline
   emits no `<meta name="template">`, the overlay engine bails out,
   and standard EDS decoration falls through — producing one 404 per
   block as the renderer tries to load `/blocks/<name>/<name>.js` for
   every block in the doc.

3. **Block cell content goes through pipeline normalization** — see
   [eds-da-content/references/html-content.md §3.9](../../eds-da-content/references/html-content.md)
   for the verified preserve / rewrite / strip behavior. Notable
   consequences for the Generate phase:
   - `<span class="…">` is **stripped** (class lost). Source pages
     that use spans as CSS hooks need either CSS-only fixes
     (`:has()`, sibling selectors) or semantic-element swaps. Don't
     write classed spans into DA cells.
   - `<b>`, `<i>`, `<s>`, `<mark>`, `<kbd>` are **rewritten** to
     semantic equivalents (content survives; tag changes). Page CSS
     targeting the original tag stops matching.
   - `<br>` is **position-dependent**. Trailing/lonely/between-block
     `<br>` is stripped; mid-flow `<br>` survives. When unsure,
     restructure to two `<p>` elements.
   - `<u>`, `<del>`, `<sub>`, `<sup>`, `<code>`, `<ul>`/`<ol>`/`<li>`
     are preserved unchanged. (Snowflake's earlier learnings claimed
     `<u>` was stripped — superseded by §3.9, which verifies `<u>`
     preserves and `<mark>` rewrites to `<em>` rather than stripping.)
   - `<ins>` and `<span>` (with or without class) are **stripped** —
     tag wrapper disappears, text survives bare.

4. **`<img>` URLs in DA cells MUST be absolute.** See
   [eds-da-content/references/html-content.md §9](../../eds-da-content/references/html-content.md).
   Snowflake-specific note: there is an asymmetry between DA cells and
   template/fragment HTML. Template and fragment refs CAN be
   root-relative (`/assets/foo.png`) because the browser resolves
   those against the rendered page host (= code-bus host). The DA
   pipeline is what's stricter, not the browser. For Snowflake the
   acceptable absolute forms are:
   - Public source page: `https://<source-host>/<path>/image.png`
   - Vendored same-branch assets: `https://<branch>--<repo>--<owner>.aem.page/assets/...`
   - DA media: `https://content.da.live/<org>/<repo>/media_<sha>...`

### Slot rules in the template

- Text slot: `<el data-slot="name">default value</el>`. Default is
  overwritten by DA content at runtime, but having it makes the
  template self-renderable for testing.
- Image slot: `<img data-slot="name" src="..." alt="">`. Runtime
  copies `src` and `alt` from the DA cell.
- Picture slot: `<picture data-slot="name">…</picture>`. Runtime
  replaces the picture with the DA cell's `<picture>`.
- Link slot: `<a data-slot="name" href="…">label</a>`. Runtime copies
  `href` and `innerHTML` from the DA cell's `<a>`.
- **Background-image slot**: any element with an inline
  `style="background-image:url(…)"` plus a `data-slot` attribute.
  DA cell carries an `<img>`; runtime extracts its `src` and writes
  it as the element's `background-image` URL, preserving other
  inline styles. Use this for CSS-driven photos (hero backdrops,
  card tiles where the image is the container's background, etc.)
  without restructuring the source's markup. The pipeline's Media
  Bus also picks up the `<img>` in the DA cell and serves an
  optimised version via `./media_<sha>.jpg?width=…&format=…&optimize=…`.
- Placeholder pass-through: `<el data-slot-skip="placeholder">…</el>`.
  Never a slot; rendered as-is.

Slot names are kebab-case. Repeating items get indexed names:
`card-1.title`, `card-2.title`. Names are scoped to their block —
the same name can repeat across blocks.

### Container-vs-children slot rule

**Never put `[data-slot]` on an element that has nested `[data-slot]`
children.** The slot writer for every element type overwrites the
target's `innerHTML` (or replaces it entirely), which destroys
nested slot markers before they can be processed.

Concretely:
- A card wraps icon + title + body in `<a class="card-link">`. Either
  slot the inner three children, OR slot the `<a>` itself — never both.
- A picture wraps `<img>` plus `<source>` siblings. Slot the
  `<picture>`, not the inner `<img>`.

Edge case: an `<a data-slot="cta">Learn more <img></a>` (text + a
decorative icon, NO nested `[data-slot]`) is fine. The icon is lost
when DA cell value is applied, but that's acceptable for button-style
CTAs. The trigger is **nested `[data-slot]`**, not "any inner content".

### Rewrite non-`<section>` blocks to `<section>` in the template

If a logical section in the source uses any tag OTHER than `<section>`
(common for `<div class="hero-…">`, scroll wrappers, etc.), rewrite the
outermost element to `<section class="originalClassListHere">` in the
generated template. The CSS continues to work; the engine can now
match the block by its first class. Keep the inner DOM intact.

This complements the existing rule about synthesizing `<main>`.

## 4. Wire

Goal: deploy artifacts to the template-keyed paths and verify prior
runs' work is untouched.

- Copy from `output/` to the EDS-served paths:

  ```
  output/templates/<template>.html        → templates/<template>.html
  output/fragments/<template>/header.html → fragments/<template>/header.html
  output/fragments/<template>/footer.html → fragments/<template>/footer.html
  output/styles/<template>.css            → styles/<template>.css
  output/scripts/<template>-animations.js → scripts/<template>-animations.js
  ```

- Run the transformer to produce the local-test file:

  ```bash
  node tools/transform-da-to-eds.mjs \
    <project>/output/da/<page>.html \
    drafts/<page>.html
  ```

- `head.html` does NOT change. `styles/styles.css` does NOT change.
  `scripts/scripts.js` and `scripts/delayed.js` and the
  `blocks/{header,footer}/*` decorators are already template-keyed —
  no edits needed.

- Run `npm run lint` — must be clean. The boilerplate ignore patterns
  already exclude `styles/*.css` (except `styles.css`/`fonts.css`/
  `lazy-styles.css`) and `scripts/*-animations.js`, so vendor CSS/JS
  from the source page are auto-excluded.

## 5. Round-trip

Goal: validate that the rendered DOM matches the original input
byte-for-byte (or at least: same element count, same tag+class
sequence, same visible text).

**Local first:**

```bash
aem up --html-folder drafts --no-open --forward-browser-logs
```

Load `http://localhost:3000/drafts/<page>.html` in Playwright.
Capture `document.querySelector('main').outerHTML`. Compare to
`input/<page>.html` lines for `<main>`. Save both to `diff/` and
write a per-tag count table + a tag+class sequence diff in
`diff/README.md`. Take a viewport screenshot.

**Screenshot strategy.** For pages with `position: sticky`,
scroll-driven JS, or IntersectionObserver `.anim-enter`-style
animations, `fullPage: true` screenshots are misleading — the snapshot
is taken in initial-scroll state where sticky elements leave empty
space and `.anim-enter` siblings are `opacity: 0`. Default to
**per-section viewport screenshots**: call
`section.scrollIntoView({ block: 'start' })`, wait 400-800ms for
animations to settle, then capture. Save each as
`diff/local-<sectionName>.jpg`.

**Local-only source caveat.** If the source URL is on a private host
(`localhost`, `127.0.0.1`, intranet IP), the production preview host
cannot reach the source's assets. Three options, in order of
preference:

1. **Vendor the referenced assets under `/assets/` in the repo.**
   Same paths work locally and on production via code-bus. Same-origin
   so no CORS issues for fonts. Trade-off is repo size. Mechanical
   steps:
   - `cp -R <source-assets-dir> ./assets/`
   - Remove `.DS_Store`s and unreferenced files
   - Rename any directory containing spaces (AEM CLI 404s on
     URL-encoded `%20`)
   - In template/fragments/CSS: rewrite localhost URLs to
     root-relative `/assets/...`
   - In DA doc cells: rewrite localhost URLs to ABSOLUTE branch URLs
     (`https://<branch>--<repo>--<owner>.aem.page/assets/...`) — Media
     Bus requires absolute (see Generate phase rule #4).
2. **Migrate assets to DA `/media/`.** Cleaner long-term; requires
   tooling not yet in scope.
3. **Skip production round-trip.** Lowest effort; ask the user first
   rather than deciding unilaterally.

**Production round-trip:**

- PUT the DA doc:
  ```bash
  TOKEN=$(jq -r .access_token .hlx/.da-token.json)
  curl -X PUT -H "Authorization: Bearer $TOKEN" \
    -F "data=@<project>/output/da/<page>.html;type=text/html" \
    https://admin.da.live/source/<org>/<repo>/<da-root>/<page>.html
  ```
- POST preview (on whichever branch carries the overlay code):
  ```bash
  curl -X POST -H "Authorization: Bearer $TOKEN" \
    https://admin.hlx.page/preview/<org>/<repo>/<branch>/<da-root>/<page>
  ```
- Load `https://<branch>--<repo>--<org>.aem.page/<da-root>/<page>` in
  Playwright. Verify `main.dataset.overlay === '<template>'`, section
  count matches, no console errors.

`aem.live` (= the `main` branch's live URL) is generally NOT in
scope for experimental branches — only `aem.page` against the feature
branch is.

## 6. Reflect

Goal: feed the next run.

- Append to `notes.md` for everything that happened.
- Update the per-project `learnings.md` for findings tied to this
  source.
- Promote anything generic to the cross-project `learnings.md`.
  Test for promotion: "would the next project, from a different
  generator and different page, benefit from knowing this?" If yes,
  it goes in the cross-project learnings.
- If a finding contradicts something in `architecture.md` or
  `eds-da-mechanics.md`, update those docs in the same commit. If the
  finding is about DA HTML rules (not the overlay engine), it belongs
  in the `eds-da-content` skill — file a separate PR against that
  skill rather than duplicating into Snowflake.
- If you discover a generic tool worth keeping, move it to a shared
  `tools/` directory with a README.

## Refresh mode — re-running an already-closed run

Once a run is closed and published, you may want to re-render it under a
newer skill substrate (to demonstrate skill improvements, fix bugs found
later, etc.). The skill supports this but doesn't prescribe a single
strategy — pick the one that fits the repo's intent:

### A. Archive-tag + rolling branch (simplest)

Rename the existing close tag with a date suffix (e.g.
`sd-foo-a-close` → `sd-foo-a-close-2026-05-19`), reset the branch tip to
trunk, run phases 0–6 fresh, re-tag `sd-foo-a-close` at the new commit.
DA's PUT auto-versions the doc; the 5.2.2a labeled snapshot adds an
explicit "Before refresh" entry. Only the latest version stays reachable
at the active branch URL. Old states are archived in git and DA versions.

### B. Snapshot-by-clone (live A/B comparison)

Before refreshing, clone the branch to a dated branch
(`sd-foo-a` → `sd-foo-a-2026-05-19`) AND copy the DA path to a dated DA
path (`/foo/a` → `/foo/a-2026-05-19`). Both versions stay live at
separate URLs. The active branch resets and refreshes; the snapshot
branch is immutable. Good for demo collections where you want to show
"how this evolved." Branch count grows with each refresh — manageable
if refreshes are quarterly, less so if daily.

### C. Accumulating-files on one branch

Each refresh adds versioned template / CSS / DA paths to the same branch
(e.g. `templates/foo-2026-05-19.html`, `/foo/a-2026-05-19`). One branch
per demo, but file count accumulates over time. Useful when branch
proliferation is undesirable but A/B-ability is required.

### Naming conventions (recommended)

For all three modes, use **ISO date** as the version suffix:
`<base>-YYYY-MM-DD` for branches, DA paths, and (mode A only) close tags.
Same-day collisions get a `-N` counter starting at 2:
`<base>-2026-05-19-2`, `<base>-2026-05-19-3`.

Repos with strong opinions on naming (version numbers, semantic-version
of substrate, etc.) document the override in
`.snowflake/knowledge/methodology.md`.

### Git tag "rename" pattern (for modes that rename close tags)

```bash
git tag NEW OLD            # create new tag at same commit
git tag -d OLD             # delete old tag locally
git push origin NEW :OLD   # push new, delete old on remote
```

Not atomic on remote but reliable. Verify with
`git ls-remote origin 'refs/tags/<branch>-*'` after.

## Honesty rules

- Mark every claim **[verified]** or **[assumed]**.
- Negative findings matter as much as positives — write down what
  failed and why.
- Don't blur the line between per-project and generic. If it sounds
  generic, move it.
