# Design: `eds-da-content` Reference Skill

## Context

Skills in this repo (`migrate-page`, `migrate-block`, `migrate-header`, `snowflake`)
regularly produce HTML for upload to Adobe Document Authoring (DA) and hit the DA
admin API. Each skill currently re-derives DA + Edge Delivery Services (EDS)
rules from scattered sources (`aem.live` docs, GitHub source, prior experiments).
The result: recurring content-corruption bugs that an LLM agent cannot catch
because the rules are not encoded anywhere it can read.

Two high-quality reference docs already exist in the project area but are
neither shared nor invokable:

- `skills/snowflake/knowledge/eds-da-mechanics.md` — 300 lines, broad EDS
  lifecycle + DA basics, mixes snowflake-specific notes with portable facts.
- `snowflake-4th-attempt/docs/DA-MEDIA-REFERENCE.md` — 700 lines, deep on DA
  media binaries (storage, formats, limits, delivery, gotchas). Lives in a
  separate workspace; not shipped with any skill.

Neither covers **HTML content generation for DA-compatible documents**: block
table format in HTML, section structure, page/section metadata blocks, allowed
inner tags, link patterns, icon spans, default content, document skeleton
constraints. That gap is the largest single source of silent failure.

Research (see `/tmp/research_final_20260520_eds_da_llm_resources.md`) confirms
no public LLM resource fills this gap: Adobe's `adobe/skills` repo covers block
JS/CSS development, not HTML authoring; community resources (ddttom,
aem-boilerplate `AGENTS.md`) cover dev conventions, not HTML authoring rules.

## Summary

A single new skill — `eds-da-content` — that serves as the authoritative,
agent-invocable reference for producing DA-compatible HTML, uploading binaries
to DA, and driving the DA admin API.

Three reference files split by domain (HTML, media, platform). Cross-references
between them point downstream when an agent needs deeper info. SKILL.md
surfaces the silent-failure rules so they're always loaded with the skill.

Existing references stay in place: `snowflake/knowledge/eds-da-mechanics.md`
keeps its snowflake-specific notes. `DA-MEDIA-REFERENCE.md` content is adopted
into `references/media.md`.

## Goals

1. Any skill generating HTML for DA can invoke `eds-da-content` and get the
   complete, verified rule set.
2. Silent-failure rules (the 10 must-not-violate cliff-edges) are visible
   without loading any sub-reference.
3. The skill is loadable surgically — generating HTML loads `html-content.md`
   only; uploading media loads `media.md` only.
4. Every rule is tagged `[verified]` (read from code or observed) or
   `[assumed]` (inferred from docs) so agents can weigh confidence.
5. The skill remains a pure reference — no workflow, no procedural steps. It
   answers "what are the rules?", not "what should I do next?".

## Non-Goals

- Migration-specific patterns (static-to-EDS mapping, block identification
  heuristics). These stay in `migrate-page`, `snowflake`, etc.
- Block JS/CSS development conventions (decorate() pattern, three-phase
  loading, CSS scoping). Adobe's `adobe/skills` and `aem-boilerplate/AGENTS.md`
  cover these; we reference but don't duplicate.
- Universal Editor, structured-content (form-based) authoring, AEM Cloud
  Service (Java/OSGi). Out of scope.
- Workflow/orchestration. The skill teaches rules, not procedures.

## Skill Structure

```
skills/eds-da-content/
├── SKILL.md
└── references/
    ├── html-content.md
    ├── media.md
    └── platform.md
```

### SKILL.md — entrypoint (always loaded with skill)

YAML frontmatter:

```yaml
name: eds-da-content
description: Reference for producing Adobe Document Authoring (DA) and Edge
  Delivery Services (EDS) compatible content. Use whenever generating HTML for
  DA upload, uploading media binaries to DA, or driving the DA admin API (auth,
  source PUT, preview/publish). Covers block table HTML format, section
  structure, page/section metadata blocks, icons, links, images, default
  content, document skeleton constraints, the DA Source API contract, IMS
  auth, media storage patterns, supported formats and size limits, Media Bus
  vs Content Bus delivery, and the silent-failure rules that corrupt content.
```

Body sections:

