# Phase 3 — Generate

Goal: produce the 5 deployable artifacts and the DA-source body
fragment, written to the project's `output/` folder.

## Knowledge to load

Before writing anything, load (using the override-then-bundled
resolution from `SKILL.md`):
- `methodology.md` §3 (Generate) — the authoritative rules
- `architecture.md` §"Slot semantics" — all five slot writer cases
  the engine supports
- `learnings.md` — at minimum the entries for "container vs.
  children", "Media Bus absolute URLs", "`<br>` stripping",
  "non-`<section>` blocks must be rewritten", plus whatever else
  applies to the patterns in `decisions.json`

Resolution at each lookup: check `.snowflake/knowledge/<file>.md`
first (project override), then `<SKILL_DIR>/knowledge/<file>.md`
(bundled). Project overrides win on conflict.

This phase is sequential in this version of the skill. (A future
version may fan out the mechanical extractions across parallel
sub-agents — see the skill repo's roadmap.)

## Output layout

Under `<projectsDir>/<NNN>-<slug>/output/`:

```
templates/<template>.html              ← <main> with [data-slot] markers
fragments/<template>/header.html       ← full header DOM
fragments/<template>/footer.html       ← full footer DOM
styles/<template>.css                  ← extracted inline <style>
scripts/<template>-animations.js       ← extracted inline <script> (if any)
da/<page-slug>.html                    ← DA-source body fragment
```

Plus any vendored external libs (`scripts/<template>-<libname>.js`,
`styles/<template>-<libname>.css`) and any vendored static assets
(`assets/...`) per the asset strategy in `decisions.json`.

## Step-by-step

Work through the steps below in order. At each, check decisions.json
for any project-specific overrides.

### 3.1 — Extract head-level `<link>` resources

From `decisions.json["headLinks"]`, emit each as a top-level
`<link>` at the very top of the template HTML file, ABOVE the
synthesized `<main>`. The substrate engine lifts these into
`document.head` at runtime.

Do NOT include a `<link>` for `/styles/<template>.css` here — the
substrate loads that dynamically when the overlay applies.

### 3.2 — Build the template's `<main>`

Walk the source body sections in document order. For each section
in `decisions.json["sections"]`:

1. If `originalTag !== "section"` and `rewriteToSection === true`,
   change the outermost element to `<section>` while preserving the
   complete class list and all inner DOM.
2. If the source's body lacks a `<main>` wrapper (almost always
   true for static AI-generated pages), synthesize one around the
   collected sections.
3. For each `slots[i]`:
   - Find the element matching `selector` inside the section.
   - Add `data-slot="<name>"` to it. Keep the default content (acts
     as fallback when DA cell is empty).
   - **Mid-sentence inline elements are CONTENT, not chrome.** If the
     element contains inline tags from the preserved set (`<sup>`,
     `<sub>`, `<strong>`, `<em>`, `<del>`, `<ins>`, `<mark>`, `<code>`,
     `<kbd>`, anchors, images) that sit BETWEEN text runs, leave them
     inside the element and slot the WHOLE element. Do NOT wrap the
     text in a sub-`<span data-slot>` that excludes the inline tags —
     the DA cell would then be missing them and the `.md`
     representation would be incomplete (authors can't see/edit the
     marker). See `<SKILL_DIR>/knowledge/learnings.md` entry
     "2026-05-20 — inline content elements belong INSIDE the slot".
   - For `background-image` slots, the element keeps its inline
     `style="background-image:url(...)"` AS-IS. The substrate writer
     replaces the URL at runtime.
   - For `link` slots, only apply if the `<a>` has NO nested
     `[data-slot]` descendants. Container-vs-children rule.
4. Skip elements listed in `decisions.json["strip"]` — they don't
   appear in the template.
5. Mark placeholder elements with `data-slot-skip="placeholder"`
   (never authorable; substrate ignores them).

### 3.3 — Header fragment

Extract everything from `<body>` start up to (but not including) the
first content section. Wrap as the body of `fragments/<template>/header.html`.
Apply asset path rewrites (3.7 below). Header has NO `[data-slot]`
markers — it's static repository content.

### 3.4 — Footer fragment

Extract everything from the last content section end to `</body>`,
MINUS `<script>` tags and any stripped dev-tool markup. Save as
`fragments/<template>/footer.html`. Apply asset path rewrites. No
`[data-slot]` markers.

### 3.5 — Page CSS

Concatenate the source's inline `<style>` blocks (line ranges in
`decisions.json["inlineStyleLines"]`) into a single file at
`styles/<template>.css`. **Strip the `<style>` and `</style>`
wrapper lines — emit only the inner content.** Apply asset path
rewrites to any `url(...)` references inside.

If `decisions.json["externalLibs"][i].strategy === "vendor"` and the
lib includes a CSS file: copy it to
`styles/<template>-<libname>.css` verbatim.

### 3.6 — Page animations JS

Concatenate the source's inline `<script>` blocks (line ranges in
`decisions.json["inlineScriptLines"]`) into
`scripts/<template>-animations.js`. The substrate loads this via
HEAD probe; if it 404s the page still works.

For vendored external libs that need an initialization hook (e.g.
Lenis), inject a small loader prelude that:
1. Creates a `<script>` element pointing at the vendored lib path
2. Sets `onload` to a function that runs the rest of the script

