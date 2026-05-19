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

These rules are the foundation of a working DA doc. DO NOT re-derive
them empirically. See `learnings.md` for the underlying mechanics.

1. **Use divs-with-class shape, NOT tables.** The EDS pipeline does
   NOT auto-convert DA-source `<table><th>BlockName</th></table>`
   into `<div class="blockname">`. Tables in DA source get flattened
   to a soup of `<p>` tags with the block name dropped. Emit
   divs-with-class directly:

   ```html
   <body>
     <header></header>
     <main>
       <div>
         <div class="hero">
           <div><div>title</div><div>Be found everywhere search happens</div></div>
           <div><div>cta-primary</div><div><a href="/signup/">Sign Up</a></div></div>
         </div>
       </div>
       ... one outer-div per block ...
       <div>
         <div class="metadata">
           <div><div>template</div><div><TEMPLATE_NAME></div></div>
           <div><div>title</div><div><PAGE_TITLE></div></div>
         </div>
       </div>
     </main>
     <footer></footer>
   </body>
   ```

2. **Metadata MUST be a `<div class="metadata">` block inside
   `<main>`.** A `<footer><table><tr><th>Metadata</th></tr>...` is
   silently ignored by the pipeline — `<meta name="template">` will
   NOT appear in the rendered head, the overlay engine bails out,
   and standard EDS decoration tries to load `/blocks/<name>/<name>.js`
   for every block (one 404 per block).

3. **No inline `<span class="...">`, `<b>`, `<i>`, `<u>`, `<mark>`,
   `<br>` in cell content.** The pipeline's markdown-ish normaliser
   strips anything not on its preserve list. **Preserve list:**
   `<strong>`, `<em>`, `<a>`, `<img>`, `<picture>`, `<h1>`-`<h6>`,
   `<p>`. (The preserve list is empirical, accumulated across multiple
   conversion runs.) Use `<strong>`/`<em>` for inline emphasis; for
   typography accents inside titles, use `<strong>` or restructure
   to put the class on the parent element instead. For line breaks
   inside a slot value, restructure to two `<p>` tags (or two slots)
   rather than `<br>`.

4. **`<img>` URLs in DA cells MUST be absolute.** The EDS Media Bus
   processes `<img src>` values in DA-source HTML and only handles
   absolute URLs. Root-relative paths (`/assets/foo.png`) are
   resolved against the DA content host (`content.da.live`), where
   the asset isn't found → the pipeline serves
   `<img src="about:error">` and the browser surfaces an
   `ERR_UNKNOWN_URL_SCHEME` error. Always emit absolute URLs in DA
   cell `<img>` values:
   - Public source page: `https://<source-host>/<path>/image.png`
   - Vendored same-branch assets: `https://<branch>--<repo>--<owner>.aem.page/assets/...`
   - DA media: `https://content.da.live/<org>/<repo>/media_<sha>...`

   Note the asymmetry with template/fragment HTML refs, which CAN be
   root-relative — the browser resolves those against the rendered
   page host (= code-bus host) so `/assets/...` works there. The DA
   pipeline is what's stricter, not the browser.

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
  `eds-da-mechanics.md`, update those docs in the same commit.
- If you discover a generic tool worth keeping, move it to a shared
  `tools/` directory with a README.

## Honesty rules

- Mark every claim **[verified]** or **[assumed]**.
- Negative findings matter as much as positives — write down what
  failed and why.
- Don't blur the line between per-project and generic. If it sounds
  generic, move it.
