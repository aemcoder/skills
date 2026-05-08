# Flavor-Aware Migration Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the three migration skills (`migrate-page`, `migrate-block`, `migrate-header`) work across multiple EDS boilerplate flavors by extracting flavor-specific rules into peer reference files per skill. Ship with two flavors: `aem-js` (default) and `author-kit`.

**Architecture:** The cone detects the flavor once in Phase 1 and writes `.migration/flavor.json`. Each `SKILL.md` becomes flavor-agnostic; concrete rules live in `references/{flavor}.md` files using a fixed heading structure per skill. `generate-scoop-prompts.js` reads `flavor.json` and appends a `## Flavor Context` block to every generated scoop prompt.

**Tech Stack:** Markdown (`SKILL.md` files, reference files), Node.js (`generate-scoop-prompts.js`), Bash (Phase 1 detection), Slicc runtime for end-to-end verification.

**Spec:** `docs/specs/2026-04-23-flavor-aware-migration-skills-design.md`

**Source material for author-kit content:** `/Users/catalan/Downloads/author-kit-findings.md`

---

## File Structure

- **Modify:** `migration/migrate-page/scripts/generate-scoop-prompts.js` — accept flavor, inject context block
- **Modify:** `migration/migrate-page/SKILL.md` — add Phase 1 detection step; rewrite Phase 2.5 + 4 to reference flavor files
- **Modify:** `migration/migrate-block/SKILL.md` — rewrite to reference flavor files
- **Modify:** `migration/migrate-header/SKILL.md` — rewrite to reference flavor files
- **Create:** `migration/migrate-page/references/aem-js.md`
- **Create:** `migration/migrate-page/references/author-kit.md`
- **Create:** `migration/migrate-block/references/aem-js.md`
- **Create:** `migration/migrate-block/references/author-kit.md`
- **Create:** `migration/migrate-header/references/aem-js.md`
- **Create:** `migration/migrate-header/references/author-kit.md`

Per-skill reference pairs live next to each `SKILL.md`. `dismiss-overlays/` is untouched.

---

### Task 1: Thread flavor through `generate-scoop-prompts.js`

Teach the script to read `.migration/flavor.json`, thread the flavor string through the three prompt builders, and append a `## Flavor Context` block to every generated prompt. The script already accepts a migration directory as its first CLI arg, so reading `flavor.json` from the same directory is natural.

**Files:**
- Modify: `migration/migrate-page/scripts/generate-scoop-prompts.js`

- [ ] **Step 1: Create test fixtures**

```bash
mkdir -p /tmp/flavor-test/.migration
cat > /tmp/flavor-test/.migration/decomposition.json <<'EOF'
{
  "url": "https://example.com/test",
  "fragments": [
    { "path": "/nav", "children": [
      { "type": "block", "name": "nav-bar", "id": "rc0", "bounds": { "x": 0, "y": 0, "width": 1440, "height": 80 } }
    ]},
    { "path": "/page", "children": [
      { "type": "block", "name": "hero", "id": "rc1", "bounds": { "x": 0, "y": 80, "width": 1440, "height": 600 } }
    ]},
    { "path": "/footer", "children": [
      { "type": "block", "name": "footer-links", "id": "rc99", "bounds": { "x": 0, "y": 680, "width": 1440, "height": 200 } }
    ]}
  ]
}
EOF
cat > /tmp/flavor-test/.migration/flavor.json <<'EOF'
{"flavor":"author-kit"}
EOF
```

- [ ] **Step 2: Run the current script — confirm no flavor context yet**

Run from the repo root:

```bash
node migration/migrate-page/scripts/generate-scoop-prompts.js /tmp/flavor-test/.migration | grep -c "Flavor Context" || true
```

Expected: `0` (the string is absent from current output).

- [ ] **Step 3: Modify `generateScoopConfigs` to accept and require a flavor**

Update the function signature (line 14) and the dispatch loop (lines ~42) so flavor is threaded to the three build functions:

```javascript
function generateScoopConfigs(decomposition, sourceUrl, projectPath, model = 'claude-opus-4-6', flavor = null) {
  if (!flavor) {
    throw new Error('Flavor is required. Expected .migration/flavor.json with {"flavor":"aem-js"} or {"flavor":"author-kit"}.');
  }
  const configs = [];
  for (const fragment of decomposition.fragments) {
    for (const child of fragment.children || []) {
      if (child.type === 'default-content') continue;
      const blocks = child.type === 'section'
        ? (child.children || []).filter(c => c.type === 'block')
        : [child];
      for (const block of blocks) {
        const isHeader = block.name === 'nav-bar' || block.name === 'header'
          || block.name === 'navigation' || fragment.path === '/nav';
        const isFooter = block.name === 'footer' || block.name === 'footer-links'
          || block.name === 'footer-content' || fragment.path === '/footer';
        const scoopName = block.name + '-block';
        const bounds = block.bounds
          ? `x=${block.bounds.x}, y=${block.bounds.y}, width=${block.bounds.width}, height=${block.bounds.height}`
          : 'unknown';
        let prompt;
        if (isHeader) {
          prompt = buildHeaderPrompt(block, sourceUrl, projectPath, bounds, flavor);
        } else if (isFooter) {
          prompt = buildFooterPrompt(block, sourceUrl, projectPath, bounds, flavor);
        } else {
          prompt = buildBlockPrompt(block, sourceUrl, projectPath, bounds, flavor);
        }
        const config = { name: scoopName, prompt };
        if (model) config.model = model;
        configs.push(config);
      }
    }
  }
  return configs;
}
```

- [ ] **Step 4: Add a `flavorContext` helper and update the three build functions**

Insert the helper after `generateScoopConfigs` and before `buildBlockPrompt`:

```javascript
function flavorContext(flavor, skillName) {
  return `
## Flavor Context
This project uses the ${flavor} EDS boilerplate. After reading the skill,
ALSO read /workspace/skills/${skillName}/references/${flavor}.md. It
overrides the skill's defaults — most notably framework entry, preview
verification, button decoration, and footer/card contracts.`;
}
```

