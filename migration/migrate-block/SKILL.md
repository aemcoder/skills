---
name: migrate-block
description: Migrate a single visual component into an AEM Edge Delivery Services block. Used by scoops during page migration. Requires parameters from the cone via feed_scoop.
allowed-tools: browser,read_file,write_file,edit_file,bash,javascript
---

# Migrate Block to EDS

Migrate a single visual component from a source web page into an AEM Edge
Delivery Services block with CSS, JS, content model, and visual verification.

## HARD CONSTRAINTS — DO NOT VIOLATE

1. **NEVER inline block CSS or JS in the preview HTML.** The preview MUST
   load CSS/JS through the EDS framework (`loadBlock()` in `aem.js`).
   If your block's CSS/JS doesn't load through the framework, that is
   the bug to fix — not a reason to inline.

2. **ALWAYS include head.html content in the preview.** Copy the `<script>`
   and `<link>` tags exactly as provided in your parameters. Do not remove
   nonce attributes. Do not remove CSP meta tags. Do not substitute with
   your own script tags.

3. **NEVER pre-decorate HTML in the preview.** Do not manually add `.section`,
   `.block`, `.*-wrapper`, `.*-container`, `.button`, `data-block-name`, or
   `data-block-status` attributes. The EDS framework adds these at runtime.
   If your preview HTML is pre-decorated, you are not testing the real
   rendering pipeline.

4. **The preview page structure is EXACTLY as shown in Step 6.** No
   variations. No additions. No removals.

5. **NEVER write `<html>`, `<head>`, `<body>`, `<script>`, `<style>`, or
   inline styles into a `.plain.html` file.** The `.plain.html` format
   contains ONLY content divs. If you need a preview page, write it to
   a separate `-preview.html` file.

---

## Parameters (from cone's feed_scoop prompt)

Your prompt will include these parameters:

- `blockName` — name of the block (e.g., "hero", "cards")
- `sourceUrl` — URL of the source page
- `id` — visual tree positional ID
- `bounds` — bounding box {x, y, width, height}
- `projectPath` — EDS project path in VFS (e.g., "/shared/vibemigrated")
- `notes` — optional decomposition notes from the cone

---

## HARD RULE: Draft-First Workflow

**Write .plain.html within 5 minutes of starting.** Do NOT spend more than
5 minutes on content extraction before writing the initial files.

- Use placeholder text for complex decorative elements (icon fonts, SVG
  illustrations, animated elements). Note gaps in the report.
- Do NOT recreate decorative elements from scratch. Use text, emoji, or
  the project's existing icon system.
- Extract at most 5 design tokens (background color, text color, padding,
  gap, font-size) before writing the first CSS. Iterate toward exact
  values during visual verification.

---

## Step 1: Extract Content from Source Page

The visual tree is for decomposition only — it does NOT contain the actual
content. Navigate to the source page and extract content directly:

```bash
playwright-cli tab-new {sourceUrl}
```

The cone dismissed overlays (cookie banners, consent dialogs) during
Phase 1.5 and set consent cookies. Since all tabs share the same browser
session, overlays should NOT appear when you navigate here. If you do
see an overlay blocking content, click its accept/dismiss button via
`evaluate` — do not just remove it from the DOM.

Extract the component's content using the CSS selector from the visual
tree or one you identify:

```bash
playwright-cli eval "..."
```

Extract: headings, paragraphs, links (href + text), image URLs (src + alt),
button text, any structured data within the component's bounds.

**Screenshot the source component NOW** — you will reuse this screenshot
for all visual iterations in Step 7. Do NOT navigate back to the source
page later.

```bash
playwright-cli screenshot --selector "{component-selector}" --path {projectPath}/.migration/source-{blockName}.png
```

**Close the source tab** after extraction to reduce tab clutter:

```bash
playwright-cli tab-close
```

After closing, playwright-cli has no active tab. Steps 2–5 do not use the
browser. You will select a new tab in Step 6b.

---

## Step 2: Download Images

Download all images from the source component to `{projectPath}/drafts/images/`.

Download images in parallel using the JavaScript tool:

```javascript
const urls = ['https://source-site.com/img1.jpg', 'https://source-site.com/img2.jpg'];
await Promise.all(urls.map(async (url) => {
  const resp = await fetch(url);
  const bytes = new Uint8Array(await resp.arrayBuffer());
  const filename = url.split('/').pop();
  await fs.writeFile('{projectPath}/drafts/images/' + filename, bytes);
}));
return 'Downloaded ' + urls.length + ' images';
```

Image paths in `.plain.html` files use root-relative paths: `/drafts/images/image.jpg`

These root-relative paths work in preview because the EDS project mode in
the service worker resolves them against the project root.
Do NOT use `/preview/shared/...` or `/shared/...` absolute paths.

---

## Step 3: Write .plain.html Content

