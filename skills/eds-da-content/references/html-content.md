# DA HTML content reference

How to generate HTML that DA will accept and EDS will render correctly.
Covers the document skeleton, block markup (canonical `<div class="…">`
form and accepted `<table>` alternate), section structure, page and
section metadata blocks, default content, icons, links, image references,
and the encoding / forbidden constructs.

For media binaries (the files HTML references), see [media.md](./media.md).
For the DA Source API call that uploads the HTML, see
[platform.md](./platform.md).

Every factual claim is tagged `[verified]` (read from code or observed
empirically) or `[assumed]` (inferred from documentation without direct
verification).

---

## 1. Document skeleton

A DA document is a **body fragment**, not a full HTML page. `[verified]`
from `da-admin` source and team docs.

```html
<body>
  <header></header>
  <main>
    <div>...</div>      <!-- one div per section -->
    <div>...</div>
  </main>
  <footer></footer>
</body>
```

### What to include

- `<body>` wrapper (mandatory)
- `<header>` and `<footer>` (mandatory tags, typically empty)
- `<main>` containing one `<div>` per section

### What to NOT include

| Tag / attr | Why |
|---|---|
| `<!DOCTYPE>` | Server-side pipeline emits this. `[verified]` |
| `<html>`, `<head>` | Server-side pipeline emits these from `head.html`. `[verified]` |
| `<script>`, inline `onclick=` | Stripped by the pipeline. `[verified]` |
| `<style>`, `style=` attrs | Stripped by the pipeline. `[verified]` |
| `class=` on default-content tags (paragraphs, headings, lists) | Added by `decorateBlocks` / `decorateSections` at delivery. `[verified]` |
| `id=` on headings | Auto-generated from heading text. `[verified]` |
| Inline `data-*` attrs outside Section Metadata output | Stripped. `[verified]` |

### Pipeline injection

At delivery, the EDS pipeline injects `head.html` from the project's
Code Bus (typically containing the CSP meta, viewport, `aem.js`,
`scripts.js`, `styles.css`). The DA document supplies only the
in-`<body>` content. `[verified]` from EDS docs.

## 2. Sections

Each section is a single `<div>` directly inside `<main>`. `[verified]` from
EDS markup docs.

```html
<main>
  <div>
    <!-- section 1 contents -->
  </div>
  <div>
    <!-- section 2 contents -->
  </div>
</main>
```

### Rules

- No `<hr>` between sections — the section boundary is the `<div>` itself.
- Sections may contain default content (headings, paragraphs, lists) and
  blocks (see §3) in any order.
- One level of nesting only: blocks cannot contain other blocks. `[verified]`
  from EDS markup docs.
- Each section becomes `<div class="section">` after decoration at
  delivery; section metadata (§4) adds further CSS classes.

### When to use multiple sections

Use a new section whenever the visual layout shifts — different background,
different content density, a layout break. Sections are the natural unit
of CSS theming.

### Single-section pages

A page with no logical section break still wraps its content in one `<div>`
inside `<main>`. The pipeline always wraps everything in at least one
section. `[verified]`.

## 3. Blocks

A block is a piece of structured, named content inside a section. Two
authoring shapes are accepted by DA:

- **`<div class="…">` form — canonical.** Use this when generating HTML
  programmatically or by hand.
- **`<table>` form — accepted alternate.** Use this when piping content
  from Word / Google-docs imports, helix-importer-ui, or any
  markdown→HTML chain that emits tables natively.

Both forms produce **byte-identical** rendered output on `aem.page` /
`aem.live`. The recommendation to prefer divs is about round-trip
efficiency, not correctness. `[verified]` empirically via direct PUT of
each form against `admin.da.live/source/...` followed by preview —
identical `<div class="…">` markup in the rendered `<main>`. See the
investigation at `DA-BLOCK-FORMAT.md` lines 312-339.

### 3.1 The three-layer conversion model

Why both forms work, and why divs are the canonical form:

