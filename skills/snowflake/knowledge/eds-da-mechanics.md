# EDS and DA Mechanics — Verified Facts

Reference doc. What we've actually confirmed about how the platforms
work. Mark every entry as **[verified]** (we've read the code or
observed behavior) or **[assumed]** (we're inferring from documentation).
Promote assumed → verified as experiments confirm them.

## EDS — request to rendered page

### Initial HTML response
**[verified, from `head.html` + docs]** The HTML response for any EDS
page is composed by the pipeline:
1. `head.html` (from the EDS repo) is injected into `<head>`. In this
   project: a CSP meta, viewport, `aem.js`, `scripts.js`, `styles.css`.
2. Body comes from the content source (DA, Google Drive, SharePoint).
   For DA: the document HTML, with sections separated by horizontal
   rules and blocks rendered as `<div class="blockname">…</div>` trees.

### Scripts boot order
**[verified, from `head.html:7-8`]** Both `aem.js` and `scripts.js` load
as ES modules from `<head>`. `aem.js` defines the framework (RUM,
decorate*, loadFragment, etc.); `scripts.js` calls `loadPage()` which
runs `loadEager → loadLazy → loadDelayed`.

### loadEager (scripts/scripts.js:133)
**[verified]** Runs synchronously on page load. In the boilerplate:
- Sets `html.lang`
- `decorateTemplateAndTheme()` (reads `<meta>` template / theme classes)
- `decorateMain(main)`:
  - `decorateIcons` (replaces `span.icon` with `<img>`)
  - `buildAutoBlocks` (auto-injects hero block, processes fragment
    links — `scripts/scripts.js:50-75`)
  - `decorateSections` (`aem.js:457`) — wraps section children, applies
    section metadata as CSS classes, sets `display:none` on each section
  - `decorateBlocks` (`aem.js:585`) — calls `decorateBlock` on every
    `div.section > div > div` to add block-name class, `block` class,
    and dataset metadata
  - `decorateButtons` (links with `<strong>`/`<em>` formatting → button
    classes)
- Adds `appear` class to body → CSS shows body
- `loadSection(firstSection, waitForFirstImage)` — loads the first
  section's blocks and waits for hero image to complete

**Implication for our overlay:** the cleanest hook point is *between*
`decorateTemplateAndTheme` and `decorateMain` — we can take over the
DOM there, before sections are wrapped and hidden.

### loadLazy (scripts/scripts.js:157)
**[verified]** Loads `<header>` and `<footer>` blocks (which themselves
load `/nav` and `/footer` fragments via `loadFragment`), then loads
remaining sections, then `lazy-styles.css` and fonts.

### Fragment mechanism
**[verified, from `blocks/fragment/fragment.js:21-43`]**
`loadFragment(path)` does:
1. `fetch(\`${path}.plain.html\`)` — note the `.plain.html` suffix
2. Wraps response in a `<main>`, rebases media URLs
3. Runs `decorateMain` and `loadSections` on it
4. Returns the `<main>` element ready to inject

**Implication:** static fragments in the EDS repo, referenced by code
path, work the same way as DA-authored fragments. We just put HTML at
`fragments/header.html` in the repo and request `/fragments/header`.

### Body visibility
**[verified, from `aem.js:473` and CSS]** Each section gets
`display:none` during `decorateSections`. Body has the `appear` class
applied at the end of `loadEager`, which (via CSS) reveals it. Until
then, users see whatever pre-decoration painted — which the
`body { display:none }` rule in `styles.css` typically suppresses
entirely.

**Implication for overlay:** as long as our template+slot merge
completes before `body.appear`, there is **zero user-visible flicker**.

### Where authored blocks live in the raw HTML
**[verified, from EDS markup docs and `decorateBlocks`]** Before
decoration, a block authored as a table named "Hero" renders as:
```html
<main>
  <div>                           <!-- becomes section -->
    <div class="hero">            <!-- block container -->
      <div>                       <!-- row -->
        <div>cell 1 content</div>
        <div>cell 2 content</div>
      </div>
      <div>                       <!-- another row -->
        <div>…</div>
      </div>
    </div>
  </div>
</main>
```
The first class on a `main > div > div` element is treated as the
block name; rows and cells are `<div>` children.

**Implication:** our DA document can have one block table per
semantic block, with `slot-name | content` rows. Reading slot values
is `block.querySelectorAll(':scope > div')` then mapping cell pairs.

## DA — Document Authoring

### Storage model
**[verified, from team docs]** DA stores HTML files at
`https://admin.da.live/source/{org}/{repo}/{path}` (auth required).
The same content is publicly readable at
`https://content.da.live/{org}/{repo}/{path}` (no auth for image
types) and editable at `https://da.live/edit#/{org}/{repo}/{path}`
(auth required).

### Document shape — a body fragment, not a full HTML page
**[verified, from team docs]** A DA document is a body fragment:
```html
<body>
  <header></header>
  <main>
    <div>...</div>      <!-- one div per section -->
  </main>
  <footer></footer>
</body>
```
No `<!DOCTYPE>`, no `<html>`, no `<head>`. Sections inside `<main>`
are separated by `<div>` boundaries. Blocks are `<table>`s with a
header row carrying the block name + options. The footer typically
holds a Metadata table that the pipeline expands into `<meta>` tags
in the rendered page's `<head>`.

### Admin API — source endpoints
**[verified, from team docs]**

| Verb     | Pattern                                                                  | Notes                                        |
|----------|--------------------------------------------------------------------------|----------------------------------------------|
| GET      | `https://admin.da.live/source/{org}/{repo}/{path}.html`                  | Read source HTML; auth via IMS bearer token. |
| PUT      | `https://admin.da.live/source/{org}/{repo}/{path}.html`                  | Write/overwrite. Body is the DA HTML doc.    |
| DELETE   | `https://admin.da.live/source/{org}/{repo}/{path}.html`                  | Remove.                                      |
| PUT      | `https://admin.da.live/source/{org}/{repo}/{path-to-image}`              | Image upload; body is `multipart/form-data` with field `data`. Returns 201 with `{source: {editUrl, contentUrl}, aem: {previewUrl, liveUrl}}`. |

Read-only public delivery (no auth for image types) is at
`https://content.da.live/{org}/{repo}/{path}`.

### Image storage — three patterns
**[verified, from team docs +
[docs.da.live/authors/guides/adding-media](https://docs.da.live/authors/guides/adding-media)]**

| Pattern                       | Where binaries live                  | Reference URL                                                       | Use case                                     |
|-------------------------------|--------------------------------------|---------------------------------------------------------------------|----------------------------------------------|
| **AEM Assets**                | External AEMaaCS DAM                 | AEM-managed                                                         | Curated/governed assets; requires AEMaaCS.   |
| **Drag-and-drop dot-folder**  | `/{parent}/.{docname}/<file>`        | `https://content.da.live/{org}/{repo}/{parent}/.{docname}/<file>`   | Author drops image into a doc; per-doc.      |
| **`/media` shared folder**    | `/media/<file>` (any depth allowed)  | `https://content.da.live/{org}/{repo}/media/<file>`                 | Reused across docs / branches / iterations.  |

The dot-folder pattern is what the DA editor produces when an author
drags an image in; it's per-document and uses absolute
`content.da.live` URLs. Relative paths like `./assets/img.png`
resolve against the editor URL (which doesn't host content), so they
break in the editor view.

The `/media` shared pattern works equivalently via direct PUT:
`https://admin.da.live/source/{org}/{repo}/media/<file>` auto-creates
the folder if missing. The asset is content-addressed in EDS's Media
Bus (same `media_<sha>.<ext>` URL across branches once previewed),
so it's branch-independent and dedupes naturally.

For migration-driven runs in this project, prefer
`/media/<site-slug>/<filename>` so images don't collide across
projects.

### `aem content` CLI — git-style workflow
**[verified, from team docs]**
```bash
aem content clone --path /        # auth via browser, pulls into ./content/
aem content add <files>           # stage
aem content commit -m "..."       # local commit
aem content push [--force]        # upload to DA
aem content status / diff / merge # inspect / sync
```
Auth token cached at `.hlx/.da-token.json` (gitignored). We can read
it from there to authorize direct PUTs:
```bash
TOKEN=$(jq -r .access_token .hlx/.da-token.json)
```

### Preview + publish — required step, separate from push
**[verified, from team docs]** `aem content push` (or a direct PUT
to `admin.da.live/source/...`) only stages drafts in DA's
source/content endpoints. The page does **not** appear at
`aem.page` or `aem.live` URLs until you explicitly *preview*
(makes `aem.page` work) and *publish* (makes `aem.live` work):
```bash
TOKEN=$(jq -r .access_token .hlx/.da-token.json)
curl -X POST -H "Authorization: Bearer $TOKEN" \
  "https://admin.hlx.page/preview/{owner}/{repo}/{branch}/{path}"
curl -X POST -H "Authorization: Bearer $TOKEN" \
  "https://admin.hlx.page/live/{owner}/{repo}/{branch}/{path}"
```
`{path}` matches the DA-stored content path **without** the `.html`
extension. Index pages can use trailing `/`. `{branch}` matches the
GitHub branch (so the previewed page is reachable at
`https://{branch}--{repo}--{owner}.aem.page/{path}`).

### Media format & size limits
**[verified, from team docs +
[aem.live/docs/limits](https://www.aem.live/docs/limits),
[aem.live/docs/media](https://www.aem.live/docs/media)]**

Supported types via Content Bus + Media Bus: HTML (extensionless),
JSON, MP4, PDF, SVG, JPG/JPEG, PNG, AVIF, WEBP. Anything else needs
Code Bus or 3rd-party hosting.

Per-file caps:

| Type            | Max   | Notes                                                       |
|-----------------|-------|-------------------------------------------------------------|
| PNG / JPG / AVIF| 20 MB | per file                                                    |
| **SVG**         | **40 KB** | tight — complex illustrations often exceed              |
| WEBP            | (docs: "no upload"; empirically works) | rename will fail — type is sniffed |
| MP4             | 36 MB | short videos only; long-form → AEM Assets / streaming       |
| PDF             | 20 MB |                                                             |
| Favicon `.ico`  | 16 KB |                                                             |

Other limits worth knowing:
- Default image delivery generates 750px (mobile) + 2000px (desktop)
  variants in webp + the original format.
- EDS doesn't upscale beyond source dimensions.
- Recommended max source: 2000×2000 px.
- Path: lowercase `a-z`, digits, dashes only. Max 900 chars.
- Response payload: 6 MB compressed.
- Rate limit: 200 req/sec per IP per hostname.
- Pages per site: 1 M. Files per Code Bus ref: 500.

### Structured content delivery (form-based)
**[verified, from docs.da.live]** Pages defined by a JSON Schema
(form-based authoring) are delivered as JSON at
`https://da-sc.adobeaem.workers.dev/<env>/<org>/<site>/<path>`. This
is a separate mechanism from regular HTML delivery — likely not what
we want for the overlay, since we *want* HTML output that EDS can
serve directly.

### MCP server
**[verified, from da.live docs]** A hosted MCP server exists at
`https://mcp.adobeaemcloud.com/adobe/mcp/da` for programmatic access.
Handles IMS auth automatically. Useful as an alternative to direct
admin-API PUTs.

## Cross-cutting

### `.plain.html` suffix
**[verified, from `fragment.js:23`]** Appending `.plain.html` to any
page URL on an EDS site returns the raw HTML body (sections + blocks)
*without* the decoration scripts, `<head>`, etc. This is what
`loadFragment` uses, and it's how we'll fetch templates at runtime
(or directly: HTML files in the repo are served as-is).

### `.hlxignore`
**[verified, this repo]** Same syntax as `.gitignore`; matched paths
are not delivered by EDS. Our `experiments/*` entry keeps experiment
artifacts off the public site.

### `head.html` size budget
**[assumed, per keeping-it-100 docs]** Aggregate resources before LCP
should stay under 100 KB to keep Lighthouse at 100. Our overlay adds
one template fetch per page load — needs measurement.

### Dev server: `aem up --html-folder drafts` serves verbatim
**[verified, run #001]** The local dev server does **not** run the
EDS pipeline on drafts content. Tables stay as tables, `head.html`
is not injected, metadata-block → `<meta>` conversion doesn't
happen. Drafts is for *raw post-pipeline content*, not DA-shape
content. Practical implication: when round-tripping locally, the
DA doc must be pre-transformed to post-pipeline shape (see
`experiments/projects/001-.../output/transform-da-to-eds.mjs`).

### `/templates/<name>.html` served as raw HTML by EDS code bus
**[verified, run #001]** Putting `templates/home.html` in the repo
makes it fetchable at `/templates/home.html` with no decoration —
the EDS pipeline only decorates *content* (DA / Word / GDrive
backends), not arbitrary code-bus files. A plain `fetch()` returns
the file's bytes verbatim. Same applies to `/fragments/*.html`.

### `header-wrapper` / `footer-wrapper` lifecycle classes
**[verified, run #001]** EDS's `loadHeader` / `loadFooter` wrap the
async-loaded fragment content in `<div class="header-wrapper">` /
`<div class="footer-wrapper">`. The original page's header/footer
markup ends up nested inside that wrapper. CSS class selectors keep
working; CSS `body > .gnav` direct-child selectors would NOT.

### `body { display: none } / body.appear { display: block }`
**[verified, run #001]** This pair, in `styles/styles.css`, is the
EDS no-flicker contract. The body is hidden until `scripts.js`
adds the `appear` class at the end of `loadEager`. Our overlay
runs inside `loadEager` so the user never sees the
pre-overlay (EDS-shape) DOM.

## Things to verify still

- [x] ~~Exact DA admin source API URL, auth headers, response shape~~
      — answered by team docs (see Admin API section above).
- [x] ~~Confirm Admin API source PUT accepts multipart/form-data~~
      — verified 2026-05-18: HTTP 200 with `-F "data=@file.html;type=text/html"`
      returns JSON with `{source: {editUrl, contentUrl}, aem: {previewUrl, liveUrl}}`.
- [x] ~~Whether DA preserves table-format source on PUT~~
      — verified 2026-05-18: yes, what you PUT is what's GET-able.
      Tables stay tables. The table → div conversion happens
      at pipeline-render time, not in DA's storage.
- [ ] Whether the production `.aem.page` pipeline correctly
      processes our DA doc (Metadata block → `<meta>` tags, etc.).
      Requires preview API call + code-deploy first.
- [ ] Performance impact of an extra fetch in `loadEager` —
      need Lighthouse run against the production preview URL.
- [ ] How `<meta name="template">` round-trips through DA — is the
      meta authored as a metadata block, and does it land in `<head>`
      as expected?
- [ ] Whether stripping authored content from a block table (leaving
      only slot keys with no cells) is a problem for DA's editor.
- [ ] Whether the `<header><p>Title</p></header>` shape in our DA doc
      is correct, or whether the title should live exclusively in the
      Metadata table (team docs example shows empty `<header>`).