Write to `{projectPath}/drafts/{blockName}.plain.html`

### Format Rules

The `.plain.html` file contains ONLY content structure:

```html
<div>
  <div class="{blockName}">
    <div>
      <div><picture><img src="/drafts/images/hero.jpg" alt="Hero"></picture></div>
      <div><h2>Heading</h2><p>Description</p></div>
    </div>
    <div>
      <div><picture><img src="/drafts/images/card.jpg" alt="Card"></picture></div>
      <div><h3>Card Title</h3><p>Card text</p></div>
    </div>
  </div>
</div>
```

**Structure:**
- Outer `<div>` = section wrapper
- `<div class="{blockName}">` = block container (class = block name)
- Each child `<div>` of the block = a row
- Each child `<div>` of a row = a cell
- Cells contain plain HTML: `<h2>`, `<p>`, `<a>`, `<picture><img>`, `<ul>`
- Images wrapped in `<picture>` tags with root-relative src

**NEVER include:** `<html>`, `<head>`, `<body>`, `<script>`, `<style>`,
inline styles, or any wrapper outside the content divs.

---

## Step 4: Write Block CSS

Write to `{projectPath}/blocks/{blockName}/{blockName}.css`

```css
.{blockName} {
  --block-bg: #value;
  --block-text: #value;
  --block-padding: value;
  --block-gap: value;

  background: var(--block-bg);
  color: var(--block-text);
  padding: var(--block-padding);
}

.{blockName} h2 {
  font-family: var(--heading-font-family, sans-serif);
}

@media (width >= 900px) {
  .{blockName} > div > div {
    display: flex;
    gap: var(--block-gap);
  }
}
```

Extract design tokens from the source (colors, spacing, typography).
Scope ALL styles under `.{blockName}`. Use CSS custom properties.

---

## Step 5: Write Block JS

Write to `{projectPath}/blocks/{blockName}/{blockName}.js`

```javascript
export default async function decorate(block) {
  const rows = [...block.children];
  rows.forEach((row) => {
    const cells = [...row.children];
    // Restructure cells as needed for the desired layout
  });
}
```

The function receives the block `<div>` after EDS converts authored content
into nested divs. Restructure the DOM for the desired visual layout.
Do NOT fetch external resources or add `<script>` tags.

---

## EDS DOM Transformation Reference

When EDS decorates your block, the DOM changes. Your CSS selectors must
target the **decorated** structure, not the authored structure.

```
Authored (.plain.html):            After EDS decoration:

<div>                              <div class="section">
  <div class="hero">                <div class="hero-wrapper">
    <div>  ← row 1                     <div class="hero block"
      <div>cell 1</div>                      data-block-name="hero"
      <div>cell 2</div>                      data-block-status="loaded">
    </div>                               <div>  ← row 1 (unchanged)
  </div>                                   <div>cell 1</div>
</div>                                     <div>cell 2</div>
                                         </div>
                                       </div>
                                     </div>
                                   </div>
```

**Key points:**
- The block `<div>` gets `.block` class + `data-block-name` + `data-block-status`
- A `-wrapper` div is inserted around the block
- A `.section` div wraps the section
- Rows and cells inside the block are NOT changed
- Your `decorate(block)` function receives the `.hero.block` element

**Common side-effects of `decorateMain()`:**
- Bare `<img>` and `<picture>` in cells get wrapped in `<p>` tags
- Standalone `<p><a>` links get `.button` class and `.button-container` wrapper
- `<blockquote>` content may get wrapped in extra `<p>` tags

**CSS selector guide:**
```css
.hero > div              /* targets rows ✅ */
.hero > div > div        /* targets cells ✅ */
.hero-wrapper            /* targets the wrapper (rarely needed) */
.hero > .hero            /* WRONG — block IS .hero ❌ */
```

---

## Step 6: Create Preview Page and Serve

This step loads the **real EDS framework** to test your block through the
actual rendering pipeline — `aem.js` → `decorateMain()` → `loadBlock()` →
your block's JS/CSS.

### 6a. Create Preview Wrapper Page

Write to `{projectPath}/drafts/{blockName}-preview.html`:

```html
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="nav" content="/drafts/nav">
  <meta name="footer" content="/drafts/footer">
  {PASTE ALL <script> AND <link> TAGS FROM head.html CONTENT BELOW}
  <style>html, body { overflow: auto !important; }</style>
</head>
<body>
  <header></header>
  <main>
    {PASTE THE CONTENT OF YOUR .plain.html FILE HERE}
  </main>
  <footer></footer>
</body>
</html>
```

**Read head.html from the project:**

```
read_file({ "path": "{projectPath}/head.html" })
```