| Layer | Behavior |
|---|---|
| **Storage (`da-admin`)** | Accepts any HTML; stores bytes as-is, no transformation. `[verified]` `da-admin/src/storage/object/put.js:33-58`, `da-admin/src/helpers/source.js:62-71` |
| **Preview pipeline (Helix `md2da`)** | On preview, normalizes `<table>` blocks to `<div class="…">` blocks. `[verified]` mirrored in-repo by `da-nx/nx/utils/converters.js:33-60` `convertBlocks()`; the upstream contract is named in `da-nx/test/utils/converters/converters.test.js:145-160` ("md2da in Helix corresponds to mdToDocDom + docDomToAemHtml"). |
| **Editor (`da-live`)** | On open, parses `<div class="…">` into a ProseMirror `table` node via `aem2doc`. On save, always serializes back to `<div class="…">` via `prose2aem.js:26-58` `convertBlocks()`. `[verified]` |

Counter-check: the Universal Editor adapter reads div-form blocks
directly. `[verified]` `da-universal/src/utils/hast.js:36-103`
`readBlockConfig`.

Consequence for programmatic authoring:

- **Generate divs** → the read shape (when you fetch existing content
  from `admin.da.live/source/...`) matches the write shape. Round-trip
  is identity. No `md2da` normalization step on the way to render.
- **Generate tables** → fully supported, but the storage form will flip
  to divs the first time a human user opens-and-saves in the DA editor
  (the editor canonicalizes on save).

### 3.2 Canonical div form

```html
<div class="block-name">
  <div>
    <div>cell 1</div>
    <div>cell 2</div>
  </div>
  <div>
    <div>cell 3</div>
    <div>cell 4</div>
  </div>
</div>
```

The outermost `<div>`'s `class` attribute encodes the block identity:
the **first class token is the block name**; subsequent tokens are
variants. Each direct child `<div>` is a row. Each grandchild `<div>` is
a cell.

```html
<div class="hero">
  <div>
    <div>
      <h1>Title</h1>
      <p>Subtitle</p>
    </div>
  </div>
</div>
```

### 3.3 Block name encoding

The first class token is the block name. It resolves to
`/blocks/<name>/<name>.{js,css}` at delivery (the EDS pipeline injects
these references from Code Bus).

| Class attribute | Block name | File path |
|---|---|---|
| `class="columns"` | `columns` | `blocks/columns/columns.{js,css}` |
| `class="hero-banner"` | `hero-banner` | `blocks/hero-banner/hero-banner.{js,css}` |

`[verified]` from `aem.js` `decorateBlock`.

#### `toBlockCSSClassNames` algorithm

Identical implementation in `da-nx/nx/utils/converters.js` and
`da-live/blocks/shared/prose2aem.js`. Used when normalizing a table-form
header (e.g. `"Columns (features, 3-col)"`) into the equivalent class
list (`["columns", "features", "3-col"]`):

1. Split on the last `(` — first part is the block name, parenthetical
   part splits on `,`
2. Lowercase
3. Non-alphanumeric runs → single `-`
4. Trim leading/trailing `-`
5. Drop empty segments

The inverse (`<div>` → editor table heading) joins them back: first
class is the block name, the rest are variants joined with `, ` and
wrapped in parentheses. `[verified]` `DA-BLOCK-FORMAT.md` lines 290-308.

#### Block name constraints (both forms)

- Alphanumeric and single hyphens only.
- No underscores. `[verified]`
- No double dashes. `[verified]`
- Cannot start with a digit. `[verified]`

Valid: `hero`, `columns`, `super-hero`
Invalid: `hero_wide`, `hero--wide`, `2col`

### 3.4 Block variants / options

Variants attach CSS modifier classes to the block. The two forms encode
them differently but normalize identically:

| Div form (`class="…"`) | Table form (header cell) | Resulting classes |
|---|---|---|
| `class="columns"` | `Columns` | `columns block` |
| `class="columns wide"` | `Columns (wide)` | `columns wide block` |
| `class="columns super-wide"` | `Columns (super wide)` | `columns super-wide block` (multi-word: hyphenated) |
| `class="columns dark wide"` | `Columns (dark, wide)` | `columns dark wide block` (comma-separated → separate classes) |

`[verified]` from EDS markup docs and `toBlockCSSClassNames` in
`da-nx/nx/utils/converters.js`.

### 3.5 DOM output after decoration

For **div-form input**, decoration is not a format conversion — only a
wrapper, status attributes, and an added `block` class are layered on:

