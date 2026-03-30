---
name: migrate-page
description: Migrate a web page to AEM Edge Delivery Services. Extracts page structure, decomposes into blocks, generates EDS-compatible code, and verifies with visual comparison.
allowed-tools: bash
---

# EDS Page Migration

Migrate a web page into AEM Edge Delivery Services: extract structure,
decompose into blocks, generate EDS-compatible code per block, and verify
each with visual comparison.

## IMPORTANT: Cone-Only Skill

**This skill MUST be executed by the cone directly. Do NOT delegate the
migration to a scoop.** The cone runs Phases 1–2.5 and 4 itself. Only
Phase 3 (block generation) creates scoops — one per block. Scoops cannot
create other scoops, so the cone must be the orchestrator.

## Triggers

"migrate this page", "convert to EDS", "create EDS blocks from URL".
User provides a URL. The target repo is `aemcoder/vibemigrated` (hardcoded).

## Sprinkle Trigger

When this skill is triggered via a **sprinkle lick event** (type
`sprinkle`, skill `migrate-page`), the cone handles the lick directly
and runs `sprinkle send` commands. This overrides Rules 2 and 5 in
`/shared/CLAUDE.md` — the cone MUST handle this lick itself because it
creates scoops in Phase 3 (scoops cannot create scoops), making the
cone the only viable orchestrator.

### Lick Handling

1. Run `playwright-cli tab-list` and find the entry with `active: true`.
   Extract its URL.
2. If no active HTTP(S) tab exists, send an error and stop:
   ```bash
   sprinkle send migrate-page '{"phase":"error","message":"No page to migrate — navigate to a webpage first"}'
   ```
3. The target repo is `aemcoder/vibemigrated`. No config read needed.
4. Start Phase 1 with the extracted URL.

### Progress Reporting

At each phase transition, run BOTH:

- `sprinkle send migrate-page '<json>'` — updates the live sprinkle UI
- `write_file /workspace/skills/migrate-page/migrate-config.json` with
  updated `currentMigration` — persists state for recovery

Phase transition points:

| When | phase | status | detail |
|------|-------|--------|--------|
| Phase 1 starts | `extraction` | `running` | — |
| Phase 1 complete | `extraction` | `done` | — |
| Phase 2 starts | `decomposition` | `running` | — |
| Phase 2 complete | `decomposition` | `done` | {N} blocks identified |
| Phase 3 starts | `blocks` | `running` | block names |
| Phase 3 scoop completes | `blocks` | `running` | name1, name2 ({done}/{total}) |
| Phase 3 complete | `blocks` | `done` | — |
| Phase 4 starts | `assembly` | `running` | — |
| Phase 4 complete (success) | `done` | — | set `url` and `previewUrl` |
| Any phase fails | `error` | — | set `message` |

On completion, clear `currentMigration` (set to `null` in config).

## Four Phases

1. **Extraction** — cone clones repo, navigates to URL, runs extraction scripts
2. **Decomposition** — cone classifies visual tree into fragments/sections/blocks
3. **Block Generation** — cone creates one scoop per block, monitors until all complete
4. **Assembly** — cone collects results, builds page, commits

---

## Phase 1: Extraction

User provides a URL. The target repo is `aemcoder/vibemigrated` (hardcoded).

### Step 1.1: Clone and Branch

Clone the target EDS repo and create a migration branch:

~~~
bash: git clone https://github.com/aemcoder/vibemigrated.git /shared/vibemigrated --depth 1
bash: cd /shared/vibemigrated && git checkout -b {page-slug}-$(date +%s | tail -c 7)
~~~

Where `{page-slug}` is derived from the URL path (e.g.,
`/products/widget` -> `products-widget`, homepage -> `home`).

The branch name has NO prefix (no `migrate/`). It is used as:
1. The Git branch name
2. The DA content folder path
3. Part of the preview URL

Store the branch name in a variable `{branch}` for all subsequent steps.

~~~
bash: mkdir -p /shared/vibemigrated/.migration
~~~

### Step 1.2: Navigate to Source Page

Open the source URL in a new browser tab:

```bash
playwright-cli tab-new {sourceUrl}
```

Capture the **targetId** from the output (e.g., `SRC123`). All subsequent
`playwright-cli` commands for this source tab MUST include `--tab={sourceTabId}`.

### Step 1.3: Dismiss Overlays

