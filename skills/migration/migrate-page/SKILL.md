---
name: migrate-page
description: Migrate a web page to AEM Edge Delivery Services. Extracts page structure, decomposes into blocks, generates EDS-compatible code, and verifies with visual comparison.
requires:
  - browser
  - node
  - git
  - parallel-agents
---

# EDS Page Migration

Migrate a web page into AEM Edge Delivery Services: extract structure,
decompose into blocks, generate EDS-compatible code per block, and verify
each with visual comparison.

## Orchestrator-Level Skill

**This skill must be run by the top-level orchestrating agent.** Phase 3
(block generation) spawns parallel sub-agents — one per block. Sub-agents
cannot spawn further sub-agents, so the orchestrator must drive the
overall flow.

## Triggers

"migrate this page", "convert to EDS", "create EDS blocks from URL".
User provides a URL and a GitHub repo (owner/repo).

## Variables

Two path variables are used throughout this skill:

- `{projectPath}` — root of the cloned EDS repo on disk
- `{skillDir}` — root directory of this skill (where this SKILL.md lives)

## Four Phases

1. **Extraction** — clone repo, navigate to URL, run extraction scripts
2. **Decomposition** — classify visual tree into fragments/sections/blocks
3. **Block Generation** — spawn one sub-agent per block, monitor until done
4. **Assembly** — collect results, build page, commit

---

## Phase 1: Extraction

User provides a URL and a GitHub repo (owner/repo).

### Step 1.0: Confirm Browser Capability

Before touching any URLs, confirm you can do all three of these in this
environment:

1. Open a URL in a browser (headless or headed)
2. Execute JavaScript in the page context
3. Take a full-page screenshot

The extraction scripts are plain in-page JavaScript — they work with any
tool that provides those three capabilities. Use whatever is available;
no specific tool is required.

**HARD ERROR if any capability is missing.** Stop immediately, tell the
user what is unavailable, and do NOT produce partial output silently.

### Step 1.1: Clone and Branch

Clone the repo and create a migration branch:

```bash
git clone https://github.com/{owner}/{repo}.git {projectPath}
cd {projectPath} && git checkout -b migrate/{page-slug}-{timestamp}
mkdir -p {projectPath}/.migration
```

Where `{page-slug}` is derived from the URL path (e.g.,
`/products/widget` → `products-widget`), and `{timestamp}` is a short
identifier (e.g., `Date.now().toString(36)`).

### Step 1.2: Navigate to Source Page and Set Desktop Viewport

**Open** `{sourceUrl}` in the browser.

**MANDATORY — set the viewport to 1440×900 before ANY extraction step.**
Browser tabs often default to ~780px. The visual-tree extractor ignores
elements narrower than 900px, so extraction at the default width produces
an unusable 1-node tree and a mobile-width screenshot — every Phase 1
artifact would be wrong. Never skip this step.

### Step 1.3: Dismiss Overlays (opt-in, skipped by default)

**Skip this step unless the user explicitly requested overlay dismissal**
(e.g., "dismiss overlays", "handle cookie banners").

If requested: delegate to the `dismiss-overlays` skill to handle cookie
banners, consent dialogs, and other overlays on the source page.

### Step 1.4: Lazy-Load Scroll

Execute the `lazy-load-scroll.js` script (at `{skillDir}/scripts/`) in the
page context to scroll the page top-to-bottom and trigger lazy-loaded
images and sections.

### Step 1.5: De-Sticky

Execute the `de-sticky.js` script (at `{skillDir}/scripts/`) in the page
context. It converts `position: fixed` elements to `position: relative`
so they don't overlap content in the visual tree or full-page screenshot.

### Step 1.6: Extract Visual Tree

Execute the `visual-tree.js` script (at `{skillDir}/scripts/`) in the
page context and save the result to
`{projectPath}/.migration/visual-tree.json`.

**Guard — verify the tree is usable:**

```bash
node -e '
  const fs = require("node:fs");
  const d = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const width = d.viewport ? d.viewport.width : 0;
  if (d.nodeCount < 5 || width < 1024) {
    console.error("Unusable visual tree: nodeCount="
      + d.nodeCount + ", viewport.width=" + width);
    process.exit(1);
  }
' {projectPath}/.migration/visual-tree.json
```