Update each build function to accept `flavor` and append the context block at the end of its template literal. The full updated `buildBlockPrompt`:

```javascript
function buildBlockPrompt(block, sourceUrl, projectPath, bounds, flavor) {
  return `You are migrating a single block to EDS.

## Parameters
- Block name: ${block.name}
- Source URL: ${sourceUrl}
- Visual tree ID: ${block.id || 'unknown'}
- Bounds: ${bounds}
- EDS project: ${projectPath}
- Notes: ${block.notes || block.style || ''}

## Instructions
Read /workspace/skills/migrate-block/SKILL.md and follow every step.
The skill tells you how to read head.html from the project.
Do NOT inline CSS or JS as a substitute for the EDS framework.
${flavorContext(flavor, 'migrate-block')}`;
}
```

The full updated `buildHeaderPrompt`:

```javascript
function buildHeaderPrompt(block, sourceUrl, projectPath, bounds, flavor) {
  return `You are migrating the website header/navigation to EDS.

## Parameters
- Source URL: ${sourceUrl}
- EDS project: ${projectPath}
- Bounds: ${bounds}
- Notes: ${block.notes || block.style || ''}

## Instructions
Read /workspace/skills/migrate-header/SKILL.md and follow it exactly.
This is a HEADER migration, not a regular block. Follow the header skill
exactly — it handles nav.plain.html generation, section-metadata styles,
dropdown detection, and header-specific CSS patterns.
${flavorContext(flavor, 'migrate-header')}`;
}
```

The full updated `buildFooterPrompt`:

```javascript
function buildFooterPrompt(block, sourceUrl, projectPath, bounds, flavor) {
  return `You are migrating a single block to EDS.

## Parameters
- Block name: ${block.name}
- Source URL: ${sourceUrl}
- Visual tree ID: ${block.id || 'unknown'}
- Bounds: ${bounds}
- EDS project: ${projectPath}
- Special: This is the FOOTER block. Output footer.plain.html, not ${block.name}.plain.html. See "Footer Block — Special Case" in the migrate-block skill.
- Notes: ${block.notes || block.style || ''}

## Instructions
Read /workspace/skills/migrate-block/SKILL.md and follow every step.
The skill tells you how to read head.html from the project.
Do NOT inline CSS or JS as a substitute for the EDS framework.
${flavorContext(flavor, 'migrate-block')}`;
}
```

- [ ] **Step 5: Update the CLI entry point to read `flavor.json`**

Replace the existing CLI block at the bottom of the file:

```javascript
if (typeof process !== 'undefined' && process.argv?.[2]) {
  const migrationDir = process.argv[2];
  const decomposition = JSON.parse(
    await fs.readFile(migrationDir + '/decomposition.json', { encoding: 'utf-8' })
  );
  const flavorJson = JSON.parse(
    await fs.readFile(migrationDir + '/flavor.json', { encoding: 'utf-8' })
  );
  const projectPath = migrationDir.replace(/\/.migration\/?$/, '');
  const model = process.argv[3] || 'claude-opus-4-6';
  const configs = generateScoopConfigs(
    decomposition, decomposition.url, projectPath, model, flavorJson.flavor
  );
  console.log(JSON.stringify(configs));
}
```

- [ ] **Step 6: Run the script with fixtures — verify flavor context appears**

```bash
node migration/migrate-page/scripts/generate-scoop-prompts.js /tmp/flavor-test/.migration | jq -r '.[0].prompt' | grep "Flavor Context"
```

Expected output includes `## Flavor Context`.

```bash
node migration/migrate-page/scripts/generate-scoop-prompts.js /tmp/flavor-test/.migration | jq -r '.[].prompt' | grep -c "author-kit"
```

Expected: `3` (one per scoop: nav-bar, hero, footer-links).

```bash
node migration/migrate-page/scripts/generate-scoop-prompts.js /tmp/flavor-test/.migration | jq -r '.[0].prompt' | grep "migrate-header"
```

Expected: the first scoop (nav-bar) references `migrate-header/references/author-kit.md`.

- [ ] **Step 7: Verify it fails cleanly when `flavor.json` is missing**

```bash
rm /tmp/flavor-test/.migration/flavor.json
node migration/migrate-page/scripts/generate-scoop-prompts.js /tmp/flavor-test/.migration
```

Expected: the script exits with a non-zero code and an error mentioning `flavor.json`.

- [ ] **Step 8: Cleanup fixtures**

```bash
rm -rf /tmp/flavor-test
```

- [ ] **Step 9: Commit**

```bash
git add migration/migrate-page/scripts/generate-scoop-prompts.js
git commit -m "feat(migration): thread flavor through scoop prompt generation"
```

---

### Task 2: Add Phase 1 flavor detection step to `migrate-page/SKILL.md`

Insert a detection step between Step 1.1 (Clone and Branch) and the current Step 1.2 (Navigate to Source Page), renumber the subsequent steps, and add `flavor.json` to the extraction artifacts table.

**Files:**
- Modify: `migration/migrate-page/SKILL.md`

- [ ] **Step 1: Insert the detection step after Step 1.1**

After the closing line of Step 1.1 (the `Date.now().toString(36)` example, currently around line 103), insert this new step:

````markdown
### Step 1.2: Detect EDS Flavor

Check which EDS boilerplate the project uses. The detected flavor drives
which reference files the cone and scoops load during subsequent phases.

```bash
if [ -f /shared/{repo-name}/scripts/ak.js ]; then flavor=author-kit
elif [ -f /shared/{repo-name}/scripts/aem.js ]; then flavor=aem-js
else flavor=unknown
fi
echo "{\"flavor\":\"$flavor\"}" > /shared/{repo-name}/.migration/flavor.json
```

If `flavor=unknown` (neither `scripts/aem.js` nor `scripts/ak.js` exists in
the repo), halt migration:

```bash
sprinkle send migrate-page '{"phase":"error","message":"Unknown EDS flavor — scripts/aem.js and scripts/ak.js both missing. Add references/{name}.md across the three skills and re-run."}'
```

Do NOT fall back to `aem-js` silently — the migration would produce broken
output on an unrecognized boilerplate.

For `aem-js` or `author-kit`, read the flavor-specific cone reference so
you apply the right rules during Phase 2.5 and Phase 4:

```
read_file /workspace/skills/migrate-page/references/{flavor}.md
```
````

- [ ] **Step 2: Renumber the subsequent Phase 1 steps**

Apply these exact renames (use Edit with `replace_all: false` one at a time — they are unique):

| Old heading | New heading |
|---|---|
| `### Step 1.2: Navigate to Source Page` | `### Step 1.3: Navigate to Source Page` |
| `### Step 1.3: Dismiss Overlays (opt-in, skipped by default)` | `### Step 1.4: Dismiss Overlays (opt-in, skipped by default)` |
| `### Step 1.4: Lazy-Load Scroll` | `### Step 1.5: Lazy-Load Scroll` |
| `### Step 1.5: De-Sticky` | `### Step 1.6: De-Sticky` |
| `### Step 1.6: Extract Visual Tree` | `### Step 1.7: Extract Visual Tree` |
| `### Step 1.7: Full-Page Screenshot` | `### Step 1.8: Full-Page Screenshot` |
| `### Step 1.8: Extract Brand Data` | `### Step 1.9: Extract Brand Data` |
| `### Step 1.9: Extract Metadata` | `### Step 1.10: Extract Metadata` |
| `### Step 1.10: Scan Block Inventory` | `### Step 1.11: Scan Block Inventory` |

- [ ] **Step 3: Add `flavor.json` to the extraction artifacts table**

In the "Extraction Artifacts" table, add this row as the first entry (before `screenshot.png`):

```markdown
| `flavor.json` | Detected EDS boilerplate flavor (aem-js or author-kit) |
```

- [ ] **Step 4: Verify file still reads correctly**

```bash
grep -E "^### Step 1\." migration/migrate-page/SKILL.md
```

Expected: 11 lines, each matching `### Step 1.N: ...` in numeric order from 1.1 to 1.11.

- [ ] **Step 5: Commit**

```bash
git add migration/migrate-page/SKILL.md
git commit -m "feat(migrate-page): add flavor detection to Phase 1"
```

---

### Task 3: Refactor `migrate-block` — create references and make `SKILL.md` flavor-agnostic

Create both flavor reference files using the heading structure from the spec, then edit `SKILL.md` to replace flavor-specific content with pointers to the reference files.

**Files:**
- Create: `migration/migrate-block/references/aem-js.md`
- Create: `migration/migrate-block/references/author-kit.md`
- Modify: `migration/migrate-block/SKILL.md`

- [ ] **Step 1: Create `migration/migrate-block/references/aem-js.md`**

Use this full structure. Content for each section should be extracted from the current `SKILL.md` — the line ranges indicate where to pull from. Keep the prose but strip the step-numbering references so content stands alone.

```markdown
# aem-js — migrate-block overrides

Flavor-specific rules for the standard EDS boilerplate (`scripts/aem.js`).
Read this after the main `SKILL.md` — it overrides the skill's defaults
where they conflict.

## Framework entry

The entry script is `scripts/aem.js`. During page load, `loadEager()`
runs `decorateMain()` then `loadSection()` on the first section. Once
the first section's blocks load, `aem.js` adds the `appear` class to
`<body>`. `loadLazy()` then loads remaining sections, fonts, and the
footer. Blocks carry `data-block-status="loading"` while they load and
`data-block-status="loaded"` once ready — these attributes persist.

## Preview verification (Step 6c)

Run this eval to confirm the framework loaded before visual verification:

\`\`\`bash
playwright-cli eval --tab={previewTabId} "JSON.stringify({ hlx: !!window.hlx, codeBasePath: window.hlx?.codeBasePath, bodyAppear: document.body.classList.contains('appear'), sections: document.querySelectorAll('.section').length, blocks: Array.from(document.querySelectorAll('[data-block-name]')).map(b => ({ name: b.dataset.blockName, status: b.dataset.blockStatus })) })"
\`\`\`

Required results:
- `hlx` is `true`
- `codeBasePath` is a non-empty string
- `bodyAppear` is `true`
- Your block appears in `blocks` with `status: "loaded"`

If any check fails, stop and debug — do not work around framework
failures by inlining CSS/JS.

## Button decoration

`decorateButtons()` (called during `decorateMain()`) automatically
transforms standalone paragraph links into buttons:

\`\`\`html
<!-- Authored .plain.html -->
<p><a href="/cta">Learn More</a></p>

<!-- After decoration -->
<p class="button-container"><a href="/cta" class="button">Learn More</a></p>
\`\`\`

Plain `<p><a>` becomes `.button`. EDS also applies `text-align: center`
to `.button` elements by default.

Check `{projectPath}/styles/styles.css` for project-level button resets
before writing overrides. Use `main .{blockName} a.button:any-link` as
your baseline selector to match project reset specificity.

## Full-width blocks

EDS wraps sections in `.section > div { max-width: 1200px }`. Full-bleed
blocks (heroes, banners) need their wrapper overridden:

\`\`\`css
.{blockName}-wrapper {
  max-width: 100% !important;
  padding: 0 !important;
}
\`\`\`

## Card block contract

No special picture-wrapping requirement. Bare `<picture>` in a cell works
fine — `decorateMain()` will wrap it in a `<p>` automatically, but since
aem-js's card block (if any) doesn't require picture promotion, content
renders correctly either way.

## Footer meta tag

Set `<meta name="footer" content="/drafts/footer">` in the preview HTML.
The EDS framework reads this meta tag and loads the fragment at the
referenced path.

## Known quirks

- **Icon rendering:** EDS renders `<span class="icon icon-{name}">` as an
  `<img>` tag pointing to `/icons/{name}.svg`. Because icons are `<img>`
  elements (not inline SVG), `fill="currentColor"` does NOT work. Use
  explicit fill colors in the SVG source.
- **`decorateButtons()` variant:** Some projects override `decorateButtons`
  in `scripts/scripts.js` to require `<strong>` or `<em>` wrappers. Check
  by searching for `strong` or `em` in that file before writing buttons.
```

