---
name: migrate-block
description: Migrate a single visual component into an AEM Edge Delivery Services block. Used by sub-agents during page migration. Requires parameters from the orchestrator.
requires:
  - browser
  - node
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

6. **ALWAYS put images in their own dedicated cell.** EDS's `decorateMain()`
   wraps bare `<picture>`/`<img>` elements in `<p>` tags. If a cell contains
   both images and `<p>` text, the DOM gets mangled (HTML forbids `<p>` inside
   `<p>`). Split image and text into separate cells, then merge in `decorate()`.

   ```html
   <!-- ❌ WRONG — image + text in same cell → DOM mangled -->
   <div>
     <div><picture><img src="..."></picture><h2>Title</h2><p>Text</p></div>
   </div>

   <!-- ✅ CORRECT — image in own cell, text in own cell -->
   <div>
     <div><picture><img src="..."></picture></div>
     <div><h2>Title</h2><p>Text</p></div>
   </div>
   ```

---

## Parameters (from orchestrator's prompt)

Your prompt will include these parameters:

- `blockName` — name of the block (e.g., "hero", "cards")
- `sourceUrl` — URL of the source page
- `id` — visual tree positional ID
- `bounds` — bounding box {x, y, width, height}
- `projectPath` — EDS project path (e.g., "/path/to/mysite")
- `notes` — optional decomposition notes from the orchestrator

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
content. Navigate to the source page and extract content directly.

**Open** `{sourceUrl}` in the browser.

**MANDATORY — set the viewport to 1440×900 before ANY screenshot or
extraction.** Browser tabs often default to ~780px (a mobile breakpoint).
Capturing or measuring the component at that width yields a mobile-layout
screenshot and can drive wrong fidelity decisions. Never skip this.

Verify the viewport took effect by executing JS in the page:

```javascript
window.innerWidth >= 1024
```

If this returns `false`, STOP and re-set the viewport.

The orchestrator dismissed overlays (cookie banners, consent dialogs) during
Phase 1 and set consent cookies. Since all tabs share the same browser
session, overlays should NOT appear when you navigate here. If you do
see an overlay blocking content, click its accept/dismiss button via
JS execution — do not just remove it from the DOM.

**Always wrap JS execution calls in IIFEs** to avoid variable redeclaration
errors across multiple calls:

```javascript
(() => { /* your code here */ })()
```

Extract the component's content in as few JS executions as possible. Prefer
one comprehensive extraction over many small probes:

```javascript
(() => {
  const el = document.querySelector('{selector}');
  if (!el) return JSON.stringify({ error: 'not found' });
  const imgs = [...el.querySelectorAll('img')].map(i => ({
    src: i.src, alt: i.alt
  }));
  const bgImgs = [...el.querySelectorAll('[style*=background-image]')]
    .map(e => {
      const m = getComputedStyle(e).backgroundImage
        .match(/url\(["']?(.+?)["']?\)/);
      return m ? m[1] : null;
    }).filter(Boolean);
  const links = [...el.querySelectorAll('a')].map(a => ({
    href: a.href, text: a.textContent.trim()
  }));
  const styles = getComputedStyle(el);
  return JSON.stringify({
    text: el.innerText.slice(0, 2000),
    imgs, bgImgs, links,
    tokens: {
      bg: styles.backgroundColor, color: styles.color,
      padding: styles.padding, fontSize: styles.fontSize
    }
  });
})()
```

Note: AEM sites commonly use `background-image` CSS instead of `<img>` tags.
Check both `<img>` elements and inline `style` attributes for images.

**Screenshot the source component NOW** — you will reuse this screenshot
for all visual iterations in Step 7. Do NOT navigate back to the source
page later.

Get the accessibility snapshot of the page to identify the right element,
then screenshot that specific element by its CSS selector. Save to
`{projectPath}/.migration/source-{blockName}.png`.

If you can't identify the right element, scroll the component into view
and take a viewport screenshot instead.

**Close the source tab** after extraction to reduce tab clutter.

Steps 2–5 do not use the browser. You will open a new tab in Step 6b.

---

## Step 2: Download Images

Download all images from the source component to
`{projectPath}/drafts/images/`.

Download images using binary-safe file download (not text-mode write —
text-mode corrupts bytes > 127 in binary files like images). Use whatever
download method the harness provides (curl, fetch-to-file, etc.).

Image paths in `.plain.html` files use root-relative paths:
`/drafts/images/image.jpg`

These root-relative paths work in preview because the project is served
from its root directory.

> **Preview-only paths.** These `/drafts/images/...` srcs resolve in the
> project-mode preview but are `about:error` on the live DA page — the
> rewrite to absolute/DA-hosted URLs is owned by the DA-upload flow (see
> the `eds-da-content` skill, `references/media.md`). A `.plain.html`
> shipped as-is WILL have broken images; that's expected, not a block defect.

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