**If this fails: HARD ERROR — do not proceed.** Re-set the viewport,
then re-run Steps 1.4–1.6.

### Step 1.7: Full-Page Screenshot

**Wait for all images to settle before capturing.** EDS and many sites
use `loading="lazy"` — screenshots taken during the load race show
blank placeholders and trigger false broken-image reports. Execute JS
in the page to force-load and decode all images:

```javascript
(async () => {
  document.querySelectorAll('img[loading="lazy"]').forEach(
    img => img.loading = 'eager'
  );
  await Promise.all(
    [...document.querySelectorAll('img')]
      .filter(img => !img.complete)
      .map(img => img.decode().catch(() => {}))
  );
  return 'images settled';
})()
```

Then take a full-page screenshot of the page (max-width 1440px). Save to
`{projectPath}/.migration/screenshot.png`.

Verify the file exists and has a reasonable size (>10 KB).

### Step 1.8: Extract Brand Data

Execute the `brand-extract.js` script (at `{skillDir}/scripts/`) in the
page context and save the result to
`{projectPath}/.migration/brand.json`.

### Step 1.9: Extract Metadata

Execute the `metadata-extract.js` script (at `{skillDir}/scripts/`) in
the page context and save the result to
`{projectPath}/.migration/metadata.json`.

### Step 1.10: Scan Block Inventory

Run the block-inventory scanner:

```bash
node {skillDir}/scripts/block-inventory.js {projectPath}
```

This writes `{projectPath}/.migration/block-inventory.json` and prints
the summary (block count and names) to stdout.

### Extraction Artifacts

After Phase 1, these files exist in `{projectPath}/.migration/`:

| Artifact | Purpose |
| ---------- | --------- |
| `screenshot.png` | Full-page screenshot after prep |
| `visual-tree.json` | Spatial hierarchy (bounds, backgrounds, selectors) |
| `brand.json` | Fonts, colors, spacing |
| `metadata.json` | Title, description, OG tags |
| `block-inventory.json` | Existing blocks in the EDS project |

---

## Phase 2: Decomposition

Read `visual-tree.json`, and **view** `screenshot.png`. The visual tree is
used ONLY for decomposition (identifying regions and classifying them). It
is NOT used for content extraction — sub-agents extract content from the
live page in Phase 3.

> **NEVER read a screenshot as text.** A full-page PNG is commonly 1–3 MB;
> reading it as text overflows the context window. To inspect a screenshot,
> view it as an image.

### Visual Tree Format

```text
{id} [{role/tag}] [{CxR}] [{bg:type}] @{x},{y} {w}x{h} "{text}"
```

Hierarchy via 2-space indentation. `{id}` is a positional identifier
(e.g., `rc1c2`). `[CxR]` = columns x rows layout. `[bg:type]` =
background signal.

### Classification Rules

**THE TYPING TEST:** Can an author create this in Word/Google Docs?

- YES → `default-content`
- NO → `block`

**Layout rule:** `[CxR]` with C >= 2 → MUST be `block`.

**Background rule:** Background transitions signal section boundaries.

**Reserved names:** NEVER use "header" or "footer" as block names.

**Section heading ownership:** When a `section` contains a lead-in heading
(a `default-content` sibling) alongside a `block`, the heading is
**orchestrator-owned**: the orchestrator writes it as default-content during
Phase 4 assembly, and the block sub-agent MUST NOT include it in its block
output. The prompt generator flags these blocks automatically.

### Three Fragments

Every page decomposes into exactly 3 fragments:

1. `/nav` — header/navigation
2. `/{page-path}` — main content
3. `/footer` — page footer

### Output

Write `decomposition.json` to `{projectPath}/.migration/`:

```json
{
  "url": "https://example.com/page",
  "fragments": [
    {
      "path": "/nav",
      "children": [
        { "type": "block", "name": "nav-bar", "id": "rc1",
          "bounds": { "x": 0, "y": 0, "width": 1440, "height": 80 } }
      ]
    },
    {
      "path": "/page",
      "children": [
        { "type": "section", "style": "highlight", "children": [
          { "type": "block", "name": "hero", "id": "rc2c1" },
          { "type": "default-content", "id": "rc2c2" }
        ]},
        { "type": "block", "name": "cards", "id": "rc3" }
      ]
    },
    {
      "path": "/footer",
      "children": [
        { "type": "block", "name": "footer-links", "id": "rc4" }
      ]
    }
  ]
}
```