Extract the content for the sections above from `migration/migrate-block/SKILL.md` — specifically:
- "Preview verification" eval and required results: from Step 6c (lines ~408–427 of current SKILL.md)
- Button decoration: from "Known EDS Behaviors > Button Auto-Decoration" (lines ~655–700)
- Full-width blocks: from "Known EDS Behaviors > Full-Width Blocks" (lines ~702–715)
- Icon rendering: from "Known EDS Behaviors > Icon Rendering" (lines ~717–725)
- decorateButtons variant: from "Known EDS Behaviors > decorateButtons() Variant Risk" (lines ~727–740)

- [ ] **Step 2: Create `migration/migrate-block/references/author-kit.md`**

Source material: `/Users/catalan/Downloads/author-kit-findings.md`. Use this full structure and fill each section from the findings:

```markdown
# author-kit — migrate-block overrides

Flavor-specific rules for the Author Kit boilerplate (`aemsites/author-kit`,
entry script `scripts/ak.js`). Read this after the main `SKILL.md` — it
overrides the skill's defaults where they conflict.

## Framework entry

The entry script is `scripts/ak.js` (not `aem.js`). The page lifecycle
runs `setConfig()` → `loadArea()`, which calls `decorateSession()`,
`decorateDoc()`, `decoratePictures()`, `decorateSections()`, then loads
each section's blocks.

Key differences from aem-js:
- `body.appear` is NOT used. Instead, `body.session` gates font loading.
- `decorateSections()` calls `groupChildren()` which wraps `<div>`
  children in `<div class="block-content">` and non-`<div>` children in
  `<div class="default-content">`. Blocks are discovered as
  `.block-content > div[class]`.
- `data-block-status` is removed after a block loads — it does NOT
  persist like in aem-js, so polling for `loaded` status returns 0.

## Preview verification (Step 6c)

Because `data-block-status` is transient, verify framework readiness
with these signals instead:

\`\`\`bash
playwright-cli eval --tab={previewTabId} "JSON.stringify({ hlx: !!window.hlx, bodySession: document.body.classList.contains('session'), sections: document.querySelectorAll('.section').length, blockContent: document.querySelectorAll('.block-content').length, decoratedBlock: !!document.querySelector('.{blockName} .{blockName}-inner, .{blockName} [class*=\"-inner\"], .{blockName} [class*=\"-container\"]') })"
\`\`\`

Required results:
- `hlx` is `true`
- `bodySession` is `true`
- `sections` is at least 1
- `blockContent` is at least 1 (confirms `groupChildren` ran)
- `decoratedBlock` is `true` when your block has internal decoration

If `decoratedBlock` is unreliable for your block, fall back to a 2-second
timeout before screenshotting.

## Button decoration

`decorateButton()` only converts links wrapped in `<em>`, `<strong>`,
`<del>`, or `<u>`. Plain `<a>` inside `<p>` stays as a text link.

Wrapper conventions:
- `<strong><a href="...">CTA</a></strong>` → primary button
- `<em><a href="...">CTA</a></em>` → secondary button
- `<del><a href="...">CTA</a></del>` → strike-through variant
- `<a href="..."><u>text</u></a>` → underline variant

When writing `.plain.html`, wrap CTA links in the wrapper that matches
the visual treatment you want. Plain links without wrappers are left
unstyled.

## Full-width blocks

Section wrapping uses the same `--grid-container-width` constraint
(83.4% or 1200px at 1440px+). Override the wrapper with the same
pattern as aem-js:

\`\`\`css
.{blockName}-wrapper {
  max-width: 100% !important;
  padding: 0 !important;
}
\`\`\`

AK may add an additional `.block-content` level between the wrapper
and the block — check your DOM at runtime and scope accordingly.

## Card block contract

If your block uses the existing `card` block from the repo, images
MUST be wrapped in `<p>` tags:

\`\`\`html
<!-- CORRECT — card.js promotes this to .card-picture-container -->
<div><p><picture>...</picture></p><p>Content text</p></div>

<!-- WRONG — card.js ignores the picture; it stays in content-container -->
<div><picture>...</picture><p>Content text</p></div>
\`\`\`

`card.js` expects:
1. `<picture>` inside a `<p>` for promotion to `.card-picture-container`
2. Last `<p>` with `<a>` in the last child `<div>` → `.card-cta-container`
3. Everything else → `.card-content-container`

This applies any time the block's output content flows through `card.js`.

## Footer meta tag

**Do NOT set `<meta name="footer">` in the preview HTML.** Author Kit
uses the footer meta tag as the block class name, which collides with
`blocks/footer/footer.js`'s use of the same meta as the fragment path.
Setting it produces `blocks//drafts/footer//drafts/footer.js` and fails.

Instead, copy the footer fragment to the path `blocks/footer/footer.js`
falls back to (`/fragments/nav/footer`):

\`\`\`bash
mkdir -p /shared/{repo}/fragments/nav
cp /shared/{repo}/drafts/footer.plain.html /shared/{repo}/fragments/nav/footer.plain.html
\`\`\`

`utils/footer.js` then defaults `footer.className = 'footer'`, loads
`blocks/footer/footer.js`, which falls back to its `FOOTER_PATH`
constant (`/fragments/nav/footer`). Both steps use safe defaults.

## Known quirks

- **`--font-family` variable:** AK uses `--font-family` (singular) instead
  of `--body-font-family` / `--heading-font-family`. Brand setup in Phase
  2.5 must override this variable specifically — see the cone reference.
- **section-metadata as grid container:** AK treats sections as CSS Grid
  containers configured by `section-metadata` (e.g., `layout: bento`,
  `grid: 3`, `gap: s`). For complex layouts, prefer composing with
  `section-metadata` + card variants over bespoke nth-child CSS.
- **Card variants via class:** AK cards accept space-separated classes
  (e.g., `<div class="card ceo-quote">`). Variant styles scope via
  `.card.variant-name { ... }` in the block's CSS.
```