**Section lead-in headings:** If your prompt's `## Parameters` include
`Section heading: OWNED BY ORCHESTRATOR`, the section's lead-in heading (the
`<h2>`/`<h3>` that introduces this block's section) is written separately
by the orchestrator as default-content. Do NOT include that heading in
your `.plain.html` — start your block at its own content, or it will
render twice.

### Symbol characters — use HTML entities

DA's markdown round-trip corrupts certain literal symbols to the replacement
character `�` on the live page. Emit these as HTML entities in `.plain.html`,
never the literal character:

| Literal | Emit instead |
| --------- | -------------- |
| `©` (copyright) | `&#169;` |
| `™` (trademark) | `&#8482;` |
| `®` (registered) | `&#174;` |

---

## Step 4: Write Block CSS

**BEFORE writing CSS**, read the project's global styles for layout
constraints and button overrides that will affect your block:

Read `{projectPath}/styles/styles.css` and look for:

- `max-width` on `.section > div` — the orchestrator sets this as part of
  the layout contract. Do NOT override it in your block CSS
- `a.button` rules — note if any exist; your block must style its own
  buttons with `main .{blockName} a.button:any-link` specificity

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

```text
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

- **WARNING: Bare `<img>` and `<picture>` in cells get wrapped in `<p>` tags.**
  Since HTML does not allow `<p>` inside `<p>`, this mangles the DOM if your
  cell already contains `<p>` elements alongside images. **Always put images
  in their own dedicated cell** to avoid this.
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

Read `{projectPath}/head.html` and copy the `<script>` and `<link>` tags
EXACTLY — including `nonce` attributes, `type="module"`, and all `<meta>`
tags except CSP.

**Key points:**

- `<header>` and `<footer>` are empty — EDS fills them from nav/footer fragments
- Block previews may show empty headers/footers if those agents haven't
  completed yet — this is expected, focus on the block itself
- The `overflow: auto !important` fixes scrolling limitations

### 6b. Serve and Open the Preview

Serve the project root (`{projectPath}`) as a static site. Root-relative
paths (`/scripts/...`, `/styles/...`, `/drafts/images/...`) resolve against
the project root.

**Fire-and-forget browser sessions — MANDATORY.**
The AEM CLI dev server injects a LiveReload WebSocket into every page it
serves. If you keep a browser tab open while other block agents write
files, the server broadcasts a reload signal to ALL connected tabs —
including yours — causing mid-screenshot navigation and lost work.

**Rule:** open the browser, take your screenshot, then **close the browser
completely** before writing any files. Reopen it fresh for the next
iteration. Never hold a tab open across a file-write.

```text
for each iteration:
  1. write / edit files   ← browser CLOSED here
  2. open browser → navigate to localhost:3000/drafts/{blockName}-preview
  3. wait for blocks to load
  4. screenshot
  5. close browser        ← browser CLOSED again
  6. compare screenshots, plan next edit