```html
<!-- Authored in DA (div form, canonical) -->
<div class="hero">
  <div>
    <div>
      <h1>Title</h1>
      <p>Subtitle</p>
    </div>
  </div>
</div>

<!-- Rendered by aem.page -->
<div class="hero-wrapper">
  <div class="hero block" data-block-name="hero" data-block-status="loaded">
    <div>
      <div>
        <h1>Title</h1>
        <p>Subtitle</p>
      </div>
    </div>
  </div>
</div>
```

For **table-form input**, the Helix preview pipeline first normalizes
the table to the div form above, then decoration applies. The rendered
markup is byte-identical to the div-form rendering.

```html
<!-- Authored in DA (table form, alternate) -->
<table>
  <tr><td>Hero</td></tr>
  <tr><td><h1>Title</h1><p>Subtitle</p></td></tr>
</table>

<!-- Normalized by Helix preview pipeline -->
<div class="hero">
  <div><div><h1>Title</h1><p>Subtitle</p></div></div>
</div>

<!-- Then decorated (same as above) -->
<div class="hero-wrapper">
  <div class="hero block" data-block-name="hero" data-block-status="loaded">
    <div><div><h1>Title</h1><p>Subtitle</p></div></div>
  </div>
</div>
```

`[verified]` from `aem.js` `decorateBlock` for decoration; from
`da-nx/nx/utils/converters.js:33-60` for normalization.

### 3.6 Which form should I generate?

| Situation | Form |
|---|---|
| Writing HTML by hand or programmatically authoring | **`<div class="…">`** — matches what the editor saves and what storage returns. Round-trip is identity. |
| Migrating from Word / Google-docs, helix-importer-ui, an md-based site, or any pipeline that already emits `<table>` blocks | **`<table>`** — the Helix preview pipeline normalizes them on the way to render. No need to pre-convert. |
| Generating EDS-decorated HTML (with `<span class="icon icon-X">` etc.) for upload | **`<div class="…">`** with direct PUT to `admin.da.live/source/...`. Tables piped through the `aem content` CLI lose icon spans during pre-upload normalization. See [platform.md §7](./platform.md). |

`[verified]` `DA-BLOCK-FORMAT.md` lines 343-363.

### 3.7 Max children per row

Four children per row maximum (i.e. four cells per row). `[verified]`
from Adobe's Experience Modernization Agent prompting guide. Exceeding
this is not a hard parse failure but breaks the common block JS
patterns that assume ≤4 columns.

### 3.8 Forbidden patterns

These render as plain HTML (silent failure — the block JS never loads):

#### Div form

| Pattern | Why it breaks |
|---|---|
| Outermost `<div>` has no `class` attribute | No block name → not recognized as a block. Renders as a plain section `<div>`. `[verified]` |
| Block name class is not first in the class list | EDS reads the first class token as the block name. `class="wide hero"` resolves to block name `wide`, not `hero`. `[verified]` from `aem.js`. |
| Nested block divs (block inside a block cell) | EDS doesn't support nested blocks. The inner block renders as plain HTML. `[verified]` from EDS markup docs. |
| Skipping the row/cell nesting (`<div class="hero"><h1>…</h1></div>` directly) | Decoration expects depth-2 rows and depth-3 cells. Without them, default-content selectors inside the block JS don't match. `[verified]` |

#### Table form (alternate)

| Pattern | Why it breaks |
|---|---|
| First row NOT merged into a single cell | EDS treats the table as plain HTML. `[verified]` |
| Empty header cell | No block name → not recognized as a block. `[verified]` |
| Nested `<table>` inside a block cell | EDS doesn't support nested blocks; the inner table renders as plain HTML. `[verified]` |
| Missing `<tbody>` | Some HTML generators omit `<tbody>`; DA's ProseMirror schema is strict. Use `<table><tr>...</tr></table>` consistently or always wrap in `<tbody>`. `[verified]` from `da-live` source. |
| Stray text nodes between `<tr>` / `<td>` | ProseMirror parse failure. Output clean HTML with no whitespace text nodes. `[verified]` |

## 4. Section Metadata block

Section Metadata is a special block placed **inside** the section it
targets. It adds CSS classes and data attributes to the enclosing section
`<div>`. It has **no SEO effect** — that's the Page Metadata block (§5).