- [ ] **Step 3: Rewrite `migration/migrate-block/SKILL.md`**

Edit the skill to replace flavor-specific sections with pointers to the reference files. Make these exact edits:

**Edit 3a — Replace Step 6c body (lines ~408–427):**

Find the `### 6c. Verify EDS Framework Loaded` section and replace its body with:

```markdown
### 6c. Verify EDS Framework Loaded

Run the framework verification eval from the "Preview verification (Step
6c)" section of `references/{flavor}.md`. The reference specifies the
exact eval to run and the required results for your flavor.

**If any check fails: STOP.** Debug the preview HTML. Common causes:
- Missing `<script>` tags from head.html
- Wrong script paths
- Pre-decorated HTML (remove `.section`, `.block` classes — let the
  framework add them)

Do NOT work around framework failures by inlining CSS/JS.
```

**Edit 3b — Replace the "Known EDS Behaviors" section entirely (lines ~651–740):**

Find the `## Known EDS Behaviors` heading and replace everything from that heading through (but not including) the next `---` separator with:

```markdown
## Flavor-specific EDS behaviors

Button decoration, full-width block wrappers, card picture contracts,
icon rendering, and button wrapping conventions vary between EDS
flavors. See `references/{flavor}.md`:

- "Button decoration"
- "Full-width blocks"
- "Card block contract"
- "Known quirks"

Read the relevant sections before writing your block's CSS and
`.plain.html`.
```

**Edit 3c — Update the "Footer Block — Special Case" section (lines ~584–645):**

Add a note at the top of the section pointing to flavor-specific footer rules:

```markdown
## Footer Block — Special Case

If your block is the footer, output content to
`{projectPath}/drafts/footer.plain.html` (not `{blockName}.plain.html`).

Footer meta-tag behavior and fragment placement differ between
flavors — see "Footer meta tag" in `references/{flavor}.md` for the
flavor-specific steps before writing the preview HTML.

Other rules (shared across flavors):

- Block CSS/JS goes to `blocks/footer/footer.css` and
  `blocks/footer/footer.js`
- If the repo already has `blocks/footer/`, use existing code
- Do NOT use a `footer` class in any inner `<div>` inside
  `footer.plain.html` (the framework would try to recursively load the
  footer block)

[keep the existing "Footer Fragment DOM Structure" and "Footer Preview — CRITICAL" subsections]
```

- [ ] **Step 4: Verify the SKILL.md still has no dangling flavor-specific content**

```bash
grep -E "body\.classList\.contains\('appear'\)|data-block-status=\"loaded\"" migration/migrate-block/SKILL.md
```

Expected: no matches. If any remain, they're aem-js-specific and should be pulled out into the reference.

```bash
grep -c "references/{flavor}.md" migration/migrate-block/SKILL.md
```

Expected: at least 3 (Step 6c pointer, flavor-specific behaviors section, footer pointer).

- [ ] **Step 5: Commit**

```bash
git add migration/migrate-block/SKILL.md migration/migrate-block/references/
git commit -m "refactor(migrate-block): extract flavor rules into references/{aem-js,author-kit}.md"
```

---

### Task 4: Refactor `migrate-header` — create references and make `SKILL.md` flavor-agnostic

Same pattern as Task 3, applied to `migrate-header`.

**Files:**
- Create: `migration/migrate-header/references/aem-js.md`
- Create: `migration/migrate-header/references/author-kit.md`
- Modify: `migration/migrate-header/SKILL.md`

- [ ] **Step 1: Create `migration/migrate-header/references/aem-js.md`**

```markdown
# aem-js — migrate-header overrides

Flavor-specific rules for the standard EDS boilerplate. Read after the
main `SKILL.md`.

## Framework entry

The header loads eagerly during `loadEager()` as part of the initial
render. `body.appear` toggles when the first section's blocks finish.

## Header load timing

Header and first-section blocks load together. By the time `body.appear`
is set, the header fragment (loaded from `blocks/header/header.js`) has
been fetched and decorated.

## Header block conventions

- Default block path: `blocks/header/header.js` + `blocks/header/header.css`
- Fragment path: controlled by `<meta name="nav" content="...">` or
  the block's fallback (typically `/nav`)
- `header.js` in the standard boilerplate decorates the nav fragment
  using `section-metadata` Style values (brand, main-nav, top-bar,
  utility) — each section gets a matching `.header-{style}` class
- Mobile menu: `aria-expanded` toggles with hamburger click

## Preview verification (Step 6c)

\`\`\`bash
playwright-cli eval --tab={previewTabId} "JSON.stringify({ hlx: !!window.hlx, codeBasePath: window.hlx?.codeBasePath, bodyAppear: document.body.classList.contains('appear'), headerBlock: !!document.querySelector('.header.block'), navSections: document.querySelectorAll('.header-section').length })"
\`\`\`

Required: `hlx: true`, `bodyAppear: true`, `headerBlock: true`.
If `headerBlock` is false, the header fragment didn't load — verify
`nav.plain.html` exists and `<meta name="nav">` points to the right path.

## aria-expanded desktop behavior

The standard `header.js` sets `aria-expanded="true"` on the nav element
when on desktop. Desktop CSS must handle both the default state AND the
`[aria-expanded="true"]` state, or mobile layout leaks into desktop.

Use the pattern from the main SKILL.md (Step 5, "Required scoping
pattern") — explicitly include `nav[aria-expanded='true']` in the
desktop `@media (width >= 900px)` block.

## Known quirks

None specific to this flavor beyond what is in the main skill.
```