Delegate to the **dismiss-overlays** skill to handle cookie banners, consent
dialogs, and other overlays on the source page. Pass `{sourceTabId}` as the
target tab. The skill handles its own visual verification and cleanup —
no overlay artifacts persist.

### Step 1.4: Lazy-Load Scroll

Scroll the page top-to-bottom to trigger lazy-loaded images and sections:

```bash
playwright-cli eval-file --tab={sourceTabId} /workspace/skills/migrate-page/scripts/lazy-load-scroll.js
```

### Step 1.5: De-Sticky

Convert `position: fixed` elements to `position: relative` so they don't
overlap content in the visual tree or full-page screenshot:

```bash
playwright-cli eval-file --tab={sourceTabId} /workspace/skills/migrate-page/scripts/de-sticky.js
```

### Step 1.6: Extract Visual Tree

Run the visual tree extraction and save directly to file:

```bash
playwright-cli eval-file --tab={sourceTabId} /workspace/skills/migrate-page/scripts/visual-tree.js --output=/shared/vibemigrated/.migration/visual-tree.json
```

### Step 1.7: Full-Page Screenshot

Capture the page after all preparation. This is the only screenshot used
by downstream phases (decomposition, visual comparison):

```bash
playwright-cli screenshot --tab={sourceTabId} --fullPage=true --max-width=1440 --filename=/shared/vibemigrated/.migration/screenshot.png
bash: ls -la /shared/vibemigrated/.migration/screenshot.png
```

Verify the file exists and has a reasonable size (>10 KB).

### Step 1.8: Extract Brand Data

```bash
playwright-cli eval-file --tab={sourceTabId} /workspace/skills/migrate-page/scripts/brand-extract.js --output=/shared/vibemigrated/.migration/brand.json
```

### Step 1.9: Extract Metadata

```bash
playwright-cli eval-file --tab={sourceTabId} /workspace/skills/migrate-page/scripts/metadata-extract.js --output=/shared/vibemigrated/.migration/metadata.json
```

### Step 1.10: Scan Block Inventory

Read the block inventory script and run it via the JavaScript tool:

```javascript
const script = await fs.readFile('/workspace/skills/migrate-page/scripts/block-inventory.js', { encoding: 'utf-8' });
eval(script);
const blocks = await scanBlockInventory('/shared/vibemigrated');
await fs.writeFile('/shared/vibemigrated/.migration/block-inventory.json', JSON.stringify(blocks, null, 2));
return JSON.stringify({ blockCount: blocks.length, blocks: blocks.map(b => b.name) });
```

### Extraction Artifacts

After Phase 1, these files exist in `/shared/vibemigrated/.migration/`:

| Artifact | Purpose |
|----------|---------|
| `screenshot.png` | Full-page screenshot after prep (for decomposition) |
| `visual-tree.json` | Spatial hierarchy (bounds, backgrounds, selectors) |
| `brand.json` | Fonts, colors, spacing |
| `metadata.json` | Title, description, OG tags |
| `block-inventory.json` | Existing blocks in the EDS project |

---

## Phase 2: Decomposition

Read `visual-tree.json` and `screenshot.png`. The visual tree is used ONLY
for decomposition (identifying what regions exist and classifying them). It
is NOT used for content extraction — scoops extract content from the live
page in Phase 3.

### Visual Tree Format

```
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

### Three Fragments

Every page decomposes into exactly 3 fragments:
1. `/nav` — header/navigation
2. `/{page-path}` — main content
3. `/footer` — page footer

### Output

Write `decomposition.json` to `/shared/vibemigrated/.migration/`:

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

### Close Source Tab

The source tab is no longer needed — all subsequent phases work from
extracted artifacts, not the live page. Close it to free resources and
prevent scoops from confusing it with their own tabs:

```bash
playwright-cli tab-close --tab={sourceTabId}
```

---

## Phase 2.5: Prepare Brand, Fonts, and Styles

The cone sets up brand, fonts, and styles BEFORE creating scoops in Phase 3.
Scoops need these in place so their preview pages load with correct fonts,
colors, and spacing.

### 2.5a: Resolve Fonts

1. Read `.migration/brand.json` — check `fonts.sources.typekit` and
   `fonts.sources.googleFonts`
2. Resolve font delivery using this cascade (first match wins):

   **a. Source has Adobe Fonts (Typekit)?**
   If `fonts.sources.typekit` is not null → use the source's kit directly.
   The source's kit has the exact fonts the page uses and works in preview.
   Link: `https://use.typekit.net/{fonts.sources.typekit}.css`

   **b. Source has Google Fonts?**
   If `fonts.sources.googleFonts` has URLs → use those URLs directly.

   **c. Font in our fallback Typekit kit `cwm0xxe`?**
   Check: `https://typekit.com/api/v1/json/kits/cwm0xxe/published`
   (public API, no auth). If the font family appears → use kit `cwm0xxe`.
   Link: `https://use.typekit.net/cwm0xxe.css`

   **d. Font available on Google Fonts?**
   Check: `https://fonts.googleapis.com/css2?family={FontName}:wght@400;700&display=swap`
   If 200 OK → use that URL.

   **e. System font fallback**
   Use the extracted font name with generic fallback (serif/sans-serif).