Copy the `<script>` and `<link>` tags from head.html EXACTLY — including
`nonce` attributes, `type="module"`, and all `<meta>` tags except CSP (the
service worker doesn't enforce CSP, so the CSP meta can be omitted).

**Key points:**
- `<header>` and `<footer>` are empty — EDS fills them from nav/footer fragments
- Block previews may show empty headers/footers if those scoops haven't
  completed yet — this is expected, focus on the block itself
- The `overflow: auto !important` fixes SLICC's scrolling limitation

### 6b. Serve and Track Your Preview Tab

Open the preview with EDS project mode, then immediately claim the tab
in playwright-cli so all subsequent commands target it:

```bash
# 1. Serve — opens the preview tab with correct projectRoot wiring
serve --entry drafts/{blockName}-preview.html --project {projectPath}

# 2. Find YOUR tab — match on your unique block name in the URL
playwright-cli tab-list

# 3. Select it by index (the one whose URL contains "{blockName}-preview")
playwright-cli tab-select <index>
```

**If your tab is NOT in the list:** The tab may not have registered yet
(race with other scoops). Wait 3 seconds and retry `tab-list`. If still
not found, open it directly:
```bash
playwright-cli tab-new <preview-url-from-serve-output>
```

After `tab-select` (or `tab-new`), your preview is the current tab. All
`screenshot`, `snapshot`, `evaluate` commands will target it automatically.

### 6c. Verify EDS Framework Loaded

After selecting your preview tab, run this verification BEFORE any visual comparison:

```bash
playwright-cli eval "JSON.stringify({ hlx: !!window.hlx, codeBasePath: window.hlx?.codeBasePath, bodyAppear: document.body.classList.contains('appear'), sections: document.querySelectorAll('.section').length, blocks: Array.from(document.querySelectorAll('[data-block-name]')).map(b => ({ name: b.dataset.blockName, status: b.dataset.blockStatus })) })"
```

**Required results:**
- `hlx` must be `true`
- `codeBasePath` must be a string (controls where blocks/styles load from)
- `bodyAppear` must be `true`
- Your block must appear in the blocks array with `status: "loaded"`

**If any check fails: STOP.** Debug the preview HTML. Common causes:
- Missing `<script>` tags from head.html
- Wrong script paths
- Pre-decorated HTML (remove `.section`, `.block` classes — let EDS add them)

Do NOT work around framework failures by inlining CSS/JS.

---

## Step 7: Visual Verification (Max 3 Iterations)

Only proceed here after Step 6c passes.

**Font rendering note:** Adobe Fonts (Typekit) validates the requesting
domain. On `localhost`, Typekit returns empty CSS — fonts will show
fallbacks (Georgia, Times New Roman). This is expected and NOT a bug
to fix. Do NOT waste iterations trying to match font rendering. Focus
on layout, spacing, colors, and structure. Fonts will render correctly
when deployed to a whitelisted production domain.

**Source screenshot:** You already captured this in Step 1. Read it from:
`{projectPath}/.migration/source-{blockName}.png`
Do NOT navigate back to the source page. Reuse this screenshot for every
iteration.

For each iteration:

1. **Screenshot the preview:** Your preview tab is already selected.
   ```bash
   playwright-cli screenshot --selector ".{blockName}" --path {projectPath}/.migration/preview-{blockName}-iter{N}.png
   ```

2. **Compare:** Read both screenshots (source from Step 1, preview from
   above). Identify the top 2-3 CSS gaps:
   - Padding/margin (highest priority)
   - Background color/gradient
   - Layout/flex direction
   - Font size/weight (but NOT font-family — see note above)

3. **Fix:** Batch ALL CSS fixes for this iteration into a SINGLE `edit_file`
   call. Identify all gaps from the comparison, then apply them together —
   do not make separate edits for each property. Edit
   `{projectPath}/blocks/{blockName}/{blockName}.css`. Do NOT rewrite the
   entire file.

4. **Reload and re-screenshot:** Navigate the preview tab to reload:
   ```bash
   playwright-cli goto <your-preview-url>
   ```

**Stop conditions:**
- After iteration 3: finalize regardless of remaining differences
- If improvement < 3% from last iteration: accept and stop

---

## Step 8: Write Report

**Write the report in TWO passes** to ensure a report exists even if visual
iterations don't complete (timeout, error, etc.):

**Pass 1 — Write immediately after Step 6c passes** (before visual iterations):
Write with `"status": "partial"` and the `edsVerification` data. This
guarantees the cone gets a report even if Step 7 never finishes.

**Pass 2 — Update after Step 7 completes** (after visual iterations):
Update with final `status`, `visualVerification`, and `designTokens`.

Write to `{projectPath}/.migration/reports/{blockName}-report.json`:

```json
{
  "blockName": "{blockName}",
  "sourceUrl": "{sourceUrl}",
  "timestamp": "<ISO 8601>",
  "status": "<success|partial|failed>",
  "files": {
    "css": "blocks/{blockName}/{blockName}.css",
    "js": "blocks/{blockName}/{blockName}.js",
    "plainHtml": "drafts/{blockName}.plain.html",
    "previewHtml": "drafts/{blockName}-preview.html"
  },
  "images": [
    { "source": "https://...", "local": "/drafts/images/file.jpg" }
  ],
  "edsVerification": {
    "hlx": true,
    "codeBasePath": "/preview/shared/vibemigrated",
    "bodyAppear": true,
    "blockLoaded": true,
    "blockStatus": "loaded"
  },
  "visualVerification": {
    "iterationsUsed": 2,
    "previewWorked": true,
    "iterations": [
      { "iteration": 1, "changes": "...", "gaps": ["..."] },
      { "iteration": 2, "changes": "...", "gaps": ["..."] }
    ],
    "finalAssessment": "..."
  },
  "contentModel": {
    "rows": 2,
    "description": "Hero with image left, text+CTA right"
  },
  "designTokens": {
    "--block-bg": "#1a1a2e",
    "--block-text": "#ffffff"
  },
  "issues": ["..."]
}
```

**Status thresholds:**
- `"success"` — >85% visual match, EDS framework verified
- `"partial"` — 50-85% visual match, or EDS framework issues
- `"failed"` — <50% visual match, or framework didn't load

**ALL reports MUST use this exact schema.** Do not add extra top-level keys
or rename fields.

Then use `send_message` to notify the cone with: block name, status,
iteration count, report path, any blocking issues.

---

## Footer Block — Special Case

If your block is the footer:

- Output content to `{projectPath}/drafts/footer.plain.html`
- Block CSS/JS goes to `blocks/footer/footer.css` and `blocks/footer/footer.js`
- If the repo already has `blocks/footer/`, use existing code
- Do NOT use a `footer` class in any inner `<div>` inside footer.plain.html
  (the EDS framework would try to recursively load the footer block)

### Footer Preview — CRITICAL

The footer loads via `loadFooter()` which runs inside `loadLazy()`.
`loadLazy()` only runs after `loadEager()` succeeds. **`loadEager()` will
CRASH if `<main>` is empty** — it calls `loadSection(main.querySelector('.section'))`
which throws on null.

The footer preview HTML MUST include a non-empty `<main>`:

```html
<html>
<head>
  {head.html content}
  <meta name="footer" content="/drafts/footer">
  <style>html, body { overflow: auto !important; }</style>
</head>
<body>
  <header></header>
  <main>
    <div><p>Footer preview</p></div>
  </main>
  <footer></footer>
</body>
</html>
```

Do NOT use `<main></main>` — the EDS framework needs at least one `<div>`
child to create a `.section`, or `loadEager()` crashes and `loadFooter()`
never runs.

---

## Known EDS Behaviors

### Button Auto-Decoration

EDS's `decorateButtons()` (called during `decorateMain()`) automatically
transforms standalone paragraph links into button elements:

```html
<!-- Your .plain.html content -->
<p><a href="/cta">Learn More</a></p>

<!-- After EDS decoration -->
<p class="button-container"><a href="/cta" class="button">Learn More</a></p>
```

This turns text links into filled blue buttons — which is usually NOT
what the source site looks like. You will likely need to override this
in your block CSS:

```css
/* Reset EDS button decoration to match source styling */
.{blockName} .button-container {
  display: inline;
}

.{blockName} a.button {
  background: none;
  border: none;
  color: var(--link-color, inherit);
  font-size: inherit;
  font-weight: inherit;
  padding: 0;
  margin: 0;
  text-decoration: underline;
}

/* Or style as bordered/outlined CTA if source uses that pattern */
.{blockName} a.button {
  background: transparent;
  border: 2px solid currentColor;
  border-radius: 4px;
  padding: 8px 24px;
  text-decoration: none;
}
```

This is a standard EDS behavior — not a bug. Plan for it when writing
your block CSS.

---

## Reference: Content Models

1. **Standalone** — One-off (hero, blockquote): single row, mixed cells
2. **Collection** — Repeating items (cards, carousel): rows = items,
   cells = item parts
3. **Configuration** — Key-value pairs: ONLY for API-driven content.
   NEVER use for static content.

## Reference: Quality Criteria

| Criterion | Target |
|-----------|--------|
| EDS framework verified | hlx=true, bodyAppear=true, block loaded |
| Visual similarity | >= 85% acceptable, >= 95% ideal |
| Header similarity | >= 85% (interactive states differ) |
| Max iterations | 3 (5 for header) |
| CSS scoping | All rules under .blockname |
| Header CSS | All rules under .header.block |
| .plain.html | NO html/head/body/script/style tags |
| Images | `<picture><img>` with alt text, /drafts/images/ paths |
| Report schema | Exact schema above, no extra keys |