### Close Source Tab — Optional

**Consider keeping the source tab open until Phase 4 completes.** During
assembly you may need to re-check exact heading typography, mobile
behaviour, or content details that the extraction artifacts don't fully
capture. If you close it now, you'll have to reopen the source URL and
redo viewport setup.

If you do close it (e.g. to free resources in constrained environments),
ensure Phase 1 captured everything comprehensively enough that the
source is genuinely disposable.

---

## Phase 2.5: Establish Layout Contract, Brand, Fonts, and Styles

Set up the **layout contract**, brand, fonts, and styles BEFORE creating
sub-agents in Phase 3. Sub-agents need these in place so their preview
pages load correctly.

**Why this is a contract, not just tokens.** Tokens that nothing consumes
do not constrain sub-agents. If you set `--content-max-width: 1360px` but
leave the boilerplate's `max-width: 1200px` rule intact, sub-agents will
build against 1200px and independently invent incompatible workarounds
with `!important`. The rules that consume the tokens must be correct
*before* fan-out.

### 2.5a: Resolve Fonts

1. Read `.migration/brand.json` — check `fonts.sources.typekit` and
   `fonts.sources.googleFonts`
2. Resolve font delivery using this cascade (first match wins):

   **a. Source has Adobe Fonts (Typekit)?**
   If `fonts.sources.typekit` is not null → use the source's kit directly.
   Link: `https://use.typekit.net/{fonts.sources.typekit}.css`

   **b. Source has Google Fonts?**
   If `fonts.sources.googleFonts` has URLs → use those URLs directly.

   **c. Font in our fallback Typekit kit `cwm0xxe`?**
   Check: `https://typekit.com/api/v1/json/kits/cwm0xxe/published`
   If the font family appears → use kit `cwm0xxe`.

   **d. Font available on Google Fonts?**
   Check: `https://fonts.googleapis.com/css2?family={FontName}:wght@400;700&display=swap`
   If 200 OK → use that URL.

   **e. System font fallback**
   Use the extracted font name with generic fallback (serif/sans-serif).

### 2.5b: Update head.html

Read `{projectPath}/head.html`. Add font `<link>` tags BEFORE the
existing `<script>` tags based on the cascade result. Write the updated
file back.

### 2.5c: Generate brand.css

Write `{projectPath}/styles/brand.css` with brand values from
`brand.json`:

```css
:root {
  --heading-font-family: "{resolved heading font}", serif;
  --body-font-family: "{resolved body font}", sans-serif;
  --background-color: {brand.colors.background};
  --text-color: {brand.colors.text};
  --link-color: {brand.colors.link};
  --link-hover-color: {brand.colors.linkHover};
  --section-padding: {brand.spacing.sectionPadding};
  --nav-height: {brand.spacing.navHeight};
}

html, body { overflow: auto !important; }
```

> **Treat `brand.json` spacing as a hint, not ground truth.** Reconcile
> against the visual tree, which carries the real rendered measurements.

### 2.5d: Update styles.css — layout contract + brand import

Read `{projectPath}/styles/styles.css`. Add
`@import url('brand.css');` as the **VERY FIRST LINE** (CSS spec requires
`@import` before all other rules). Also update `:root` variables to match
brand values.

**Establish the layout contract.** Measure the source's content width,
gutters, and section spacing from the visual tree and screenshot, then
set these values in `styles.css` so every sub-agent builds against the
correct geometry:

```css
/* Layout contract — sub-agents MUST NOT override these */
main > .section > div {
  max-width: var(--content-max-width, 1200px);
  padding: 0 var(--content-gutter, 24px);
  margin: 0 auto;
}

.section {
  padding: var(--section-padding, 64px) 0;
}
```

**How to measure:**
- **Content max-width:** from the visual tree, find the widest content
  container inside `<main>` (not full-bleed heroes — those are edge
  cases). Use `brand.json`'s `spacing.contentMaxWidth` as a starting
  point, but verify against the visual tree's actual bounds.