1. **When to use this skill** — concrete triggers (generating HTML for DA upload;
   uploading PNG/JPG/SVG/MP4 to DA; calling `admin.da.live` or `admin.hlx.page`).
2. **The 10 silent-failure rules** — must-not-violate cliff-edges, each with a
   one-line rule and a `→ see references/X.md` pointer for depth.
3. **Reference index** — three-row table mapping task → reference file.
4. **Glossary** — shared terms (Code Bus, Content Bus, Media Bus, dot-folder,
   IMS token, etc.) so any reference can use them without re-defining.

### references/html-content.md — HTML you generate

Covers everything that ends up *inside* the HTML uploaded to DA.

Topical sections:

1. **Document skeleton.** Body fragment shape (no `<!DOCTYPE>`, no `<html>`,
   no `<head>`, no `<script>`, no `<style>`, no inline style attrs).
   `<header>` and `<footer>` empty unless intentional. `<main>` contains one
   `<div>` per section.
2. **Sections.** Each section is one `<div>` directly inside `<main>`. No
   `<hr>` between sections in the stored HTML — the section boundary is the
   `<div>` itself. One-level nesting constraint (blocks cannot contain blocks).
3. **Block tables.** First cell (merged) = block name + optional variants in
   `(parens, comma, separated)`. `toClassName` normalization rules. Allowed
   inner content per cell. Common block schemas (rows-as-items vs.
   columns-as-fields). Block-name → file path mapping. Forbidden patterns
   (empty first cell, multi-cell first row, nested block tables).
4. **Section Metadata block.** `Style` key → CSS classes on section; other
   keys → `data-*` attrs. Placement rule (inside the section it targets).
5. **Page Metadata block.** Footer placement (last element). Recognized keys
   (`title`, `description`, `image`, `template`, `theme`, `og:*`, `twitter:*`,
   `canonical`, `robots`). Misspelling = silent ignore.
6. **Default content.** Headings (auto-IDs from text), paragraphs, lists,
   inline formatting (strong/em → button promotion), inline code.
7. **Icons.** `<span class="icon icon-<name>">` in HTML. `:iconname:` colon
   syntax in markdown sources but NOT in HTML uploads. SVG location at
   `/icons/<name>.svg` (Code Bus). Cross-reference to `media.md` for
   icons stored in DA `/media`.
8. **Links.** Full URLs only. Same-site auto-rewriting at delivery. Button
   promotion via `<strong>`/`<em>` formatting. Heading anchors auto-generated
   from text. External link `target="_blank"` rules.