```

This round-trip adds ~1 s per iteration but eliminates all LiveReload
collisions regardless of which browser tool is in use.

### 6c. Verify EDS Framework Loaded

Run this verification BEFORE any visual comparison. Execute JS in the page:

```javascript
JSON.stringify({
  hlx: !!window.hlx,
  codeBasePath: window.hlx?.codeBasePath,
  bodyAppear: document.body.classList.contains('appear'),
  sections: document.querySelectorAll('.section').length,
  blocks: Array.from(document.querySelectorAll('[data-block-name]')).map(
    b => ({ name: b.dataset.blockName, status: b.dataset.blockStatus })
  )
})
```

**Required results:**

- `hlx` must be `true`
- `codeBasePath` must be a string
- `bodyAppear` must be `true`
- Your block must appear in the blocks array with `status: "loaded"`

**If any check fails: STOP.** Debug the preview HTML. Common causes:

- Missing `<script>` tags from head.html
- Wrong script paths
- Pre-decorated HTML (remove `.section`, `.block` classes — let EDS add them)

Do NOT work around framework failures by inlining CSS/JS.

### 6d. Wait for Images to Settle

**Before verifying or screenshotting**, force-load all images. EDS uses
`loading="lazy"` by default — images in the viewport may still be
pending when the framework reports `loaded`. Execute JS in the page:

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

### 6e. Verify Images

Execute the `verify-images.js` script (shipped with the `migrate-block`
skill) in the page context. It checks EVERY `<img>`, including hidden
ones, and resolves ambiguous cases with an in-page HTTP fetch.

**Required:** `pass: true`. If false, inspect `failures` (each entry has
`src`, `status`, `httpStatus`) and fix the content or asset paths before
visual iteration.

**`naturalWidth` alone is never a validity signal.** It reads `0` not only
for genuinely broken images but also for SVGs that render perfectly, for
images in hidden panes (tabs/accordion) that never triggered a load, and
for media still being ingested downstream.

### 6f. Structure Sanity-Check (before pixel iteration)

Visual iteration is excellent for CSS gaps but the WRONG loop for
JS/structural bugs — a wrong child/row/cell count will never be fixed by
a CSS tweak, so catch it here before spending screenshot iterations.
Execute JS in the page:

```javascript
(() => {
  const block = document.querySelector('.{blockName}.block');
  if (!block) return JSON.stringify({ error: 'block not found' });
  const rows = block.querySelectorAll(':scope > div');
  return JSON.stringify({
    rows: rows.length,
    cellsPerRow: [...rows].map(
      r => r.querySelectorAll(':scope > div').length
    ),
    imgs: block.querySelectorAll('img').length,
    tabButtons: block.querySelectorAll(
      '[role=tab], .tab-button, button'
    ).length,
  });
})()
```

Compare against the source component's structure. **If a count is wrong,
fix the `.plain.html` content model or the block JS FIRST — do not proceed
to pixel iteration.**

Note whether the block hides content in inactive containers (tab panels,
accordion bodies, carousel slides). Record this as `hasHiddenPanes` in
your report and completion message.

---

## Step 7: Visual Verification (Max 3 Iterations)

Only proceed here after Step 6c passes.

**Font rendering note:** Adobe Fonts (Typekit) validates the requesting
domain. On `localhost`, Typekit returns empty CSS — fonts will show
fallbacks. This is expected and NOT a bug to fix. Focus on layout, spacing,
colors, and structure.

**Source screenshot:** You already captured this in Step 1. Read it from:
`{projectPath}/.migration/source-{blockName}.png`
Do NOT navigate back to the source page.

**Capture target:** Anchor the screenshot to a STABLE CSS SELECTOR, not
a transient reference. Prefer `.{blockName}-wrapper` (the EDS-generated
wrapper) or `.{blockName}.block` directly. Reuse the same selector for
every iteration.

**Follow the fire-and-forget protocol from Step 6b for every iteration.**
The loop is: close browser → edit CSS → open browser → screenshot → close
browser → compare. Never keep a tab open while writing files.

For each iteration:

1. **Edit CSS:** Batch ALL fixes for this iteration into a SINGLE file
   edit. Edit `{projectPath}/blocks/{blockName}/{blockName}.css`. Do NOT
   rewrite the entire file. **Browser is closed while you do this.**

2. **Open browser** → navigate to
   `localhost:3000/drafts/{blockName}-preview.html` → wait for
   `data-block-status="loaded"` on your block.

3. **Screenshot the preview** by CSS selector `.{blockName}-wrapper`.
   Save to `{projectPath}/.migration/preview-{blockName}-iter{N}.png`.

4. **Close the browser.**

5. **Compare:** Read both screenshots. Identify the top 2-3 CSS gaps:
   - Padding/margin (highest priority)
   - Background color/gradient
   - Layout/flex direction
   - Font size/weight (but NOT font-family — see note above)

**Stop conditions:**

- After iteration 3: finalize regardless of remaining differences
- If a further iteration would yield no meaningful visual improvement

---

## Step 8: Write Report — OPT-IN

**Skip this step unless the user explicitly requested reports.**

If requested, write the report in **two passes**:

**Pass 1 — Write immediately after Step 6c passes** (before visual
iterations): Write with `"status": "partial"` and the `edsVerification`
data. This guarantees the orchestrator gets a report even if Step 7
never finishes.

**Pass 2 — Update after Step 7 completes**: Update with final `status`,
`visualVerification`, and `designTokens`.

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
    "codeBasePath": "...",
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
  "hasHiddenPanes": false,
  "designTokens": {
    "--block-bg": "#1a1a2e",
    "--block-text": "#ffffff"
  },
  "issues": ["..."]
}
```

**Status thresholds** — the visual bands are your **qualitative
self-assessment by eye**, NOT a measured pixel diff:

- `"success"` — close visual match + EDS framework verified
- `"partial"` — rough/partial visual match, or EDS framework issues
- `"failed"` — poor visual match, or framework didn't load

**ALL reports MUST use this exact schema.** Do not add extra top-level keys.

## Step 9: Notify Orchestrator

**Close the preview tab** before notifying.

Report completion to the orchestrator with this JSON payload:

```json
{
  "done": true,
  "blockName": "{blockName}",
  "status": "success|partial|failed",
  "iterations": 2,
  "hasHiddenPanes": false,
  "files": {
    "css": "blocks/{blockName}/{blockName}.css",
    "js": "blocks/{blockName}/{blockName}.js",
    "plainHtml": "drafts/{blockName}.plain.html"
  },
  "issues": ["optional list of problems"]
}
```

- `done` is always `true` — signals the agent finished (even on failure)
- `status`: success / partial / failed — self-assessed by eye
- `hasHiddenPanes`: `true` for tabs/accordion/carousel blocks
- `files`: actual paths written, relative to project root
- `issues`: empty array if none

---

## Footer Block — Special Case

If your block is the footer:

- Output content to `{projectPath}/drafts/footer.plain.html`
- Block CSS/JS goes to `blocks/footer/footer.css` and `blocks/footer/footer.js`
- If the repo already has `blocks/footer/`, use existing code
- Do NOT use a `footer` class in any inner `<div>` inside footer.plain.html
  (the EDS framework would try to recursively load the footer block)

> **The footer case may spawn an auxiliary block.** A structured footer
> (e.g. a 4-column grid) is commonly implemented as the `footer` fragment
> PLUS a new content block such as `footer-columns`. This is expected.

### Footer Fragment DOM Structure

The footer loads through a **fragment pipeline** — not as a normal block.
The chain is: `footer.js` → `fragment.js` → `decorateMain()` →
`decorateSections()` → `decorateBlocks()` → your block's `decorate()`.

This means the DOM has extra wrapper layers compared to a normal block.
**CSS selectors must account for this nesting.** Use `.your-block > div`
to target rows.

### Footer Preview — CRITICAL

The footer loads via `loadFooter()` which runs inside `loadLazy()`.
`loadLazy()` only runs after `loadEager()` succeeds. **`loadEager()` will
CRASH if `<main>` is empty.** The footer preview HTML MUST include a
non-empty `<main>`:

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

---

## Known EDS Behaviors

### Button Auto-Decoration

EDS's `decorateButtons()` automatically transforms standalone paragraph
links into button elements:

```html
<!-- Your .plain.html content -->
<p><a href="/cta">Learn More</a></p>

<!-- After EDS decoration -->
<p class="button-container"><a href="/cta" class="button">Learn More</a></p>
```

**Each block owns its own button styling.** There is no global button
reset — you must style buttons per-block with sufficient specificity.
Use `main .{blockName} a.button:any-link` as the baseline selector:

```css
/* Reset button to inline link */
main .{blockName} .button-container { display: inline; }
main .{blockName} a.button:any-link {
  background: none; border: none;
  color: var(--link-color, inherit);
  font-size: inherit; font-weight: inherit;
  padding: 0; margin: 0;
  text-align: left; text-decoration: underline;
}

/* Or style as bordered CTA */
main .{blockName} a.button:any-link {
  background: transparent;
  border: 2px solid currentColor;
  border-radius: 4px;
  padding: 8px 24px;
  text-align: center; text-decoration: none;
}
```

This avoids `!important` escalation from a global reset.

### Full-Width Blocks

EDS wraps sections in `.section > div { max-width }`. The orchestrator
sets this value as part of the layout contract in `styles.css` and
handles full-bleed sections via a `.section.full-width` rule.

**Do NOT override `.{blockName}-wrapper` max-width or padding.** The
layout contract owns section-level geometry. If your block needs
full-bleed, tell the orchestrator in your completion message (add
`"fullWidth": true` to the JSON payload) and it will apply the
correct section style during assembly.

### Icon Rendering

EDS renders `<span class="icon icon-{name}">` as `<img>` tags pointing
to `/icons/{name}.svg`. Because they're `<img>` elements (not inline SVG),
**`fill="currentColor"` does NOT work.** Use explicit fill colors.

### decorateButtons() Variant Risk

Some projects override `decorateButtons()` in `scripts.js` to require
`<strong>` or `<em>` wrapper. Check `{projectPath}/scripts/scripts.js`
for `strong` or `em` in the `decorateButtons` function.

---

## Reference: Content Models

1. **Standalone** — One-off (hero, blockquote): single row, mixed cells
2. **Collection** — Repeating items (cards, carousel): rows = items,
   cells = item parts
3. **Configuration** — Key-value pairs: ONLY for API-driven content.
   NEVER use for static content.

## Reference: Quality Criteria

| Criterion | Target |
| ----------- | -------- |
| EDS framework verified | hlx=true, bodyAppear=true, block loaded |
| Visual similarity (by eye) | close match acceptable, near-exact ideal |
| Max iterations | 3 (5 for header) |
| CSS scoping | All rules under .blockname |
| .plain.html | NO html/head/body/script/style tags |
| Images | `<picture><img>` with alt text, /drafts/images/ paths |
| Report schema | Exact schema above, no extra keys |