- **Gutters:** measure the gap between the content edge and the viewport
  edge at 1440px. Typically 24–40px per side.
- **Section padding:** vertical spacing between sections. Use
  `brand.json`'s `spacing.sectionPadding` if non-zero, otherwise measure
  from the visual tree's y-offsets between sibling nodes.

**Full-bleed sections** (heroes, banners) that span the full viewport
should be handled by the orchestrator adding a `.section-metadata` with
`Style: full-width` during Phase 4 assembly, with a corresponding rule:

```css
main > .section.full-width > div {
  max-width: 100%;
  padding: 0;
}
```

This way blocks never need to override the wrapper themselves — the
layout contract covers both constrained and full-bleed sections.

**Do NOT add a global button reset.** Each block is responsible for
styling its own buttons with block-scoped specificity
(`main .{blockName} a.button:any-link`). A global reset forces every
block to override with `!important`, degrading CSS quality.

---

## Phase 3: Block Generation (Parallel Sub-Agents)

Spawn one sub-agent per **block** and monitor them until all complete.
Only then proceed to Phase 4.

**`default-content` items do NOT get sub-agents.** They are simple prose
that the orchestrator writes directly during Phase 4 assembly.

### Step 1 — Generate sub-agent configs via script

Run the prompt generator. It reads `decomposition.json`, `brand.json`,
and `block-inventory.json` from the migration directory and outputs
enriched sub-agent configs as JSON. Each prompt includes measured brand
tokens (colors, fonts, spacing), existing block inventory, and layout
contract instructions so sub-agents don't re-derive data from the live
page:

```bash
node {skillDir}/scripts/generate-agent-prompts.js {projectPath}/.migration
```

Parse the JSON output — an array of `{ name, prompt }` objects, one per
block.

### Step 2 — Spawn all sub-agents

Take the configs from Step 1 and create one parallel sub-agent for each.
DO NOT modify or regenerate the prompts — use them exactly as returned.

Each sub-agent receives its prompt and runs the appropriate skill
(`migrate-header` for header blocks, `migrate-block` for everything else).
The generated prompts already include all parameters and skill references.

### Step 3 — Monitor sub-agents until all complete

Track completion using the sub-agent configs from Step 1.

**Expected completion payload from each sub-agent** (JSON):

```json
{
  "done": true,
  "blockName": "hero",
  "status": "success|partial|failed",
  "iterations": 2,
  "hasHiddenPanes": false,
  "files": { "css": "...", "js": "...", "plainHtml": "..." },
  "issues": []
}
```

**Waiting protocol:**

1. Initialize a checklist of expected sub-agent names from the configs
2. As each sub-agent reports back, parse the JSON and mark it done
3. Record `status`, `files`, `issues`, and `hasHiddenPanes`
4. Continue waiting until every sub-agent has reported back

**Stuck sub-agent fallback:** If a sub-agent has not reported but the
others have all completed, check whether its `.plain.html` file exists
on disk. If yes, treat as done with `status: "partial"`. If no, mark
`status: "failed"`.

**Do NOT proceed to Phase 4 until all sub-agents are accounted for.**

---

## Phase 4: Assembly — MANDATORY STEPS

After ALL sub-agents complete, execute ALL of the following steps.

### Step 4.0: Check for Collateral Edits

Before assembly, check for unexpected changes sub-agents may have made
outside their block directories:

```bash
git diff --stat HEAD
```

Inspect the output. Expected changes are in `blocks/`, `styles/`,
`drafts/`, `head.html`, and `.migration/`. Any changes to `package.json`,
`scripts/scripts.js`, `tools/`, or other project infrastructure are
**collateral edits** — revert them before proceeding. Sub-agents
sometimes install linters, add dependencies, or modify shared scripts.
Attribution is obvious now but lost after assembly.

### Step 4.1: Collect Results

Use the completion payloads collected during Phase 3. For each block,
you already have `status`, `files`, and `issues`.

List any blocks with `status: "failed"` — flag these in the final summary.

**Carry `hasHiddenPanes` forward.** Any block that reported
`hasHiddenPanes: true` hides images in inactive panes. Before judging
images on the assembled preview, **reveal every pane first**.

### Step 4.2: Verify Brand and Layout Contract

