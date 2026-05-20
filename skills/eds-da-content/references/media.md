# DA media — binaries reference

How DA handles images, SVGs, video, PDF, fonts, and other binary assets:
storage patterns, upload paths, supported formats, size limits, the
delivery model, and how authored HTML references uploaded media.

For the Source API contract, IMS auth, retry policy, and URL reference
card, see [platform.md](./platform.md). For how HTML documents reference
the media described here, see [html-content.md](./html-content.md).

Every factual claim is tagged `[verified]` (read from code or observed
empirically) or `[assumed]` (inferred from documentation without direct
verification).

---

## 1. Storage model (recap)

DA stores both content (HTML) and binaries under
`{org}/{repo}/<path>`. The four hostnames and the Source API are documented
in [platform.md §1](./platform.md). What's relevant here: every binary is
addressed by a path under that namespace, served at `content.da.live`, and
optionally rendered through the EDS pipeline at `aem.page` / `aem.live`.

---

## 2. Three media-storage patterns

DA officially documents three patterns for where media binaries can live. Each fits a different use case. The choice has practical consequences for deduplication, branch-coupling, and authoring UX.

| Pattern | Where binaries live | Reference URL | Use case |
|---|---|---|---|
| **AEM Assets DAM** | External Adobe Experience Manager DAM (AEMaaCS) | AEM-managed URLs | Curated/governed assets, requires AEMaaCS |
| **Drag-and-drop dot-folders** | `/{parent}/.{docname}/<file>` | `https://content.da.live/{org}/{repo}/{parent}/.{docname}/<file>` | Per-document author uploads via the DA editor |
| **`/media` shared folder** | `/media/<anything>/<file>` (any depth) | `https://content.da.live/{org}/{repo}/media/<anything>/<file>` | Shared across documents, branches, or iterations |

### 2.1 AEM Assets DAM

When the consuming org runs AEM as a Cloud Service (AEMaaCS) with a DAM, assets can live in the DAM rather than DA itself. The DA Source API does **not** write here — AEMaaCS has its own ingestion path (Assets HTTP API, Asset Sync, etc.). Documents reference DAM assets via their AEM-managed URLs.

Use when:

- The org already curates assets in a DAM.
- Asset governance (rights, versioning, metadata) matters.
- Assets need to be reusable across multiple Adobe products beyond DA.

Out of scope for orgs without AEMaaCS.

### 2.2 Drag-and-drop dot-folders (per-document)

DA's web editor at `da.live/edit#/{org}/{repo}/<path>` lets authors drag images directly into a document. The editor uploads to a dot-prefixed folder named after the document. The naming is mechanical:

```
URL pattern used by DA's editor:
  https://admin.da.live/source/{org}/{repo}/{parent}/.{docname}/<filename>
```

So for a document at `/marketing/launch.html`, an author drag-drop of `hero.png` lands at `/marketing/.launch/hero.png`. The dot-prefix prevents the folder from being treated as a sibling document.

The document references the upload via an absolute `content.da.live` URL:

```html
<img src="https://content.da.live/{org}/{repo}/marketing/.launch/hero.png" alt="…">
```

**Important constraint:** relative paths (`./assets/hero.png`) resolve against the editor URL (`da.live/edit#/…`) — which does not host content. Authors who try to type a relative path will see broken images in the editor preview AND in deployed pages.

Use when:

- An author uploads an image for a single document.
- The image is not expected to be reused elsewhere.
- Per-document isolation is desirable (renaming the document doesn't accidentally break shared references — but it does break the doc's own references).

Avoid when:

- The same image will be referenced from multiple documents (each document would get its own copy).
- Uploads are scripted / migration-driven (the editor workflow isn't applicable; the result has worse dedup behavior than `/media`).

### 2.3 `/media` shared folder

DA supports a top-level `/media` folder for assets that need to be reused across documents, branches, or migration iterations. Per the official DA docs:

> "Simply create a top-level folder called 'media' and upload your content into it."

Empirically: a direct PUT to `https://admin.da.live/source/{org}/{repo}/media/<file>` auto-creates the `/media` folder if missing. Subfolders work too — `/media/<arbitrary>/<more>/<file>` is fine, any depth.

The asset is served at `https://content.da.live/{org}/{repo}/media/<file>` with no auth (for image content types) and is **branch-independent** — the same DA path is reachable from any branch's `aem.page` host once that branch has been previewed.

Use when:

- The asset is shared across multiple documents.
- The asset should survive document renames / moves.
- Migration scripts upload assets in bulk.
- Cross-branch / cross-iteration referencing matters.

This is the recommended pattern for any non-trivial volume of media.

---

## 3. The four upload paths

DA accepts media via four different mechanisms. Each has different ergonomics and different limits.

### 3.1 The DA Source API (HTTP PUT)

The canonical write endpoint for binaries. Same multipart `data`-field
contract as for HTML documents — see [platform.md §2](./platform.md) for
the full request/response shape, headers, and the minimal Node example.

For binaries specifically: the path determines the storage pattern (§2),
the file extension determines the MIME type sniffed at delivery (§4.2),
and the file size must fit the per-type cap (§5.1).

### 3.2 The DA web editor

DA's editor UI at `https://da.live/edit#/{org}/{repo}/<path>` accepts drag-and-drop file uploads. Behind the scenes, the editor calls the Source API (§3.1) with a path constructed per §2.2.

The editor surface adds some UX behaviors:

- Drag-drop targets the document's dot-folder.
- The editor may refuse some file types (e.g., the UI commonly refuses `.webp` even though the Source API accepts it — see §4.4).
- Pasted media from the clipboard is uploaded the same way.
- The editor's "browse media" workflow lets an author find and copy an existing `/media`-folder URL into a document.

For programmatic uploads, prefer the Source API. The editor is for authors.

### 3.3 The `aem content` CLI (`@adobe/aem-cli`)

The CLI provides a git-style workflow for managing DA content as a local workspace:

```bash
npx -y @adobe/aem-cli content clone --path /<subpath>  # pull DA → ./content/
aem content add <files>                                # stage
aem content commit -m "..."                            # local commit
aem content push [--force]                             # upload to DA
aem content status / diff / merge                      # inspect / sync
```

Auth is browser-based on first run; the resulting token is cached at `.hlx/.da-token.json` (which should be gitignored).

**Critical limitation: `aem content push` does NOT reliably upload binary files.** The command was designed for HTML content. It reports success (`0 files pushed` or similar) but the binary often does not actually land. Verify with `curl -sI <expected-url>`; if the upload didn't happen, fall back to the Source API (§3.1) directly.

This is a known bug and may be fixed in future CLI versions. Until then, treat the CLI as HTML-only and use the Source API for binaries.

### 3.4 The Admin API (preview + publish)

The Admin API is not an upload path for binaries — it's the lifecycle controller for content documents. After binaries are uploaded via the Source API, they're immediately available at `content.da.live`. But content **documents** (HTML files) require explicit preview/publish to appear on `aem.page` / `aem.live`:

```
POST https://admin.hlx.page/preview/{org}/{repo}/{branch}/{path}
POST https://admin.hlx.page/live/{org}/{repo}/{branch}/{path}
```

`{path}` matches the DA-stored content path without the `.html` extension; index documents can use a trailing `/`. `{branch}` matches the GitHub branch the EDS deploy is tied to.

Binaries do not need preview/publish — they're delivered directly from `content.da.live` once uploaded. Only the documents that reference them need the lifecycle calls.

### 3.5 Auth token handling

All upload paths use the same IMS bearer token. Acquisition, expiry
handling, and the pre-flight check are documented in
[platform.md §3](./platform.md).

### 3.6 Retry policy

See [platform.md §4](./platform.md). DA Source endpoints are generally
robust; media-specific failures (413 payload too large, 415 unsupported
media) follow the same non-retry rule as other semantic 4xx.

---

## 4. Supported formats

DA accepts any file as a binary upload — the Source API does not police content type at upload. However, EDS only **delivers** a specific set of types through its server-side pipeline. Files outside this set need Code Bus delivery (which is git-tracked, not DA-tracked) or third-party hosting. [verified]

### 4.1 Supported content types (delivered by EDS)

| Type | Extensions | Delivery backend (§8) |
|---|---|---|
| Images: PNG | `.png` | Media Bus |
| Images: JPEG | `.jpg`, `.jpeg` | Media Bus |
| Images: AVIF | `.avif` | Media Bus |
| Images: WEBP | `.webp` | Media Bus |
| Images: SVG | `.svg` | Content Bus |
| Video: MP4 | `.mp4` | Media Bus |
| Document: PDF | `.pdf` | Content Bus |
| Document: HTML (extensionless) | (no extension) | Content Bus |
| Document: JSON | `.json` | Content Bus |
| Favicon: ICO | `.ico` | Content Bus |
| Font: WOFF2 | `.woff2` | Content Bus |

Anything outside this list (text files, ZIP archives, MP3 audio, OTF/TTF fonts, AVI/MOV video, etc.) may upload successfully to DA Source but won't be delivered through `aem.page` / `aem.live`. Use Code Bus (git-tracked) or external hosting.

### 4.2 MIME type detection

EDS sniffs the content type at delivery time. The detected type must match the file extension — a WEBP renamed to `.png`, or a JPEG renamed to `.png`, will not deliver. [verified]

Set the correct `Content-Type` on the multipart upload:

```js
const MIME = {
  '.png':  'image/png',
  '.jpg':  'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif':  'image/gif',
  '.mp4':  'video/mp4',
  '.pdf':  'application/pdf',
  '.json': 'application/json',
  '.ico':  'image/x-icon',
  '.woff2':'font/woff2',
};
function mimeOf(path) {
  const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
  return MIME[ext] || 'application/octet-stream';
}
```

If the source file is corrupted, has a wrong-extension copy, or is a transcoded variant with an incorrect header, validate before uploading: `file <path>` on macOS/Linux confirms the actual content type.

### 4.3 Image format choice

When you have a choice of upload format:

- **AVIF / WEBP** — smallest. EDS auto-generates both for PNG/JPG sources (see §8.2), so you usually don't need to upload these directly.
- **PNG** — best for graphics with sharp edges, transparency, limited color palettes. Lossless.
- **JPEG** — best for photographs and gradients. Lossy; trade-off file size vs. compression artifacts.
- **SVG** — best for vector illustrations, logos, icons. Hard 40 KB cap (§5).
- **GIF** — uploads, no responsive variants generated. Use only for legacy animated GIFs; prefer MP4 video.

The pipeline doesn't care which format you upload — it generates the responsive variants from any source. Upload the highest-quality source you have.

### 4.4 WEBP upload — empirical note

The official DA docs ([aem.live/docs/media](https://www.aem.live/docs/media)) state that WEBP "is not supported for upload." This refers to the **DA editor UI**, which refuses WEBP drag-drop. [verified]

The **DA Source API accepts WEBP**. Direct PUT works; the asset is delivered correctly and gets responsive variants. Migration scripts using the Source API can upload WEBP without re-encoding. [verified]

Don't waste cycles re-encoding existing WEBP assets to PNG just because the docs say so. Test once and confirm the rendered `<picture>` is correct; if it is, ship as WEBP.

### 4.5 Font files

WOFF2 is the canonical format. [verified] Upload via the Source API to a path like `/fonts/<family>-<weight>.woff2`. Reference from CSS via the absolute `content.da.live` URL or via Code Bus (`/fonts/`).

Self-hosted fonts that aren't WOFF2 (OTF, TTF, WOFF) won't deliver through DA. [verified] Convert to WOFF2 first, or host externally.

---

## 5. Size limits

EDS enforces per-file and aggregate limits at the delivery layer. These are operational constraints — exceeding them produces 4xx responses or silent delivery failures.

### 5.1 Per-file caps

| Type | Max size | Notes |
|---|---|---|
| PNG, JPG, AVIF, WEBP | 20 MB | Per file |
| **SVG** | **40 KB** | Tight — complex illustrations often exceed |
| MP4 | 36 MB | Short clips only; long-form needs a streaming CDN or AEMaaCS |
| PDF | 20 MB | |
| Favicon (`.ico`) | 16 KB | |
| WOFF2 | (Per file practical limit) | Default font subsets are typically well under 1 MB |

Source: [aem.live/docs/limits](https://www.aem.live/docs/limits). [verified]

**SVG 40 KB is the constraint that bites most.** Hand-authored multi-shape illustrations, especially those with embedded `<filter>` definitions, multi-stop gradients, or dozens of `<path>` shapes, frequently exceed 40 KB. Mitigations:

1. Optimize with [SVGO](https://github.com/svg/svgo) — aggressive `removeViewBox=false`, `mergePaths`, `removeUnknownsAndDefaults`.
2. Simplify path coordinates (reduce precision to 1–2 decimal places).
3. Replace embedded raster `<image>` elements (which inflate SVG size dramatically) with a separate raster file referenced by URL.
4. Rasterize the SVG to PNG/AVIF if the SVG is fundamentally illustrative rather than icon-shaped.

### 5.2 Image dimensions

EDS will not upscale beyond source dimensions. A 500 px source stays at most 500 px in any delivered variant — the responsive `srcset` will request larger widths, but the pipeline returns the source-resolution image. [verified]

- **Recommended max source dimension:** 2000 × 2000 px.
- **Practical minimum:** the largest display size you need. For a hero that renders at 1200 px wide on desktop with 2× retina, upload at least 2400 px wide.
- **Image format choice doesn't affect dimensions** — PNG/JPG/AVIF/WEBP all support 2000 × 2000 sources.

### 5.3 Aggregate / system limits

| Limit | Value |
|---|---|
| Pages per site | 1,000,000 |
| Files per Code Bus reference | 500 |
| Response payload (compressed) | 6 MB |
| Rate limit | 200 requests/sec per IP per hostname |

Source: aem.live/docs/limits. [verified]

For DA Source uploads specifically, the rate limit applies — high-concurrency upload scripts (>200 concurrent PUTs from a single IP) will see 429s and need backoff (§3.6).

---

## 6. Folder structure conventions

DA paths are arbitrary, but a few conventions make life easier.

### 6.1 The `/media` top-level folder

The single most useful convention. Use `/media/...` for binaries that aren't tied to one specific document. Examples:

```
/media/logo.svg                            # site-wide logo
/media/hero-banner.png                     # shared hero image
/media/<scope>/<file>                      # scoped subfolder per site, product line, etc.
/media/<scope>/<page>/<file>               # per-page scope when needed
/media/shared/<file>                       # cross-scope shared assets
```

Any depth is allowed. The folders auto-create on first PUT. [verified]

The convention `/media/<scope>/<file>` (one level of scoping) hits a sweet spot for medium-sized projects:

- Avoids root pollution (`/media/everything.png` × 10,000 isn't browseable).
- Avoids over-namespacing (`/media/<scope>/<page>/<module>/<file>` is verbose and makes truly shared assets awkward).
- Preserves provenance — you can tell from a URL where an asset came from.

### 6.2 Dot-folders (`/{parent}/.{docname}/`)

Reserved for the DA editor's drag-drop workflow (§2.2). Don't put scripted uploads here unless you specifically want per-document isolation.

A dot-folder for a document at `/blog/2024/launch.html` is `/blog/2024/.launch/`. The dot-prefix prevents collision with a sibling document of the same base name. [verified]

### 6.3 Document paths

Document paths are the same `/path/to/<name>` model, but the document file has no extension at the delivery layer:

- DA-stored: `/<path>/<name>.html` (extension is part of the storage path)
- Delivered: `https://{branch}--{repo}--{owner}.aem.page/<path>/<name>` (no extension)

[verified]

For index pages, the convention is a file at `/path/index.html` delivered at `/path/`.

### 6.4 Code Bus paths (not DA, but adjacent)

The deploying GitHub branch carries Code Bus assets — typically `/fonts/`, `/icons/`, `/blocks/`, `/scripts/`, `/styles/`, and `/head.html`. These are referenced via the same `aem.page` host as documents, but the bytes come from git, not from DA Source.

Code Bus and Content Bus serve different things:

- **Code Bus** — git-tracked files. Block JS, CSS, fonts, icons, configuration. Updated by code deploy.
- **Content Bus** — DA-tracked path-addressed content. SVGs uploaded to `/media`, PDFs, JSON, HTML documents. Updated by preview/publish.

[verified]

The two coexist on the same delivery host. A request to `/foo.svg` is served by whichever bus has it; conflict-resolution generally favors Content Bus for paths under `/media/`.

---

## 7. Path constraints

See [platform.md §5](./platform.md). The constraints apply equally to
content and binary paths.

---

## 8. Delivery model

Once a binary lives in DA Source, the EDS rendering pipeline serves it through one of two backends with very different behaviors. Understanding which backend serves which file types is critical for cache invalidation.

### 8.1 Media Bus vs Content Bus

| | Media Bus | Content Bus |
|---|---|---|
| **Used for** | PNG, JPG, AVIF, WEBP, MP4 | SVG, PDF, HTML, JSON, ICO, WOFF2 |
| **Naming** | Content-addressed (`media_<sha-256>.<ext>`) | Path-addressed (`/media/foo.svg`) |
| **Dedup** | Yes — one binary per content hash, regardless of how many docs reference it | No — every path is its own resource |
| **Cache** | Permanent (until content hash changes) | Follows preview/publish lifecycle |
| **Delivery** | Request `/path/foo.png` returns a 301 redirect to `/path/media_<sha>.png` | Direct path serves the file |

Practical consequences:

- **Replacing a PNG/JPG/AVIF/WEBP/MP4** generates a new content hash → every referencing document needs re-preview to pick up the new URL. The OLD path still resolves to the OLD hash via cached redirects. [verified]
- **Replacing an SVG/PDF/HTML/JSON** keeps the same path; the next preview/publish picks up the change.
- **Cross-branch sharing** — the same source `/media/<file>` deduplicates to ONE Media Bus entry across `main`, feature branches, and iterations. Same `media_<sha>.png` URL appears on every branch. [verified]

### 8.2 The `<picture>` transformation

When an HTML document references an image via a single `<img src="…">`, the EDS pipeline server-side rewrites it into a responsive `<picture>` element:

```html
<!-- Authored in DA -->
<img src="https://content.da.live/{org}/{repo}/media/hero.png">

<!-- Rendered by aem.page -->
<picture>
  <source type="image/webp" srcset="./media_<hash>.png?width=2000&format=webply&optimize=medium"
          media="(min-width: 600px)">
  <source type="image/webp" srcset="./media_<hash>.png?width=750&format=webply&optimize=medium">
  <source type="image/png"  srcset="./media_<hash>.png?width=2000&format=png&optimize=medium"
          media="(min-width: 600px)">
  <img loading="lazy"
       src="./media_<hash>.png?width=750&format=png&optimize=medium"
       width="1512" height="852">
</picture>
```

What the transformation does:

- Generates 750 px (mobile) + 2000 px (desktop) variants.
- Generates WEBP variants alongside the source format.
- Adds `loading="lazy"`, `decoding="async"`, and computed `width`/`height` attributes to the fallback `<img>`.
- Strips authored `width`/`height` (the pipeline computes them from delivered variant dimensions).

[verified]

The transformation only applies to HTML documents authored in DA and rendered through `aem.page` / `aem.live`. Direct `content.da.live` URLs serve the raw binary without transformation.

### 8.3 Repo-relative paths don't work from DA content

If a DA document contains `<img src="/path/to/foo.png">` (repo-relative), the EDS pipeline does **not** resolve this against the document's branch — it emits `<img src="about:error">`. [verified]

Acceptable URL forms in DA content:

- `https://content.da.live/{org}/{repo}/<path>` — preferred. Branch-independent.
- `https://{branch}--{repo}--{owner}.aem.page/<path>` — works, but branch-locked. Avoid.
- External URLs (`https://other-host.com/<path>`) — preserved as-is.

Not acceptable:

- Repo-relative paths (`/path/foo.png` without a host).
- Document-relative paths (`./foo.png`, `../foo.png`).
- Editor-relative paths (anything that would resolve against `da.live/edit#/…`).

If you need to reference a file that lives in Code Bus (git-tracked), use the full URL `https://{branch}--{repo}--{owner}.aem.page/<path>` — though again, this branch-locks the content.

This is the single most common silent failure when generating HTML
programmatically. See [html-content.md §9 (Images in HTML)](./html-content.md)
for the HTML-side rule that prevents it.

### 8.4 Cache invalidation

The DA delivery surface caches aggressively. After uploading or replacing a file:

- **Binary in Media Bus** (PNG/JPG/AVIF/WEBP/MP4): the new file gets a new hash. To make documents pick up the new hash, re-preview each referencing document. [verified]
- **Binary in Content Bus** (SVG/PDF/JSON/ICO/WOFF2): the path is stable. Trigger a preview if the file is referenced by a document that was previously rendered; otherwise the next request fetches the new version after Content Bus cache lifecycle. [verified]
- **HTML document**: preview → `aem.page`; publish → `aem.live`. Documents are not implicitly re-rendered when their referenced binaries change.

A common gotcha: replacing a PNG and re-uploading does NOT update referencing docs. You uploaded `hero.png` → it gets `media_<sha-A>.png`. Six months later, you upload a new `hero.png` → it gets `media_<sha-B>.png`. Documents that reference `https://content.da.live/.../media/hero.png` still resolve via redirect to `media_<sha-A>.png` until they're re-previewed.

### 8.5 Direct `content.da.live` URLs vs `aem.page` URLs

When a document references a media file, you can use either host:

- `https://content.da.live/{org}/{repo}/media/<file>` — direct from DA. Serves the raw binary. **No `<picture>` transformation when this URL is referenced from a document.**

Wait — that's not quite right. Let me restate:

- The EDS pipeline applies the `<picture>` transformation based on the `<img>` element it encounters when rendering the document. The transformation runs regardless of which host the `src=` points at, as long as the host is reachable and returns a valid image. So either `content.da.live` or `aem.page` works as a source URL; both get the responsive `<picture>` treatment.
- The difference is **freshness and stability**:
  - `content.da.live` is canonical. Always the latest uploaded version of that path. [verified]
  - `aem.page/{branch}` is preview-cached. Updates after re-preview.

For author-authored documents, use `content.da.live` URLs. They're branch-independent and always-fresh.

---

## 9. Authoring — how documents reference media

A DA document references uploaded media via standard HTML `<img>`, `<source>`, `<video>`, etc. tags. The `src=` attribute holds a full URL (per §8.3).

### 9.1 Static `<img>` references

```html
<p>Welcome to our product launch.</p>
<img src="https://content.da.live/myorg/myrepo/media/launch/hero.png"
     alt="Product launch hero" width="2000" height="1000">
<p>Read on for the details…</p>
```

When rendered by EDS, the `<img>` becomes a responsive `<picture>` (§8.2). The author authors a single `<img>`; the deployed page has the full responsive variants.

### 9.2 `<picture>` with explicit `<source>` overrides

You can author a `<picture>` directly if you want to override the pipeline's auto-generated variants:

```html
<picture>
  <source media="(min-width: 1000px)"
          srcset="https://content.da.live/myorg/myrepo/media/hero-desktop.png">
  <img src="https://content.da.live/myorg/myrepo/media/hero-mobile.png"
       alt="Hero">
</picture>
```

The pipeline preserves the authored `<source>` elements and adds its own as fallbacks. Use sparingly — the pipeline's defaults are usually fine.

### 9.3 Video references

```html
<video controls>
  <source src="https://content.da.live/myorg/myrepo/media/demo.mp4"
          type="video/mp4">
</video>
```

MP4 follows the same Media Bus delivery as images — content-addressed, with cache implications for replacement.

### 9.4 PDF, JSON, font links

```html
<a href="https://content.da.live/myorg/myrepo/media/spec.pdf">Download spec</a>
```

```html
<link rel="stylesheet" href="https://content.da.live/myorg/myrepo/fonts/font-face.css">
```

PDFs and other Content Bus assets just need a link. The author types or pastes the URL; the deployed page references it directly.

---

## 10. Common operational gotchas

### 10.1 `aem content push` silently no-ops on binaries

`aem content push` will report success but not actually upload binary files. See §3.3. Use the Source API directly for any binary (image, video, PDF, font).

### 10.2 Token expires silently with 401-empty-body

The IMS token expires at the `expires_at` timestamp; subsequent PUTs return 401 with an empty body. See §3.5. Always pre-flight expiry before a long upload run.

### 10.3 Field name MUST be `data`

Multipart form uploads to the Source API must use field name `data`. Other names (`file`, `image`, `upload`) silently fail — the API returns 200 OK with no file written. See §3.1.

### 10.4 Extension renaming breaks delivery

EDS sniffs content type. A WEBP renamed to `.png` will not deliver. Use the correct extension at upload time, derived from actual content.

### 10.5 SVG 40 KB ceiling is real

Complex illustrations exceed 40 KB easily. See §5.1 for mitigations. Don't ship over-cap SVGs and hope they work; they will fail at delivery.

### 10.6 PNG/JPG replacement requires re-preview

Replacing a Media Bus asset doesn't update referencing documents — they still resolve to the old content hash via cached redirects. Re-preview every referencing document after replacing a PNG/JPG/AVIF/WEBP/MP4. See §8.4.

### 10.7 Repo-relative paths render as `about:error`

DA documents can only reference media via full URLs (`https://content.da.live/…` or `https://{branch}--{repo}--{owner}.aem.page/…`). Repo-relative paths produce `about:error`. See §8.3.

### 10.8 The DA editor refuses some formats the API accepts

The editor UI may refuse WEBP drag-drop; the Source API accepts WEBP fine (§4.4). Don't conclude a format is "unsupported" from editor behavior alone — test with a direct PUT.

### 10.9 Per-document dot-folders duplicate shared assets

The DA editor's drag-drop creates a per-document copy. The same image used on five documents becomes five binaries with five URLs. For shared assets, use `/media` (§2.3).

### 10.10 Path constraints aren't enforced at upload time

DA Source will accept a PUT to `/Media/Hero Image.PNG`, but the resulting path may not be canonically reachable. Validate paths against §7 rules before uploading.

---

## 11. URL reference card

| Pattern | Purpose | Auth |
|---|---|---|
| `https://admin.da.live/source/{org}/{repo}/<path>` | DA Source API — PUT binaries here | Bearer token |
| `https://admin.hlx.page/preview/{org}/{repo}/{branch}/<path>` | Trigger preview for a document | Bearer token |
| `https://admin.hlx.page/live/{org}/{repo}/{branch}/<path>` | Trigger publish for a document | Bearer token |
| `https://content.da.live/{org}/{repo}/<path>` | Direct DA delivery — raw binaries | None (for images and public types) |
| `https://da.live/edit#/{org}/{repo}/<path>` | DA web editor for a document | Sign-in required |
| `https://{branch}--{repo}--{owner}.aem.page/<path>` | Preview deploy from a branch (post-`preview`) | None |
| `https://{branch}--{repo}--{owner}.aem.live/<path>` | Live deploy from a branch (post-`live`) | None |

---

## 12. Decision tree: where should I upload this?

```
Is this binary referenced from authored content (HTML documents in DA)?
│
├── YES → It belongs in DA.
│         │
│         ├── Is it shared across multiple documents / branches?
│         │   → /media/<scope>/<file>     (recommended for migration scripts, shared assets)
│         │
│         ├── Is it specific to one document, uploaded by an author via the editor?
│         │   → /{parent}/.{docname}/<file>     (DA editor handles this automatically)
│         │
│         └── Is it governed by an external DAM (AEMaaCS)?
│             → AEM Assets DAM       (use AEMaaCS Assets API; out of DA scope)
│
└── NO  → It belongs in Code Bus (git-tracked).
          │
          ├── A font file?       → /fonts/<file>.woff2
          ├── An icon set?       → /icons/<file>.svg
          ├── A block asset?     → /blocks/<block>/<file>
          └── Site config?       → /head.html, /styles/, /scripts/
```

---

## 13. Glossary

**Admin API** — `https://admin.hlx.page/…` endpoint family. Controls document lifecycle (preview, publish, status).

**Code Bus** — files delivered from the git-tracked branch (typically `/fonts/`, `/icons/`, `/blocks/`, `/scripts/`, `/styles/`, `/head.html`). Updated by code deploy.

**Content Bus** — files delivered from DA at their original path (SVG, PDF, HTML, JSON, ICO, WOFF2). Updated by preview/publish.

**DA editor** — the web UI at `da.live/edit#/…` for authoring documents.

**DA Source API** — `https://admin.da.live/source/…` endpoint for read/write of DA-tracked files.

**Dot-folder** — `/{parent}/.{docname}/` folder created automatically by the DA editor for per-document author uploads.

**Edge Delivery Services (EDS)** — the rendering pipeline that serves `aem.page` (preview) and `aem.live` (production). Consumes DA content + Code Bus + Media Bus to produce rendered HTML.

**IMS token** — Adobe Identity Management access token. Cached at `.hlx/.da-token.json`. Used for auth against DA Source API and Admin API.

**Media Bus** — content-addressed backend for image and video binaries (PNG, JPG, AVIF, WEBP, MP4). Dedup by SHA hash; permanent cache.

**`/media` folder** — DA convention for shared assets — top-level folder for binaries referenced across documents/branches/iterations. Auto-creates on first PUT.

**Preview / Publish** — Admin API operations that promote a document from "stored in DA" to "available at `aem.page`" (preview) or "available at `aem.live`" (publish).

**Source API** — see DA Source API.