Extract content from the current `migration/migrate-header/SKILL.md`:
- Step 6c eval: lines ~446–452
- aria-expanded pattern: lines ~358–384

- [ ] **Step 2: Create `migration/migrate-header/references/author-kit.md`**

Source material: `/Users/catalan/Downloads/author-kit-findings.md` sections 1.4, 4.1, 5.3.

```markdown
# author-kit — migrate-header overrides

Flavor-specific rules for the Author Kit boilerplate. Read after the
main `SKILL.md`.

## Framework entry

The entry script is `scripts/ak.js`. Unlike aem-js, the header does NOT
load during `loadArea()`. It's deferred to `postlcp.js`, which runs
after the first section finishes loading (LCP optimization).

## Header load timing

`postlcp.js` is imported at the end of the first section's block
loading sequence:

\`\`\`js
export default async function loadPostLCP() {
  const header = document.querySelector('header');
  if (header) await loadBlock(header);
}
\`\`\`

The preview HTML must include an empty `<header></header>` element,
just like aem-js — but accept that the header loads later in the
page lifecycle. Wait for `body.session` plus `.header.block` presence
before screenshotting.

## Header block conventions

`decorateHeader()` sets `header.className = getMetadata('header') || 'header'`.
No `<meta name="header">` is needed — the default class `'header'` loads
`blocks/header/header.js` correctly. If a meta IS set, its value becomes
the block class name (same collision pattern as the footer — avoid).

AK's `header.js` uses **index-based section assignment**, expecting
three sections in the fragment:
- `sections[0]` → brand (logo + brand text)
- `sections[1]` → nav (navigation links as `<ul>`)
- `sections[2]` → actions (utility links)

Do NOT add extra `<div class="section-metadata">` children — they count
as extra sections and break the indexing. The fragment structure is:

\`\`\`html
<div><!-- brand content --></div>
<div><!-- nav ul --></div>
<div><!-- actions --></div>
\`\`\`

Fragment path default: `/fragments/nav/header` (read from a constant
inside `header.js`). Set `<meta name="nav" content="...">` in the
preview to override.

## Preview verification (Step 6c)

\`\`\`bash
playwright-cli eval --tab={previewTabId} "JSON.stringify({ hlx: !!window.hlx, bodySession: document.body.classList.contains('session'), headerBlock: !!document.querySelector('.header.block'), headerSections: document.querySelectorAll('.header.block > div').length })"
\`\`\`

Required: `hlx: true`, `bodySession: true`, `headerBlock: true`,
`headerSections: 3` (brand, nav, actions).

`body.appear` is NOT set by AK — do not rely on it.

## aria-expanded desktop behavior

Same pattern as aem-js: desktop CSS must cover both the default state
and `[aria-expanded="true"]` to prevent mobile layout leaking into
desktop. Use the scoping pattern from the main SKILL.md.

## Known quirks

- **Index-based, not section-metadata:** AK's default `header.js` does
  NOT use `<div class="section-metadata">` Style values like the
  standard boilerplate. It assigns brand/nav/actions by child index.
  If you add section-metadata divs, they count as extra children and
  throw off indexing. Check `blocks/header/header.js` before writing
  `nav.plain.html` to confirm which contract applies.
- **Post-LCP load ordering:** screenshots taken immediately after
  `serve` may show an empty header. Wait for `body.session` +
  `.header.block` before screenshotting.
```

- [ ] **Step 3: Rewrite `migration/migrate-header/SKILL.md`**

**Edit 3a — Replace Step 6c body (lines ~444–454):**

Find the `### 6c. Verify EDS Framework` section and replace its body with:

```markdown
### 6c. Verify EDS Framework

Run the framework verification eval from the "Preview verification (Step
6c)" section of `references/{flavor}.md`. The reference specifies the
eval and required results for your flavor.

If the verification fails, debug before proceeding — do NOT work around
framework failures by inlining CSS/JS.
```

**Edit 3b — Add pointer near Step 3 ("Install Header Block", lines ~140–166):**

At the top of Step 3, before the existing "Check if the repo already has a header block" line, add:

```markdown
Header block conventions vary between EDS flavors — the default file
path, fragment path, and section assignment contract (index-based vs
section-metadata Style values) differ. See "Header block conventions"
and "Framework entry" in `references/{flavor}.md` before editing or
creating the header block.
```

**Edit 3c — Add note about header load timing in Step 6:**

At the end of Step 6a (after the preview HTML template, around line ~425),
add:

```markdown
**Header load timing** varies between flavors — aem-js loads the header
eagerly; author-kit defers it to `postlcp.js`. Wait for the signals
listed in "Preview verification (Step 6c)" of `references/{flavor}.md`
before screenshotting to avoid capturing an empty header.
```

- [ ] **Step 4: Verify no dangling flavor-specific content**

```bash
grep -E "body\.classList\.contains\('appear'\)" migration/migrate-header/SKILL.md
```

Expected: no matches.

```bash
grep -c "references/{flavor}.md" migration/migrate-header/SKILL.md
```

Expected: at least 3.

- [ ] **Step 5: Commit**

```bash
git add migration/migrate-header/SKILL.md migration/migrate-header/references/
git commit -m "refactor(migrate-header): extract flavor rules into references/{aem-js,author-kit}.md"
```

---

### Task 5: Refactor `migrate-page` — create cone references and rewrite Phase 2.5 + Phase 4 content

The cone has its own flavor-specific work: brand.css variable names, styles.css `@import` placement, preview HTML meta tags, and preview-assembly load-wait verification.

**Files:**
- Create: `migration/migrate-page/references/aem-js.md`
- Create: `migration/migrate-page/references/author-kit.md`
- Modify: `migration/migrate-page/SKILL.md`

- [ ] **Step 1: Create `migration/migrate-page/references/aem-js.md`**

