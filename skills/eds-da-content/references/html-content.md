# DA HTML content reference

How to generate HTML that DA will accept and EDS will render correctly.
Covers the document skeleton, block table format, section structure,
page and section metadata blocks, default content, icons, links, image
references, and the encoding / forbidden constructs.

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

## 3. Block tables

A block is an HTML `<table>` where the first row is a single merged cell
containing the block name. `[verified]` from EDS markup docs.

```html
<table>
  <tr><td>Block Name</td></tr>        <!-- merged header = block identifier -->
  <tr>
    <td>cell 1</td>
    <td>cell 2</td>
  </tr>
  <tr>
    <td>cell 3</td>
    <td>cell 4</td>
  </tr>
</table>
```

### Block name normalization

The header cell text is normalized via `toClassName()` (`aem.js`):

1. Convert to lowercase
2. Replace spaces with hyphens
3. Replace non-alphanumeric characters with hyphens
4. Collapse multiple consecutive hyphens to one
5. Trim leading/trailing hyphens

| Header text | Normalized name | File path |
|---|---|---|
| `Columns` | `columns` | `blocks/columns/columns.{js,css}` |
| `Hero Banner` | `hero-banner` | `blocks/hero-banner/hero-banner.{js,css}` |
| `My  Block!` | `my-block` | `blocks/my-block/my-block.{js,css}` |

`[verified]` from `aem.js` source.

### Block name constraints

- Alphanumeric and single hyphens only.
- No underscores. `[verified]`
- No double dashes. `[verified]`
- Cannot start with a digit. `[verified]`

Valid: `hero`, `columns`, `super-hero`
Invalid: `hero_wide`, `hero--wide`, `2col`

### Block variants / options

Options in parentheses after the block name become additional CSS classes:

| Header text | Resulting classes |
|---|---|
| `Columns` | `columns block` |
| `Columns (wide)` | `columns wide block` |
| `Columns (super wide)` | `columns super-wide block` (multi-word: hyphenated) |
| `Columns (dark, wide)` | `columns dark wide block` (comma-separated: separate classes) |

`[verified]` from EDS markup docs.

### DOM output after decoration

```html
<!-- Authored in DA (table form) -->
<table>
  <tr><td>Hero</td></tr>
  <tr><td><h1>Title</h1><p>Subtitle</p></td></tr>
</table>

<!-- Rendered by aem.page (decorated div form) -->
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

Each row becomes an inner `<div>`. Each cell within a row becomes a nested
`<div>`. `[verified]` from `aem.js` `decorateBlock`.

### Forbidden patterns

These render as plain HTML tables (silent failure — the block JS never
loads):

| Pattern | Why it breaks |
|---|---|
| First row NOT merged into a single cell | EDS treats the table as plain HTML. `[verified]` |
| Empty header cell | No block name → not recognized as a block. `[verified]` |
| Nested `<table>` inside a block cell | EDS doesn't support nested blocks; the inner table renders as plain HTML. `[verified]` |
| Missing `<tbody>` | Some HTML generators omit `<tbody>`; DA's ProseMirror schema is strict. Use `<table><tr>...</tr></table>` consistently or always wrap in `<tbody>`. `[verified]` from `da-live` source. |
| Stray text nodes between `<tr>` / `<td>` | ProseMirror parse failure. Output clean HTML with no whitespace text nodes. `[verified]` |

### Max cells per row

Four cells per row maximum. `[verified]` from Adobe's Experience
Modernization Agent prompting guide. Exceeding this is not a hard
parse failure but breaks the common block JS patterns that assume
≤4 columns.