Canonical (div) form:

```html
<div class="section-metadata">
  <div><div>Style</div><div>dark, center</div></div>
  <div><div>Background</div><div>https://content.da.live/{org}/{repo}/media/bg.jpg</div></div>
</div>
```

The block class is exactly `section-metadata` (kebab-case, one token).
`[verified]` from `toBlockCSSClassNames` in `da-nx/nx/utils/converters.js`
applied to the table-form header `"Section Metadata"`.

Alternate (table) form — equivalent, accepted when imported from
Word/Google-docs flows:

```html
<table>
  <tr><td>Section Metadata</td></tr>
  <tr><td>Style</td><td>dark, center</td></tr>
  <tr><td>Background</td><td>https://content.da.live/{org}/{repo}/media/bg.jpg</td></tr>
</table>
```

### Processing rules

- The `Style` property's value becomes additional CSS classes on the
  section `<div>` (comma-separated → separate classes). `[verified]`
- All other key/value rows become `data-*` attributes on the section.
  Key lowercased. `[verified]`
- No project code required — handled by the boilerplate's
  `decorateSections()`. `[verified]`

### Placement

Section Metadata must be inside the section it targets. The section is
determined by which `<div>` (inside `<main>`) the block sits inside.
Placing a Section Metadata block in the wrong section silently applies
the styles to the wrong section. `[verified]`

### URL values in data attributes

When a Section Metadata value is consumed by block JS or CSS as an asset URL
(e.g., `data-background` used as `background-image: url(...)`), the same
full-URL rule from §9 applies — use `https://content.da.live/...` or an
external URL, never a repo-relative path. The pipeline does not rewrite
data-attribute values. `[verified]`

### HTML output example

For either form above inside a section, the section `<div>` becomes:

```html
<div class="section dark center" data-background="https://content.da.live/{org}/{repo}/media/bg.jpg">
  <!-- section contents -->
</div>
```

## 5. Page Metadata block

A single block placed as the **last element of the last section inside
`<main>`**. Maps to `<head>` meta tags at delivery. Do not place it inside
`<footer>` — `<footer>` is typically empty (see §1). `[verified]`

Canonical (div) form:

```html
<div class="metadata">
  <div><div>title</div><div>My Page Title</div></div>
  <div><div>description</div><div>Page summary</div></div>
  <div><div>image</div><div><img src="https://content.da.live/{org}/{repo}/media/og.png"></div></div>
  <div><div>template</div><div>article</div></div>
  <div><div>theme</div><div>dark</div></div>
  <div><div>og:title</div><div>OG Title</div></div>
  <div><div>robots</div><div>noindex</div></div>
  <div><div>canonical</div><div>https://example.com/canonical-url</div></div>
</div>
```

The block class must be exactly `metadata` (single token, lowercase).
Misspelled class (`meta-data`, `metadatas`, missing class) → not
recognized → no `<meta>` tags emitted. `[verified]`

Alternate (table) form — equivalent:

```html
<table>
  <tr><td>Metadata</td></tr>
  <tr><td>title</td><td>My Page Title</td></tr>
  <tr><td>description</td><td>Page summary</td></tr>
  <tr><td>image</td><td><img src="https://content.da.live/{org}/{repo}/media/og.png"></td></tr>
  <tr><td>template</td><td>article</td></tr>
  <tr><td>theme</td><td>dark</td></tr>
  <tr><td>og:title</td><td>OG Title</td></tr>
  <tr><td>robots</td><td>noindex</td></tr>
  <tr><td>canonical</td><td>https://example.com/canonical-url</td></tr>
</table>
```

### Recognized keys

| Key | Output |
|---|---|
| `title` | `<title>` + `<meta name="title">` + `og:title` + `twitter:title` |
| `description` | `<meta name="description">` + `og:description` + `twitter:description` |
| `image` | `og:image` + `og:image:secure_url` + `twitter:image` |
| `author` | `<meta name="author">` |
| `keywords` | `<meta name="keywords">` |
| `robots` | `<meta name="robots">` (values: `noindex`, `nofollow`, `all`) |
| `canonical` | `<link rel="canonical">` |
| `template` | CSS class on `<body>` (triggers auto-blocking) |
| `theme` | CSS class on `<body>` |
| `og:*`, `twitter:*` | `<meta property="...">` |
| any other | `<meta name="<lowercased-key>" content="...">` |

