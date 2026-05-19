# Phase 2 — Analyze

Goal: produce a structural map and a list of decisions that Generate
needs. Decisions are written as both human prose (in `notes.md`) and
a machine-readable artifact (`decisions.json`) — Generate reads the
latter so it doesn't have to re-parse the prose.

## Knowledge to load

Before making decisions, load (using the override-then-bundled
resolution from `SKILL.md`):
- `methodology.md` §2 (Analyze) — the canonical rules
- `learnings.md` — at minimum skim for entries about structural
  patterns, generator-specific quirks, and known disambiguator rules

Resolution: check `.snowflake/knowledge/<file>.md` first (project
override), then `<SKILL_DIR>/knowledge/<file>.md` (bundled).
Don't re-derive things that are documented.

## What to inspect in the source

For the HTML at `<projectsDir>/<NNN>-<slug>/input/index.html`:

1. **Header boundary** — everything from `<body>` start until the
   first content section. Often broader than just `<header>`:
   announcement banners, mega-navs, sticky breadcrumbs all belong
   here. Some sources have no `<header>` tag at all and use a
   `<div class="nav-wrap">` or similar instead — the fragment name
   stays "header" regardless of the source tag.

2. **Footer boundary** — everything from the last content section to
   `</body>` (minus scripts). Often includes sticky CTAs, modal
   markup, etc.

3. **Main sections** — each top-level `<section>` between header and
   footer is a candidate block. If a logical section uses a different
   tag (`<div class="hero-scroll">`), record it — Generate will
   rewrite the outermost element to `<section>`. The substrate engine
   only matches `section[class]`.

4. **First-class collisions** — if multiple sections share their
   first class (e.g. two `<section class="section">`), pick a
   disambiguator from this priority list:
   1. `data-section` attribute (Stardust convention)
   2. `id` attribute on the section
   3. Slug from the most prominent eyebrow / label inside
   4. Positional: `section-N`

5. **Slot opportunities per section** — for each block:
   - Visible text in headings, paragraphs, button labels → text slot
   - `<img>` / `<picture>` → image / picture slot
   - `<a>` with text and href → link slot (NOT if the link wraps
     other to-be-slotted children — see learnings: "container vs.
     children" rule)
   - Decorative SVGs, icons, hardcoded glyphs → static (not slots)
   - Generator-emitted placeholders (e.g. `data-placeholder="true"`)
     → mark with `data-slot-skip="placeholder"`, never authorable
   - Background-image slots: any element with inline
     `style="background-image:url(…)"` becomes a slot via the
     background-image writer case in the substrate

6. **Head-level resources to lift** into the template's top — font
   preconnects, Google Fonts stylesheets, CDN preconnects. The
   overlay engine copies top-level `<link>`s from the template
   into `<head>` at runtime. List them; Generate will emit them.

7. **Inline `<style>` blocks** — extract to `/styles/<template>.css`.

8. **Inline `<script>` blocks** — extract to
   `/scripts/<template>-animations.js`. The engine HEAD-probes this
   path; 404 is silent.

9. **External libraries** — note any `<script src="...">` for
   third-party libs (Lenis, GSAP, etc.). Decide per-lib whether to:
   - Vendor in repo under `/scripts/<template>-<libname>.js`
   - Reference a public CDN
   - Concatenate into the per-template animations file

10. **Asset references** — count all relative paths
    (`assets/...`, `./images/...`, etc.) and absolute paths to
    external hosts. Decide the asset strategy:
    - **Public source host**: rewrite to absolute URLs pointing at
      that host
    - **Local-only source host** (`localhost`, `127.0.0.1`): two
      paths — vendor to `/assets/` in the repo (proven; ~38 MB
      acceptable for one-off bespoke), or migrate to DA `/media/`
      (out of scope unless asked). Default: vendor.
    - **NOTE**: image URLs INSIDE DA cells must be absolute even
      when template/fragment refs are root-relative (Media Bus
      requires absolute). See `knowledge/learnings.md` 2026-05-19
      Media Bus entry.

## Produce `notes.md`

Append to (or create) the project's `notes.md` with this structure:

```markdown
# Notes — <NNN> <slug>

## Phase: Capture
(summary of what was fetched)

## Phase: Analyze

### Structural map

```
Line   Element
─────  ──────────────────────────────────────
...    (annotated tree from header → footer)
```

### Differences from prior runs

(comparison table or prose — what's new here)

### Decisions surfaced by analysis

1. (numbered decisions for Generate to act on)
```

## Produce `decisions.json`

Write a structured artifact in the project folder. Generate reads
this directly. Suggested shape:

```json
{
  "templateName": "<name>",
  "synthesizeMain": true,
  "sections": [
    {
      "firstClass": "hero",
      "originalTag": "div",
      "rewriteToSection": true,
      "fragments": [],
      "slots": [
        { "name": "eyebrow", "type": "text", "selector": ".hero-text__eyebrow" },
        { "name": "title", "type": "text", "selector": ".hero-text__title" },
        { "name": "body", "type": "text", "selector": ".hero-text__body" }
      ]
    },
    {
      "firstClass": "stories",
      "originalTag": "section",
      "rewriteToSection": false,
      "slots": [
        { "name": "eyebrow", "type": "text", "selector": ".stories__eyebrow" },
        { "name": "title", "type": "text", "selector": ".stories__title" },
        { "name": "body", "type": "text", "selector": ".stories__body" },
        { "name": "card-1.photo", "type": "background-image", "selector": ".story-card:nth-child(1) .story-card__photo" },
        { "name": "card-1.category", "type": "text", "selector": ".story-card:nth-child(1) .story-card__category" }
      ]
    }
  ],
  "headLinks": [
    { "rel": "preconnect", "href": "https://fonts.googleapis.com" },
    { "rel": "preconnect", "href": "https://fonts.gstatic.com", "crossorigin": "" }
  ],
  "inlineStyleLines": [8, 1326],
  "inlineScriptLines": [
    [2162, 2670],
    [2674, 2685]
  ],
  "externalLibs": [
    { "name": "lenis", "css": "assets/lenis.min.css", "js": "assets/lenis.min.js", "strategy": "vendor" }
  ],
  "assetStrategy": "vendor",
  "assetBase": "http://127.0.0.1:8080/path/to/page/",
  "vendorAssetsTo": "assets/"
}
```

This is a sketch — actual fields evolve per run. Generate phase
reads `decisions.json`, falls back to re-reading `notes.md` if a
field is missing.

## Stripping decisions

Some source elements should NOT make it into the template:
- Dev-tool markup (grid overlays, debug buttons) — strip
- Generator provenance comments — keep or strip per preference
- Generator placeholder elements (Stardust placeholders) — keep but
  mark with `data-slot-skip="placeholder"`

List these explicitly in `notes.md` and in `decisions.json` under
a `strip` array so Generate doesn't accidentally include them.

## Update state and finish

Set `state.phase = "analyze"`, `state.phaseStatus = "complete"`,
`state.analyzeCompletedAt = "<timestamp>"`. Save state.json.

Continue to Phase 3 (Generate).