9. **Images in HTML.** Minimum: full URL only (`content.da.live` or external);
   never repo-relative or document-relative (`about:error`). Auto `<picture>`
   transformation at delivery (don't author `<picture>` unless overriding).
   **Cross-reference to `media.md` for storage and upload procedure.**
10. **Encoding & forbidden constructs.** UTF-8 source. No `<script>`,
    no `<style>`, no `style=` attrs, no `class=` on default-content tags
    (added by decoration), no `id=` on headings (auto-generated), no inline
    `data-*` attrs outside Section Metadata output.
11. **Upload handoff.** Cross-reference to `platform.md` for the DA Source
    API call that uploads the generated HTML.

### references/media.md — binaries you upload

Adopted from `snowflake-4th-attempt/docs/DA-MEDIA-REFERENCE.md` with light
restructuring to fit the skill conventions (`[verified]`/`[assumed]` tags,
glossary terms come from SKILL.md, cross-references to `platform.md` for
the API contract).

Sections preserved from the source:

1. DA storage model (admin/content/aem hosts).
2. Three media-storage patterns (DAM, dot-folder, `/media`).
3. Four upload paths (Source API, editor, CLI, Admin API for lifecycle).
4. Supported formats with delivery backend (Media Bus vs Content Bus).
5. MIME detection and image format choice. WEBP empirical note.
6. Size limits (per-file caps, dimensions, aggregate).
7. Folder structure conventions.
8. Path constraints.
9. Delivery model (Media Bus vs Content Bus, `<picture>` transformation,
   repo-relative→`about:error`, cache invalidation).
10. Authoring patterns (how HTML references media — pointer back to
    `html-content.md` for HTML-side rules).
11. Common operational gotchas.
12. URL reference card.
13. Decision tree.

### references/platform.md — DA + EDS as a platform

Distilled from `eds-da-mechanics.md` (DA portions) + DA-MEDIA-REFERENCE.md
(API contract sections §1, §3, §7, §11) without media-specifics.

Sections:

1. **Storage model** — `admin.da.live`, `content.da.live`, `aem.page`,
   `aem.live`, what each surface serves.
2. **DA Source API contract.** PUT/GET/DELETE on
   `https://admin.da.live/source/{org}/{repo}/<path>`. Multipart `data` field
   requirement. Response envelope shape. 401-empty-body on token expiry.
3. **IMS auth.** Token acquisition via `aem content clone`. Cache at
   `.hlx/.da-token.json`. Pre-flight expiry check. Token shape.
4. **Retry policy.** 429/5xx with exponential backoff. Honor `Retry-After`.
   Do not retry semantic 4xx.
5. **Path constraints.** Lowercase a-z, 0-9, dash. Max 900 chars. Extension
   required for binaries, not for documents.
6. **Preview/publish lifecycle.** `admin.hlx.page/preview` and `/live`.
   Required after upload. Path matches DA path without `.html`.
7. **`aem content` CLI workflow.** Clone, add, commit, push, status, diff.
   Caveat: binary push unreliable — use Source API directly.
8. **Rate limits.** 200 req/sec per IP per hostname. Aggregate limits
   (pages, files per Code Bus ref, response size).
9. **URL reference card.**

## Cross-Reference Graph

```
platform.md  (foundation — API, auth, paths, lifecycle)
   ▲
   │ media uploads use the Source API
   │
media.md     (binaries — storage, formats, limits, delivery)
   ▲
   │ HTML <img> URLs point to media uploaded per media.md
   │
html-content.md  (HTML content goes here)
```

Cross-reference rule: **inline-minimum / pointer-deep**. Each reference
includes just enough of the adjacent domain to write correct code at the
surface, then explicitly defers to the canonical reference for procedure.

Examples:
- `html-content.md` "Images in HTML" gives 4 rules (URL forms, no
  repo-relative, auto-`<picture>`, file must pre-exist), then says
  "see media.md for storage patterns and upload procedure."
- `media.md` "DA Source API call" gives the multipart pattern, then says
  "see platform.md for full API contract, retry policy, auth."
- `media.md` "Authoring patterns" gives the URL forms that work in `<img
  src=>`, then says "see html-content.md for HTML structure rules."

## Verification Convention

Every factual claim tagged at end of paragraph or table cell:

- `[verified]` — observed from code, tested empirically, or quoted from
  primary source (e.g., `da-admin` source, `aem.js`).
- `[assumed]` — inferred from docs or community sources without direct
  verification. Promote to `[verified]` as confirmed.

Carried from `eds-da-mechanics.md` convention.

## Migration Path for Existing References

- `skills/snowflake/knowledge/eds-da-mechanics.md` — **untouched**. Continues
  to serve snowflake-specific notes (overlay hook points, `.plain.html`
  fragments, `body.appear` no-flicker contract, scripts.js boot order).
  Some overlap with new skill, accepted.
- `snowflake-4th-attempt/docs/DA-MEDIA-REFERENCE.md` — **untouched in its
  workspace**. Content adopted into `skills/eds-da-content/references/media.md`
  with light restructuring. Source-of-truth shifts to the new skill on a
  go-forward basis; the workspace copy is informational.
- No existing skills are modified by this design. Future work may have
  `migrate-page`, `migrate-block`, `migrate-header`, `snowflake` invoke
  `eds-da-content` instead of re-deriving rules — out of scope here.

## Installation

The skill ships with the existing `aemcoder/skills` repo. It installs alongside
the migration skills:

```
upskill aemcoder/skills --path skills --all
```

Slicc's `upskill` flattens `skills/eds-da-content/` to
`/workspace/skills/eds-da-content/` at install time. References are loaded
relative to the skill: `/workspace/skills/eds-da-content/references/*.md`.

## Decisions

1. **Skill name.** `eds-da-content` for now. Renaming is cheap if a better
   name surfaces during implementation.
2. **URL placement.** URLs live in references, not SKILL.md. Keeps SKILL.md
   compact and the must-not-violate rules scannable.
3. **JSON sheets and structured content.** Out of scope for v1.
	