`[verified]` from EDS docs.

### Rules

- Only one Metadata block per page. `[verified]`
- **Div form:** block class must be exactly `metadata` (single token).
  **Table form:** header text must be exactly `Metadata` (case-insensitive).
  Misspellings (`meta-data` / `Meta Data`, `metadatas` / `Metadata:`,
  `metadat` / `Metadat`) are silently ignored — no `<meta>` tags emitted.
  `[verified]`
- Page-level metadata overrides bulk metadata. `[verified]`
- Empty right column removes the corresponding tag (useful for clearing
  canonical on specific pages). `[verified]`

### Placement

Conventionally last in the document. `[verified]` from EDS docs. Some
projects place it at the top — both work, but consistency matters for
authoring tooling.

## 6. Default content

Default content is anything outside a block — standard document
elements that render as themselves: headings, paragraphs, lists, links,
images, inline formatting.

Use default content as much as possible. Blocks are heavier (structured
markup, block JS, dedicated CSS). Prefer default content for any content
that doesn't need a custom layout or behavior. `[verified]` from EDS
authoring docs.

### Allowed elements

| Tag | Notes |
|---|---|
| `<h1>` through `<h6>` | IDs auto-generated from text. `[verified]` |
| `<p>` | Standard paragraph. |
| `<ul>`, `<ol>`, `<li>` | Standard lists. |
| `<a href="...">` | Full URLs (§8). |
| `<img src="...">` | Full URLs (§9). |
| `<strong>`, `<em>` | Bold / italic. Trigger button promotion on standalone links (§8). |
| `<code>` | Inline code. |
| `<sub>`, `<sup>` | Subscript / superscript. |
| `<u>`, `<s>` | Underline / strikethrough. |
| `<br>` | Line break. |

### Heading anchor IDs

Heading IDs are auto-generated by `decorateMain`. The algorithm:

1. Lowercase the heading text
2. Replace spaces with hyphens
3. Strip non-alphanumeric (except hyphens)

"Our History" → `id="our-history"` → linkable as `/page#our-history`.
`[verified]` from `aem.js`.

Authors should NOT manually add `id=` attributes — they are stripped and
regenerated. `[verified]`

## 7. Icons

In **DA HTML uploads**, icons are represented as:

```html
<span class="icon icon-<name>"></span>
```

`[verified]` from EDS `decorateIcons` source.

The colon-notation `:iconname:` form is what authors type in the DA editor
(or in Google Docs / Word) — the editor converts it to the `<span>` form
on save. When generating HTML programmatically, emit the `<span>` form
directly. `[verified]`

### SVG resolution

At delivery, `decorateIcons(element)` finds every `<span class="icon icon-X">`
and:

1. Fetches `/icons/<name>.svg` from the project's Code Bus.
2. Inlines the SVG content into the span (or sets `<img>` with the SVG as
   src, depending on the boilerplate variant).

`[verified]` from `aem.js`.

### Icon location options

Icons can live in two places:

- **Code Bus** (`/icons/<name>.svg` in the GitHub repo) — managed by
  developers, deployed via git. The default.
- **DA `/media`** (any path) — referenced via a full
  `https://content.da.live/...` URL in CSS or via `<img>` inside the icon
  span. See [media.md §2.3](./media.md) for the `/media` storage pattern
  and [media.md §5.1](./media.md) for the 40 KB SVG cap.

For static SVG icons under 40 KB, Code Bus is simpler. For authored icons
that need to change without code deploys, DA `/media` is the right choice.

## 8. Links

### URL form

`<a href>` accepts:

- Full external URLs (`https://other-host.com/path`) — preserved as-is.
- Full preview/live URLs (`https://main--repo--owner.aem.page/path`,
  `.aem.live/path`) — auto-rewritten to relative paths at render time.
  `[verified]`
- Full DA content URLs (`https://content.da.live/{org}/{repo}/path`) —
  serve directly. Use sparingly for in-page navigation; prefer the
  `aem.page` / `aem.live` form for branch independence at delivery.

### Discouraged forms (links only — for images see §9)