```markdown
# aem-js — migrate-page (cone) overrides

Flavor-specific rules for the cone phases when the project uses the
standard EDS boilerplate. Read after Phase 1 flavor detection.

## Brand and styles (Phase 2.5)

### brand.css variables

Write `{projectPath}/styles/brand.css` with:

\`\`\`css
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
\`\`\`

### styles.css edits

Add `@import url('brand.css');` as the VERY FIRST LINE of
`{projectPath}/styles/styles.css` (CSS spec requires `@import` before
all other rules). Update `:root` variables to match brand values where
the base `styles.css` declared them.

Add the global button reset after `:root`:

\`\`\`css
main .button-container { display: inline; }
main a.button:any-link {
  background: none; border: none; border-radius: 0;
  color: var(--link-color); font-size: inherit; font-weight: inherit;
  padding: 0; margin: 0; text-decoration: underline; white-space: normal;
}
\`\`\`

## Preview HTML meta tags

Include all three:

\`\`\`html
<meta name="nav" content="/drafts/nav">
<meta name="footer" content="/drafts/footer">
\`\`\`

(Add `<meta name="header">` only if the project uses a non-default
header block class — typically not needed.)

## Preview load-wait verification (Phase 4.4)

Wait for all blocks to reach `data-block-status="loaded"` before
screenshotting:

\`\`\`bash
playwright-cli eval --tab={previewTabId} "JSON.stringify({ blocks: document.querySelectorAll('[data-block-status=\"loaded\"]').length, expected: document.querySelectorAll('[data-block-name]').length, appear: document.body.classList.contains('appear') })"
\`\`\`

Poll until `blocks >= expected` and `appear: true`. Then screenshot.

## Known quirks

None specific to this flavor.
```

- [ ] **Step 2: Create `migration/migrate-page/references/author-kit.md`**

Source material: `/Users/catalan/Downloads/author-kit-findings.md` sections 2, 5.2, 5.3, 5.4.

```markdown
# author-kit — migrate-page (cone) overrides

Flavor-specific rules for the cone phases when the project uses the
Author Kit boilerplate. Read after Phase 1 flavor detection.

## Brand and styles (Phase 2.5)

### brand.css variables

AK uses a single `--font-family` variable instead of
`--heading-font-family` / `--body-font-family`. Write
`{projectPath}/styles/brand.css` with:

\`\`\`css
:root {
  --font-family: "{resolved font}", sans-serif;
  --heading-font-family: "{resolved heading font}", serif;  /* optional, for reference */
  --body-font-family: "{resolved body font}", sans-serif;    /* optional, for reference */
  --background-color: {brand.colors.background};
  --text-color: {brand.colors.text};
  --link-color: {brand.colors.link};
  --link-hover-color: {brand.colors.linkHover};
  --section-padding: {brand.spacing.sectionPadding};
}

html, body { overflow: auto !important; }
\`\`\`

### styles.css edits

Add `@import url('brand.css');` as the first line of `styles.css`.

**Critical:** AK's `styles.css` redefines `--font-family` in its own
`:root` block AFTER the `@import`, which overrides brand values in the
cascade. You must **also** update `--font-family` directly in the
`styles.css` `:root` block to the brand font.

Add the same button reset as aem-js (see its reference for the rule).

### head.html additions

If the font comes from Adobe Fonts, add the Typekit `<link>` tag BEFORE
the existing `<script>` tags in `head.html`:

\`\`\`html
<link rel="stylesheet" href="https://use.typekit.net/{kitId}.css">
\`\`\`

## Preview HTML meta tags

**Do NOT include `<meta name="footer">`.** AK uses it as the block
class name, which collides with `blocks/footer/footer.js`'s fragment
path lookup. Setting it produces `blocks//drafts/footer//drafts/footer.js`
and fails.

Required meta tags:

\`\`\`html
<meta name="nav" content="/drafts/nav">
\`\`\`

Do NOT include `<meta name="header">` either — `decorateHeader()`
defaults to class `'header'`, which loads the correct block.

After assembling the preview HTML, copy the footer fragment to the path
`blocks/footer/footer.js` falls back to:

\`\`\`bash
mkdir -p /shared/{repo-name}/fragments/nav
cp /shared/{repo-name}/drafts/footer.plain.html /shared/{repo-name}/fragments/nav/footer.plain.html
\`\`\`

`utils/footer.js` then defaults `footer.className = 'footer'`, loads the
block, and the block falls back to its `FOOTER_PATH` constant
(`/fragments/nav/footer`). Both steps use safe defaults.

## Preview load-wait verification (Phase 4.4)

AK does NOT persist `data-block-status` — it's removed after each block
loads. Polling for `loaded` status returns 0. Use this signal set
instead:

\`\`\`bash
playwright-cli eval --tab={previewTabId} "JSON.stringify({ bodySession: document.body.classList.contains('session'), sections: document.querySelectorAll('.section').length, blockContent: document.querySelectorAll('.block-content').length, header: !!document.querySelector('.header.block'), footer: !!document.querySelector('.footer.block') })"
\`\`\`

Poll until all of `bodySession`, `header`, and `footer` are `true` and
`blockContent >= 1`. Add a 2-second hard timeout as a fallback.

Then screenshot.

## Known quirks

- **`--font-family` cascade:** Even with `brand.css` imported first, AK's
  `:root` in `styles.css` re-declares `--font-family`. You MUST edit the
  `:root` block in `styles.css` directly, not rely on the import.
- **Header deferred to postlcp:** The header loads after the first
  section. The preview-load-wait eval must wait for `.header.block` to
  appear, not assume it's there at first paint.
- **`groupChildren` wrapper:** AK wraps section children in
  `<div class="block-content">`. Any CSS targeting children of `.section`
  directly (e.g., `.section > div`) must account for this wrapper.
```

- [ ] **Step 3: Rewrite `migration/migrate-page/SKILL.md` Phase 2.5 and Phase 4**

**Edit 3a — Replace Phase 2.5c body (current lines ~326–342):**

Find the `### 2.5c: Generate brand.css` heading and replace its body (the fenced css block and everything until the next `###` heading) with:

```markdown
### 2.5c: Generate brand.css

Write `{projectPath}/styles/brand.css` with brand values from
`brand.json`. The exact variable names and any flavor-specific cascade
workarounds are in "Brand and styles (Phase 2.5)" of
`references/{flavor}.md`. Read that section before writing the file.
```

**Edit 3b — Replace Phase 2.5d body (current lines ~344–363):**

Find the `### 2.5d: Update styles.css with @import` heading and replace its body with:

```markdown
### 2.5d: Update styles.css with @import

Add `@import url('brand.css');` as the VERY FIRST LINE of
`{projectPath}/styles/styles.css`. Some flavors require additional edits
to `:root` in `styles.css` to work around cascade collisions — see
"Brand and styles (Phase 2.5)" in `references/{flavor}.md`.

Add the global EDS button reset after `:root`. The exact reset rules
and selector specificity are in `references/{flavor}.md`.

Write the updated `styles.css` back.
```

**Edit 3c — Replace Phase 4.4 preview HTML template (current lines ~530–550):**

Find the `### Step 4.4: Create Full Preview Page — MANDATORY` heading. Replace the fenced HTML template and the meta-tag explanation with:

```markdown
### Step 4.4: Create Full Preview Page — MANDATORY

Write `/shared/{repo-name}/drafts/{page-path}-preview.html`. The exact
`<meta name="...">` tags and any flavor-specific fragment-placement
steps (e.g., copying `footer.plain.html` to a fragment path) are in
"Preview HTML meta tags" of `references/{flavor}.md`. Read that section
before writing the preview HTML.

Baseline structure (shared across flavors):

\`\`\`html
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  {PASTE <script> AND <link> TAGS FROM head.html}
  {ADD meta tags per references/{flavor}.md}
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
\`\`\`

Serve and verify:

\`\`\`bash
serve --entry=drafts/{page-path}-preview.html --project /shared/{repo-name}
\`\`\`

Capture the **targetId** and **preview URL** from the output.
```

**Edit 3d — Replace Phase 4.4 load-wait eval (current lines ~562–571):**

Find the `Wait for all blocks to load before screenshotting` paragraph and its fenced eval. Replace both with:

```markdown
Wait for all blocks to load before screenshotting. The signal set
differs between flavors — see "Preview load-wait verification (Phase
4.4)" in `references/{flavor}.md` for the exact eval and required
values. Apply a 2-second hard timeout as a fallback if the eval's
signals don't converge.

Once the load-wait eval passes, take the screenshot:

\`\`\`bash
playwright-cli screenshot --tab={previewTabId} --fullPage=true --max-width=1440 --filename=/shared/{repo-name}/.migration/preview-assembled.png
bash: ls -la /shared/{repo-name}/.migration/preview-assembled.png
\`\`\`
```

- [ ] **Step 4: Verify no dangling flavor-specific content**

```bash
grep -E "body\.classList\.contains\('appear'\)|data-block-status=\"loaded\"|--body-font-family" migration/migrate-page/SKILL.md
```

Expected: no matches.

```bash
grep -c "references/{flavor}.md" migration/migrate-page/SKILL.md
```

Expected: at least 4 (Phase 2.5c, 2.5d, 4.4 meta tags, 4.4 load wait).

- [ ] **Step 5: Commit**

```bash
git add migration/migrate-page/SKILL.md migration/migrate-page/references/
git commit -m "refactor(migrate-page): extract flavor rules into references/{aem-js,author-kit}.md"
```

---

### Task 6: End-to-end verification

The automated tests above cover the script and detection logic. End-to-end correctness needs real migration runs. Both runs are manual — perform them and note any drift between the expected and actual behavior.

- [ ] **Step 1: aem-js regression run**

Pick an aem.js-based EDS project you've migrated successfully before. Run the migrate-page sprinkle against the same source page.

Check:
1. `.migration/flavor.json` contains `{"flavor":"aem-js"}`
2. `styles/brand.css` has `--body-font-family` and `--heading-font-family` (aem-js pattern)
3. `styles/styles.css` has `@import url('brand.css');` as the first line
4. Preview HTML has both `<meta name="nav">` and `<meta name="footer">`
5. Final preview-assembled screenshot is visually equivalent to the pre-refactor result (spot-compare a prior run if available)

If anything differs from before, check that the extracted `aem-js.md` reference captures the rule correctly.

- [ ] **Step 2: author-kit smoke test**

Run migrate-page against a fresh clone of `aemsites/author-kit` with a source URL known to be AK-backed (e.g., a page from astrazeneca.com, per the findings doc).

Check:
1. `.migration/flavor.json` contains `{"flavor":"author-kit"}`
2. `styles/brand.css` has `--font-family` (AK-specific)
3. `styles/styles.css` `:root` block has `--font-family` overridden (not just imported)
4. Preview HTML does NOT contain `<meta name="footer">`
5. `fragments/nav/footer.plain.html` exists and matches `drafts/footer.plain.html`
6. Preview-load-wait uses `body.session` signal (check scoop output or `.migration/reports/` if reports enabled)
7. Final preview-assembled screenshot renders correctly — header shows, footer loads, fonts apply

- [ ] **Step 3: Detection edge case — unknown flavor**

Create a minimal test repo with no `scripts/*.js`:

```bash
mkdir -p /tmp/no-flavor-repo/scripts
cd /tmp/no-flavor-repo && git init && touch README.md && git add . && git -c user.email=test@test -c user.name=test commit -m init
```

Point migrate-page at this repo (or replay Phase 1 manually). Expected behavior: cone sends the error sprinkle, halts. No `flavor.json` with a valid flavor, no continuation to Phase 2.

- [ ] **Step 4: Commit any fixes from verification**

If verification surfaces bugs in the references or SKILL.md prose, fix them and commit:

```bash
git add migration/
git commit -m "fix(migration): address verification findings"
```

- [ ] **Step 5: Cleanup**

```bash
rm -rf /tmp/no-flavor-repo
```