```js
(function () {
  const s = document.createElement('script');
  s.src = `${window.hlx.codeBasePath}/scripts/<template>-<libname>.js`;
  s.onload = main;
  document.head.appendChild(s);
  function main() {
    // original inline script body goes here, including library init
  }
})();
```

For any inline `onclick="someFunc()"` references in the template,
expose `someFunc` on `window` from inside `main()`.

### 3.7 — Asset path rewriting

Per `decisions.json["assetStrategy"]`:

- **`"absolute"`** (public source host): rewrite every relative
  `assets/...` reference to `${assetBase}assets/...` (absolute URL
  pointing at the source host).

- **`"vendor"`** (local-only source host, or user-requested vendor):
  - Copy the referenced asset files from source into the target
    repo's `assets/` directory (preserving subfolder structure).
    Use `curl` if source is HTTP, `cp -R` if filesystem path is
    available.
  - Remove `.DS_Store`s and any unreferenced files in the copied
    tree.
  - Rename any directory containing spaces (AEM CLI 404s on
    URL-encoded `%20`).
  - In template, fragments, and CSS: rewrite source URLs to
    root-relative `/assets/...`.
  - **In the DA doc (next step): rewrite to ABSOLUTE branch URLs**
    (`https://<branch>--<repo>--<owner>.aem.page/assets/...`). Media
    Bus only resolves absolute URLs. The branch name comes from
    decisions.json or is asked of the user.

The asymmetry is critical and worth a sanity check: search the
output for any `src="assets/"` (missing leading slash, non-absolute,
not vendored-absolute) — should find none.

### 3.8 — DA-source body fragment

Write `output/da/<page-slug>.html` in the canonical `<div class="…">`
block form (see `eds-da-content` §3.2). Read `eds-da-content` §3, §3.9,
§5, and §9 before writing this file — block format, cell content
normalization, page metadata, and image URL rules all live there.

Structure:

```html
<body>
  <header></header>
  <main>
    <div>
      <div class="<first-class-of-section-1>">
        <div><div><slot-name></div><div><slot-value></div></div>
        ... one row per slot, paired divs ...
      </div>
    </div>
    ... one outer-div per section ...
    <div>
      <div class="metadata">
        <div><div>template</div><div><templateName></div></div>
        <div><div>title</div><div><pageTitle></div></div>
      </div>
    </div>
  </main>
  <footer></footer>
</body>
```

Snowflake-specific reminders (universal rules are in `eds-da-content`):

- Metadata block MUST sit inside `<main>` — placement in `<footer>`
  breaks the overlay engine (no `<meta name="template">` → engine
  bails → standard EDS decoration 404s on every block).
- Never write `<span class="…">` into cells — class is lost on
  normalization, breaking any CSS hook the source page relied on.
- For vendored assets, DA cells use the absolute branch URL form:
  `https://<branch>--<repo>--<owner>.aem.page/assets/...` (DA cells
  don't accept root-relative paths even though template/fragment
  HTML does).

### 3.9 — Self-checks before declaring Generate done

Run these checks. If any fail, fix the affected artifact and re-run
the check.

```bash
PROJ="${PROJECTS_DIR}/${NNN}-${SLUG}"

# 1) Template has <main> and all sections have unique first-classes
node -e '
  const fs = require("fs");
  const { JSDOM } = require("jsdom");
  // ... or use regex-based check if jsdom not available
'

# 2) No relative "assets/" refs in template/fragments/CSS
grep -REn "=\"assets/" "$PROJ/output/templates" "$PROJ/output/fragments" "$PROJ/output/styles" && echo "FAIL: relative assets/" || echo "OK"

# 3) No nested [data-slot] inside another [data-slot]
# (would need a DOM parse — skip for now if jsdom not available;
#  document this gap in the future-validator roadmap)

# 4) DA doc has no <span class> (stripped) and no <table> (Snowflake
#    uses div form). See eds-da-content §3.9 for full normalization.
grep -cE "<table|<span class" "$PROJ/output/da/"*.html
# expected: 0 (per file)

# 4a) WARN: <br> is position-dependent (eds-da-content §3.9).
grep -nE "<br>" "$PROJ/output/da/"*.html && echo "WARN: <br> found — verify position" || echo "OK"

# 5) DA cell <img> URLs are absolute
grep -oE "<img[^>]*src=\"[^\"]+\"" "$PROJ/output/da/"*.html \
  | grep -vE "src=\"https?://" && echo "FAIL: non-absolute DA img" || echo "OK"

# 6) No section first-class collides with a CSS layout rule
#    This is the most common post-conversion layout bug — inner CSS class
#    used as section first-class picks up grid/flex rules meant for inner div.
grep -oE 'class="[^"]*"' "$PROJ/output/templates/"*.html \
  | grep -oE '^[a-z][a-z0-9-]+' \
  | sort -u \
  | while IFS= read -r cls; do
      if grep -qE "\.${cls}[[:space:]]*\{" "$PROJ/output/styles/"*.css 2>/dev/null; then
        echo "WARN: section first-class '$cls' appears as CSS selector — verify no layout collision"
      fi
    done || echo "OK: no first-class CSS collisions detected"
```

## Update state and finish

Set `state.phase = "generate"`, `state.phaseStatus = "complete"`,
`state.generateCompletedAt = "<timestamp>"`. Record:
- `state.slotCount` — total number of `[data-slot]` markers across
  the template
- `state.sectionCount` — number of sections in `<main>`

Continue to Phase 4 (Wire).