### 2.5b: Update head.html

Read `/shared/vibemigrated/head.html`. Add font `<link>` tags BEFORE the
existing `<script>` tags based on the cascade result:

- Adobe Fonts: `<link rel="stylesheet" href="https://use.typekit.net/{projectId}.css">`
- Google Fonts: preconnects + `<link href="{url}" rel="stylesheet">`

Write the updated `head.html` back.

### 2.5c: Generate brand.css

Write `/shared/vibemigrated/styles/brand.css` with brand values from
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

### 2.5d: Update styles.css with @import

Read `/shared/vibemigrated/styles/styles.css`. Add `@import url('brand.css');`
as the **VERY FIRST LINE** (CSS spec requires `@import` before all other
rules). Also update `:root` variables to match brand values.

Add a global EDS button reset after `:root`:

```css
main .button-container { display: inline; }
main a.button:any-link {
  background: none; border: none; border-radius: 0;
  color: var(--link-color); font-size: inherit; font-weight: inherit;
  padding: 0; margin: 0; text-decoration: underline; white-space: normal;
}
```

Write the updated `styles.css` back.

Now scoops will preview with correct fonts, colors, spacing, and button
behavior from the start.

---

## Phase 3: Block Generation (Parallel Scoops)

The cone creates one scoop per **block** and monitors them until all complete.
Only then does the cone proceed to Phase 4. **Do NOT drop scoops** — keep
them alive for user review and debugging. Never call `drop_scoop` during
migration.

**`default-content` items do NOT get scoops.** They are simple prose
(headings, paragraphs, lists, images) that the cone writes directly
during Phase 4 assembly. The cone extracts default-content text from
the source page and writes it inline in the assembled .plain.html.

### PERFORMANCE: Batch All Scoop Operations

Scoop creation and feeding are the biggest time sinks because each tool
call requires an LLM turn. **Minimize the number of LLM turns** by
batching operations:

**Step 1 — Generate scoop configs via script** (1 tool call, NO LLM generation):

Use the JavaScript tool to generate all scoop prompts mechanically.
This avoids the cone spending tokens generating repetitive prompt text.

```javascript
const decomposition = JSON.parse(await fs.readFile('/shared/vibemigrated/.migration/decomposition.json', { encoding: 'utf-8' }));
const script = await fs.readFile('/workspace/skills/migrate-page/scripts/generate-scoop-prompts.js', { encoding: 'utf-8' });
eval(script);
// Optional: pass a model ID as 4th argument to use a different model for scoops
// e.g., 'claude-sonnet-4-6' for faster/cheaper block generation
const configs = generateScoopConfigs(decomposition, '{sourceUrl}', '/shared/vibemigrated');
return JSON.stringify(configs);
```

This returns an array of `{ name, model, prompt }` objects — one per block.

**Step 2 — Create AND feed ALL scoops in a SINGLE response** (N tool calls, 1 LLM turn):

Take the configs from Step 1 and call `scoop_scoop` for each one.
DO NOT modify or regenerate the prompts — use them exactly as returned.
```
scoop_scoop({ "name": configs[0].name, "model": configs[0].model, "prompt": configs[0].prompt })
scoop_scoop({ "name": configs[1].name, "model": configs[1].model, "prompt": configs[1].prompt })
... one per config, all in ONE response
```

This reduces scoop setup to ~2 LLM turns (generate configs + create all).
The cone does NOT generate prompt text — the script does it mechanically.

### How the Script Works

The `generate-scoop-prompts.js` script handles all three block types:
- **Header blocks** (nav-bar, header, navigation, or /nav fragment) → uses `migrate-header` skill
- **Footer blocks** (footer, footer-links, footer-content, or /footer fragment) → uses `migrate-block` skill with footer special case
- **All other blocks** → uses `migrate-block` skill