- Repo-relative paths without a host (`/path/to/page`) — these work in
  DA HTML for same-site links, but the pipeline rewrites `aem.page`-form
  URLs to relative anyway, so it's simpler and more copy-paste-friendly
  to use the full form.

### Forbidden forms

- Document-relative paths (`./page`, `../page`) — resolve against the
  editor URL (`da.live/edit#/...`), break in production. `[verified]`

### Heading anchors

Link to a heading via `#<auto-generated-id>` (see §6 for the algorithm).

```html
<a href="https://main--repo--owner.aem.page/about-us#our-history">Our history</a>
```

The pipeline rewrites this to `/about-us#our-history` at delivery.
`[verified]`

### Button promotion

A link becomes a styled button when it's the **only content of its
paragraph** (a "standalone" link). `[verified]` from `decorateButtons` source.

```html
<!-- Plain link inside text — stays a regular <a>: -->
<p>Read more in <a href="...">our blog</a> today.</p>

<!-- Standalone link — becomes a button: -->
<p><a href="...">Read the blog</a></p>

<!-- With <strong> — becomes a primary button: -->
<p><strong><a href="...">Get started</a></strong></p>

<!-- With <em> — becomes a secondary button: -->
<p><em><a href="...">Learn more</a></em></p>
```

The wrapping `<p>` becomes `class="button-container"`; the `<a>` becomes
`class="button"` (with `primary` or `secondary` modifier classes). All
applied by `decorateButtons` at delivery. `[verified]`

### External link `target="_blank"`

The boilerplate's `decorateExternalLinks()` adds `target="_blank"` to
links pointing to domains other than the current host. `[verified]`
Authors should NOT manually add `target="_blank"` — let decoration handle it.

## 9. Images in HTML

The single most common silent failure in programmatic HTML generation:
incorrect image URLs.

### Required URL form

Every `<img src>`, `<source src>`, and `<video><source src>` in a DA-uploaded
document MUST be a full URL. `[verified]`

Acceptable hosts:

| Host | Use case | Notes |
|---|---|---|
| `https://content.da.live/{org}/{repo}/<path>` | Preferred — branch-independent | Always the latest uploaded version |
| `https://{branch}--{repo}--{owner}.aem.page/<path>` | Works — branch-locked | Avoid except for cross-branch references |
| `https://other-host.com/<path>` | External image | Preserved as-is; EDS will not copy it locally |

### Forbidden URL forms

These render as `<img src="about:error">` and produce broken images on
delivery:

| Form | Why |
|---|---|
| Repo-relative paths (`/path/foo.png`) | The pipeline cannot resolve them against an authoritative root. `[verified]` from EDS docs. |
| Document-relative paths (`./foo.png`, `../foo.png`) | Resolve against the editor URL, which doesn't host content. `[verified]` |
| Editor-relative paths | Same problem. `[verified]` |

### Image must exist before HTML references it

The referenced binary must already be uploaded to DA when the HTML
document is uploaded. Upload binaries first, then the HTML.

For storage patterns (DAM, dot-folder, `/media`), supported formats, size
limits, and the Source API call to upload binaries, see
[media.md](./media.md).

### Author a simple `<img>` — pipeline auto-generates `<picture>`

EDS auto-transforms `<img>` into a responsive `<picture>` element at
delivery:

```html
<!-- Authored in DA -->
<img src="https://content.da.live/{org}/{repo}/media/hero.png" alt="Hero">

<!-- Rendered by aem.page -->
<picture>
  <source type="image/webp" srcset="./media_<hash>.png?width=2000&format=webply&optimize=medium"
          media="(min-width: 600px)">
  <source type="image/webp" srcset="./media_<hash>.png?width=750&format=webply&optimize=medium">
  <source type="image/png" srcset="./media_<hash>.png?width=2000&format=png&optimize=medium"
          media="(min-width: 600px)">
  <img loading="lazy"
       decoding="async"
       src="./media_<hash>.png?width=750&format=png&optimize=medium"
       width="..." height="..." alt="Hero">
</picture>
```

The transformation:

- Generates 750px (mobile) + 2000px (desktop) variants.
- Generates WebP variants alongside the source format.
- Adds `loading="lazy"`, `decoding="async"`, computed `width`/`height`.
- Strips authored `width`/`height` (the pipeline computes them from
  delivered variant dimensions).