`brand.css`, `styles.css`, and `head.html` were already updated in
Phase 2.5. Verify they are correct:

- `styles/brand.css` exists with `:root` variables
- `styles/styles.css` has `@import url('brand.css');` as FIRST LINE
- `styles/styles.css` has the layout contract (`max-width`, gutters,
  section padding) matching source measurements
- `head.html` has font `<link>` tags
- No sub-agent has overridden `.{blockName}-wrapper` max-width or
  padding — if any did, remove the override and apply a
  `.section.full-width` style via section-metadata instead

If anything is missing or violated, fix it now.

### Step 4.3: Assemble Page Content — MANDATORY

Write the main page to
`{projectPath}/drafts/{page-path}.plain.html`.

Read each block sub-agent's `.plain.html` file and combine them into
sections following the decomposition order:

```html
<div>
  <div class="hero">
    <!-- paste hero sub-agent's .plain.html block content -->
  </div>
</div>
<div>
  <div class="cards">
    <!-- paste cards sub-agent's .plain.html block content -->
  </div>
</div>
```

**Rules:**

- Each section is a top-level `<div>`
- Blocks inside sections: `<div class="blockname">` with content from
  the sub-agent's `.plain.html`
- Section styles from decomposition → add `<div class="section-metadata">`
- Images use `/drafts/images/` root-relative paths — **local preview only**
- Default-content items: extract from source page and write as plain HTML
- Do NOT include a `<div class="metadata">` block with nav/footer paths

### Step 4.4: Create Full Preview Page — MANDATORY

Write `{projectPath}/drafts/{page-path}-preview.html`:

```html
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="nav" content="/drafts/nav">
  <meta name="footer" content="/drafts/footer">
  {PASTE <script> AND <link> TAGS FROM head.html}
  <style>html, body { overflow: auto !important; }</style>
</head>
<body>
  <header></header>
  <main>
    {PASTE THE CONTENT OF THE ASSEMBLED .plain.html}
  </main>
  <footer></footer>
</body>
</html>
```

Serve the project root (`{projectPath}`) as a static site and open
`drafts/{page-path}-preview.html` in the browser.

Wait for all blocks to load before screenshotting. Verify by executing
JS in the page:

```javascript
JSON.stringify({
  blocks: document.querySelectorAll(
    '[data-block-status="loaded"]'
  ).length,
  appear: document.body.classList.contains('appear')
})
```

**Wait for images to settle** (same gate as Phase 1 — force
`loading="eager"`, await all decodes) before capturing.

Then take a full-page screenshot and save to
`{projectPath}/.migration/preview-assembled.png`.

### Step 4.5: Git Commit — OPT-IN

**Skip unless the user explicitly requested a commit.**

```bash
git add blocks/ styles/ drafts/
git commit -m "feat: migrate {page-path} from {source-domain}"
```

### Step 4.6: Final Summary

Report to the user:

- Number of blocks migrated and their statuses
- Visual verification results per block
- Brand.css and styles.css: what was updated
- Assembled page preview URL
- Any issues, gaps, or incomplete items
- Path to all reports in `.migration/reports/`

---

## Reference: Four Content Models

1. **Standalone** — One-off (hero, blockquote): single row, mixed cells
2. **Collection** — Repeating items (cards, carousel): rows = items,
   cells = item parts (image, title, description)
3. **Configuration** — Key-value pairs (blog listing config): 2-column,
   col1 = key, col2 = value. Only for API-driven content.
4. **Auto-Blocked** — Authors write standard content, pattern detection
   creates block (tabs, accordion). Rare in migration.

Use Standalone or Collection for most blocks. NEVER use Configuration
for static content.

## Reference: Quality Criteria

| Criterion | Target |
| ----------- | -------- |
| Block visual similarity | >= 85% acceptable, >= 95% ideal |
| Header visual similarity | >= 85% (interactive states differ) |
| Max iterations per block | 3 |
| Max iterations for header | 5 |
| .plain.html format | NO html/head/body/script tags |
| CSS scoping | All rules under .blockname |
| Header CSS scoping | All rules under .header.block |
| Responsive | At least one breakpoint (900px) |
| Images | <picture><img> with alt text |
| Report schema | Exact schema, no extra keys |
