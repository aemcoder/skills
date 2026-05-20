---
name: eds-da-content
description: Reference for producing Adobe Document Authoring (DA) and Edge Delivery Services (EDS) compatible content. Use whenever generating HTML for DA upload, uploading media binaries to DA, or driving the DA admin API (auth, source PUT, preview/publish). Covers block table HTML format, section structure, page/section metadata blocks, icons, links, images, default content, document skeleton constraints, the DA Source API contract, IMS auth, media storage patterns, supported formats and size limits, Media Bus vs Content Bus delivery, and the silent-failure rules that corrupt content.
---

# DA + EDS content reference

A reference skill — not a workflow. Use it whenever you need to know **what
the rules are** for generating, uploading, or delivering content through
Adobe Document Authoring (DA) and Edge Delivery Services (EDS).

This skill consolidates rules from three primary surfaces. Load the
reference for the task at hand:

| Doing | Read |
|---|---|
| Generating HTML for DA upload | [references/html-content.md](./references/html-content.md) |
| Uploading images, video, PDFs, fonts | [references/media.md](./references/media.md) |
| Hitting the DA admin API, auth, preview/publish | [references/platform.md](./references/platform.md) |

Every factual claim in the references is tagged `[verified]` (read from
code or observed empirically) or `[assumed]` (inferred from documentation
without direct verification).

## When to use this skill

Invoke this skill whenever you are:

- Generating HTML that will be uploaded to DA (`admin.da.live/source/...`).
- Uploading any binary (PNG, JPG, SVG, MP4, PDF, WOFF2) to DA.
- Calling `admin.da.live` (Source API) or `admin.hlx.page` (preview /
  publish API) directly.
- Reading a DA-stored HTML document and modifying it before re-upload.
- Diagnosing why a generated page renders incorrectly on `aem.page` /
  `aem.live` (silent failures: `about:error` images, missing meta tags,
  blocks rendering as plain tables).

### When NOT to use this skill

- Writing block JS or CSS for a project — that's covered by Adobe's
  `adobe/skills` repo and `aem-boilerplate/AGENTS.md`. This skill covers
  the *content* side, not the *code* side.
- Universal Editor, structured-content authoring, or AEM Cloud Service
  (Java / OSGi / JCR). Out of scope.

## The 10 silent-failure rules

These rules, if violated, produce broken content without any error from DA,
the pipeline, or the renderer. Memorize them; verify them in generated
output before upload.

1. **DA HTML is a body fragment.** No `<!DOCTYPE>`, no `<html>`, no `<head>`,
   no `<script>`, no `<style>`, no inline `style=` attributes. The pipeline
   injects head/scripts/styles from Code Bus at delivery.
   → [html-content.md §1](./references/html-content.md)

2. **Block tables need a merged first cell.** First row must be a single
   `<td>` containing the block name. Multi-cell first rows or empty first
   cells render as plain HTML tables (no JS, no CSS).
   → [html-content.md §3](./references/html-content.md)

3. **Block names use alphanumeric + single hyphens only.** No underscores,
   no double dashes, no digit-first names. Variants in parentheses: `Block
   (option-a, option-b)`.
   → [html-content.md §3](./references/html-content.md)

4. **Page Metadata block header is exactly `Metadata`.** Case-insensitive.
   Misspellings (`Meta Data`, `Metadata:`) are silently ignored — no
   `<meta>` tags emitted.
   → [html-content.md §5](./references/html-content.md)

5. **Image URLs must be full URLs.** Repo-relative (`/path/foo.png`) and
   document-relative (`./foo.png`) paths render as `<img src="about:error">`.
   Use `https://content.da.live/{org}/{repo}/<path>` or external URLs.
   → [html-content.md §9](./references/html-content.md)

6. **Referenced binaries must exist before the HTML is uploaded.** Upload
   binaries first, then the HTML. Otherwise the document loads but media
   references 404.
   → [html-content.md §9](./references/html-content.md), [html-content.md §11](./references/html-content.md)

7. **DA Source API requires `multipart/form-data` with field name `data`.**
   Other field names (`file`, `image`) return 200 OK with no file written.
   → [platform.md §2](./references/platform.md)

8. **SVG hard cap is 40 KB.** PNG/JPG/AVIF/WEBP cap is 20 MB. MP4 cap is
   36 MB. Exceeding fails delivery silently.
   → [media.md §5.1](./references/media.md)

9. **Preview / publish is a required separate step.** Uploading to DA does
   NOT make the document visible at `aem.page` / `aem.live`. POST to
   `admin.hlx.page/preview/...` then `/live/...` after upload.
   → [platform.md §6](./references/platform.md)

10. **IMS tokens expire silently with 401 + empty body.** Dev tokens last
    24 hours. Always pre-flight expiry against `expires_at` in
    `.hlx/.da-token.json` before a long upload run.
    → [platform.md §3](./references/platform.md)

## Glossary

Terms used across all three references.

- **Admin API** — `https://admin.hlx.page/<action>/...` endpoint family.
  Controls document lifecycle (preview, publish, status). Distinct from
  the DA Source API.
- **Code Bus** — files delivered from the git-tracked GitHub branch
  (typically `/fonts/`, `/icons/`, `/blocks/`, `/scripts/`, `/styles/`,
  `/head.html`). Updated by code deploy.
- **Content Bus** — files delivered from DA at their original path
  (SVG, PDF, HTML, JSON, ICO, WOFF2). Updated by preview/publish.
- **DA editor** — the web UI at `https://da.live/edit#/...` for human
  authoring of documents.
- **DA Source API** — `https://admin.da.live/source/...` endpoint for
  read/write of DA-tracked files (HTML and binaries).
- **Default content** — anything in an EDS page outside a block table:
  headings, paragraphs, lists, links, images. Renders as standard HTML.
- **Dot-folder** — `/<parent>/.<docname>/` folder created automatically
  by the DA editor for per-document author uploads of images.
- **EDS** — Edge Delivery Services. The rendering pipeline that serves
  `aem.page` (preview) and `aem.live` (production), consuming DA content
  + Code Bus + Media Bus.
- **IMS token** — Adobe Identity Management access token. Cached at
  `.hlx/.da-token.json`. Used for auth against the DA Source API and the
  Admin API.
- **Media Bus** — content-addressed backend for image and video binaries
  (PNG, JPG, AVIF, WEBP, MP4). Dedup by SHA hash; permanent cache.
- **`/media` folder** — top-level DA folder convention for shared
  binaries referenced across documents/branches/iterations. Auto-creates
  on first PUT.
- **Preview / Publish** — Admin API operations that promote a document
  from "stored in DA" to "available at `aem.page`" (preview) or
  "available at `aem.live`" (publish).
- **Section** — a `<div>` directly inside `<main>` in a DA HTML document.
  Becomes `<div class="section">` after decoration.
- **Section Metadata** — block whose `Style` key adds CSS classes to the
  enclosing section. NOT for SEO metadata (that's Page Metadata).
- **Page Metadata** — block whose key/value rows become `<head>` `<meta>`
  tags at delivery. One per page; conventionally last in document.