`[verified]` from EDS pipeline docs.

### Author `<picture>` only to override defaults

Author a `<picture>` element directly only when you need to override the
pipeline defaults (e.g., explicit art direction). The pipeline preserves
authored `<source>` elements and adds its own as fallbacks.

```html
<picture>
  <source media="(min-width: 1000px)"
          srcset="https://content.da.live/{org}/{repo}/media/hero-desktop.png">
  <img src="https://content.da.live/{org}/{repo}/media/hero-mobile.png" alt="Hero">
</picture>
```

### Required `alt` attribute

Always include `alt`. Empty `alt=""` is acceptable only for decorative
images. The pipeline preserves authored `alt` on the fallback `<img>`.
`[verified]`

## 10. Encoding and forbidden constructs

### Character encoding

- Source must be UTF-8 clean. `[verified]` from `da-admin`
  `normalizeCharset()`.
- The DA Source API strips `charset=` parameters from `Content-Type`
  headers (e.g., `text/html; charset=utf-8` becomes `text/html`). Don't
  rely on the charset parameter — ensure the bytes are UTF-8 before upload.
  `[verified]`

### Forbidden tags

| Tag | Why |
|---|---|
| `<script>` | Stripped by pipeline. `[verified]` |
| `<style>` | Stripped by pipeline. `[verified]` |
| `<iframe>` | Allowed for specific block use cases (e.g., embed blocks) but generally stripped from default content. `[assumed]` |
| `<form>`, `<input>`, `<button>` | Forms work via specific block patterns, not as default content. `[assumed]` |
| `<link>`, `<meta>` outside the Page Metadata block | Stripped; use Page Metadata (§5). `[assumed]` |

### Forbidden attributes

| Attribute | Why |
|---|---|
| `style="..."` | Stripped on ingestion. `[verified]` |
| `class="..."` on default content | Set by decoration. `[verified]` |
| `id="..."` on headings | Auto-generated. `[verified]` |
| `on*` event handlers | Stripped. `[verified]` |

### Whitespace handling

ProseMirror (DA's editor schema) is strict about whitespace:

- No stray text nodes between `<tr>` and `<td>`.
- No mixed whitespace inside `<table>` elements.
- Consistent `<tbody>` use (either always wrap rows in `<tbody>` or never;
  don't mix). `[verified]` from `da-live` source.

When generating HTML programmatically, emit a clean DOM with no whitespace
between structural elements inside tables.

### Restore-point threshold

A document body under 83 bytes triggers DA's automatic restore-point
capture before overwriting. `[verified]` from `da-admin` source. This is
protective behavior — empty / near-empty writes preserve the previous
content as a recoverable version. Means a "delete content" write is
distinguishable from a "small page" write.

## 11. Upload handoff

The HTML you've generated per §1-§10 is uploaded via the DA Source API.
See [platform.md §2](./platform.md) for the full contract: endpoint, headers,
the `multipart/form-data` requirement, the field name (`data`), the response
envelope, and IMS auth.

The minimal call shape:

```javascript
const blob = new Blob([htmlString], { type: 'text/html' });
const form = new FormData();
form.append('data', blob, 'document.html');

const url = `https://admin.da.live/source/${org}/${repo}/${path}.html`;
const res = await fetch(url, {
  method: 'PUT',
  headers: { Authorization: `Bearer ${token}` },
  body: form,
});
```

After upload, the document is staged but not visible at `aem.page`/`aem.live`.
Trigger preview/publish per [platform.md §6](./platform.md):

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  "https://admin.hlx.page/preview/{org}/{repo}/{branch}/{path-no-extension}"
```

### Ordering: binaries first, HTML second

If the HTML references images, videos, or other media via
`https://content.da.live/...` URLs, those binaries must already exist at
the referenced paths when the HTML is uploaded. Otherwise the document
will render but the references will resolve to 404s.

Upload order:

1. Upload all referenced binaries via the DA Source API (per
   [media.md](./media.md)).
2. Upload the HTML document via the DA Source API (§11 above).
3. Trigger preview for the document (binaries don't need preview).
4. Trigger publish for the document if going to production.