Each generated prompt includes the block parameters, head.html content,
and instructions to read the appropriate skill. The cone does NOT need
to generate or modify any prompt text.

### Step 3 — Monitor scoops until all complete

After creating all scoops, the cone waits for each scoop to finish. Scoops
use `send_message` to notify the cone when done. The cone checks for
incoming messages and tracks which scoops have reported back.

**Do NOT proceed to Phase 4 until ALL scoops have completed.** If a scoop
fails or gets stuck, the cone should note the issue and continue once all
other scoops have reported. Missing block reports will be flagged in Phase 4.

---

## Phase 4: Assembly — MANDATORY STEPS

After ALL scoops complete, the cone MUST execute ALL of the following steps.
Do not skip any. Phase 4 is not optional — it produces the final deliverables.

**Do NOT drop scoops.** Keep them alive for user review.

### Step 4.1: Read Reports

Read ALL reports from `/shared/vibemigrated/.migration/reports/`.
For each block, check:
- `status`: success/partial/failed
- `edsVerification`: did the EDS framework load?
- `issues`: any problems to address

List any missing reports — every block scoop MUST produce a report.

### Step 4.2: Verify Brand Setup

`brand.css`, `styles.css`, and `head.html` were already updated in
Phase 2.5. Verify they are correct:

- `styles/brand.css` exists with `:root` variables
- `styles/styles.css` has `@import url('brand.css');` as FIRST LINE
- `styles/styles.css` has the global button reset
- `head.html` has Typekit/Google Fonts `<link>` tags

If anything is missing (Phase 2.5 was skipped or failed), do it now:

### Step 4.3: Assemble Page Content — MANDATORY

Write the main page to `/shared/vibemigrated/drafts/{page-path}.plain.html`.

Read each block scoop's `.plain.html` file and combine them into sections
following the decomposition order:

```html
<div>
  <div class="hero">
    <!-- paste hero scoop's .plain.html block content -->
  </div>
</div>
<div>
  <div class="cards">
    <!-- paste cards scoop's .plain.html block content -->
  </div>
</div>
```

**Rules:**
- Each section is a top-level `<div>`
- Blocks inside sections: `<div class="blockname">` with the content
  from the scoop's `.plain.html` (copy the block div, not the section wrapper)
- Section styles from decomposition → add `<div class="section-metadata">`
- Images use `/drafts/images/` root-relative paths
- Default-content items (from decomposition): extract from source page
  and write as plain HTML (headings, paragraphs, lists) in their section
- **Metadata block — REQUIRED:** At the very end of the assembled
  `.plain.html`, append a metadata block with nav and footer paths
  pointing to the branch-specific DA folder:

  ```html
  <div>
    <div class="metadata">
      <div><div>nav</div><div>/{branch}/nav</div></div>
      <div><div>footer</div><div>/{branch}/footer</div></div>
    </div>
  </div>
  ```

  This tells EDS to load nav/footer from the migration's own folder
  instead of the site default. Each migration gets isolated nav/footer
  documents so multiple migrations don't interfere with each other.

### Step 4.4: Create Full Preview Page — MANDATORY

Write `/shared/vibemigrated/drafts/{page-path}-preview.html`:

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

Serve and verify:
```bash
serve --entry=drafts/{page-path}-preview.html --project /shared/vibemigrated
```

Capture the **targetId** from the output. All subsequent commands for this
preview tab MUST include `--tab={previewTabId}`.

Wait for all blocks to load before screenshotting. The page has header
(fragment load) + multiple content blocks + footer (fragment load) — these
load asynchronously. Verify with:

```bash
playwright-cli eval --tab={previewTabId} "JSON.stringify({ blocks: document.querySelectorAll('[data-block-status=\"loaded\"]').length, appear: document.body.classList.contains('appear') })"
```

Wait until all expected blocks show `status: "loaded"`. Then take the screenshot:
```bash
playwright-cli screenshot --tab={previewTabId} --fullPage=true --max-width=1440 --filename=/shared/vibemigrated/.migration/preview-assembled.png
bash: ls -la /shared/vibemigrated/.migration/preview-assembled.png
```

### Step 4.5: Git Commit — MANDATORY

```bash
git add blocks/ styles/ drafts/
git commit -m "feat: migrate {page-path} from {source-domain}"
```

### Step 4.6: Final Summary

Report to the user:
- Number of blocks migrated and their statuses
- Visual verification results per block (from reports)
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
|-----------|--------|
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
