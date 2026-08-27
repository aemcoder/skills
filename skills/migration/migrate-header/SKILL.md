---
name: migrate-header
description: Migrate a website header/navigation into an AEM Edge Delivery Services header block with nav.plain.html. Handles single-row and multi-section headers, dropdowns, mega menus, and mobile patterns.
requires:
  - browser
  - node
---

# Migrate Header to EDS

Migrate a website's header/navigation into the EDS header block pattern.
Produces `nav.plain.html` + customized `header.css`. The header JS is
typically pre-built in the EDS repo — you customize CSS only.

## HARD CONSTRAINTS

1. **Output is `nav.plain.html`** — NOT a regular block `.plain.html`.
2. **Block name is `header`** — CSS/JS at `blocks/header/header.css|.js`.
3. **If `blocks/header/` exists in the repo, keep the existing JS.**
   Only generate `nav.plain.html` and customize `header.css`.
4. **CSS specificity: ALL rules must be `.header.block` scoped.**
   NOT `.header` — must be `.header.block` to prevent global overrides.
5. **NEVER inline CSS or JS in the preview.** Use the EDS framework.
6. **NEVER pre-decorate HTML.** No `.section`, `.block`, `data-block-name`.

---

## Parameters (from orchestrator's prompt)

- `sourceUrl` — URL of the source page
- `projectPath` — EDS project path (e.g., `/path/to/mysite`)
- `bounds` — bounding box of the header region
- `notes` — decomposition notes (e.g., "two-tier purple header")

---

## Step 1: Capture Source Header

**Open** `{sourceUrl}` in the browser.

**MANDATORY — set the viewport to 1440×900 before ANY screenshot or
extraction.** Browser tabs often default to ~780px (a mobile breakpoint).
Capturing at that width yields a mobile-layout screenshot and wrong
fidelity decisions. Never skip this.

Verify the viewport by executing JS in the page:

```javascript
window.innerWidth >= 1024
```

If this returns `false`, STOP and re-set the viewport.

The orchestrator dismissed overlays during Phase 1 and set consent cookies.
If you still see an overlay, click its accept/dismiss button via JS
execution.

**Always wrap JS execution calls in IIFEs.**

Check whether the site uses `<header>` or `<nav>` for navigation:

```javascript
(() => {
  const h = document.querySelector('header');
  const n = document.querySelector('nav');
  return JSON.stringify({
    header: !!h, nav: !!n,
    headerTag: h?.tagName, navId: n?.id
  });
})()
```

Extract all header content in one comprehensive call:

```javascript
(() => {
  const nav = document.querySelector('header')
    || document.querySelector('nav');
  if (!nav) return JSON.stringify({ error: 'no header/nav found' });
  const logoImg = nav.querySelector('img');
  const logoSvg = !logoImg ? nav.querySelector('svg') : null;
  const links = [...nav.querySelectorAll('a')].map(a => ({
    href: a.href, text: a.textContent.trim()
  }));
  const styles = getComputedStyle(nav);
  return JSON.stringify({
    html: nav.outerHTML.slice(0, 5000),
    logo: logoImg
      ? { kind: 'img', src: logoImg.src, alt: logoImg.alt }
      : logoSvg
        ? { kind: 'inline-svg',
            hasText: !!logoSvg.querySelector('text') }
        : null,
    links: links.slice(0, 50),
    tokens: {
      bg: styles.backgroundColor, color: styles.color,
      height: styles.height, fontSize: styles.fontSize
    }
  });
})()
```

**Record the logo type** — it decides the Step 4 brand pattern:

- `logo` is `null`: no logo detected — flag for manual reconciliation.
- `logo.kind === 'inline-svg'`: read `logo.hasText`. Record
  `svg-with-text` or `svg-shape-only`.
- `logo.kind === 'img'` and src ends in `.svg` or is `data:image/svg`:
  fetch it and check for `<text>` elements. Record `svg-with-text` or
  `svg-shape-only`.
- `logo.kind === 'img'` with a non-SVG extension: record `raster`.
- `logo.kind === 'img'` with no recognizable extension: check the
  response `Content-Type`. Treat `image/svg+xml` as SVG, else `raster`.

**Screenshot the source header NOW** — reuse for all visual iterations.
Get the accessibility snapshot, identify the header element, and
screenshot it by CSS selector. Save to
`{projectPath}/.migration/source-header.png`.

**Close the source tab** after extraction.

Steps 2–5 do not use the browser. You will open a new tab in Step 6b.

---

## HARD RULE: Draft-First Workflow

**Write nav.plain.html within 7 minutes of starting.** Do NOT spend more
than 7 minutes on header analysis before writing the initial files.

- Use placeholder items for complex mega menu content.
- Do NOT recreate icon fonts or SVG icons from scratch. Use text/emoji.
- Extract the 5 most impactful header tokens before writing the first CSS.
  Iterate toward exact values during visual verification.

---

## Step 2: Analyze Header Structure

Examine the extracted HTML and screenshot to determine the header type:

### Single-Row Header

**Indicators:**

- Logo, navigation, and utility links on the same horizontal level
- Single background color across the entire header
- No visual separation between sections

### Multi-Section Header

**Indicators:**

- Multiple distinct horizontal rows stacked vertically
- Separate logo area from navigation
- Announcement/promo bar above or below nav
- Utility links in a separate row
- Different background colors for different sections

Also detect dropdown types for each nav item:

- **Simple dropdown:** nested `<ul>` contains only `<li>` with `<a>` links
- **Mega dropdown:** nested content includes headings, paragraphs, images,
  or rich content blocks

---

## Step 3: Install Header Block

Check if the repo already has a header block by reading
`{projectPath}/blocks/header/header.js` and `header.css`.

**CRITICAL: Read header.js to understand the JS contract.** The
nav.plain.html structure MUST match what the JS expects:

- If the JS uses **index-based section assignment** (e.g.,
  `children[0]`, `children[1]`, `children[2]`), do NOT add
  `section-metadata` divs — they would count as extra children.
- If the JS uses **section-metadata Style values**, use the
  multi-section format with metadata divs.
- Count how many child `<div>`s the JS expects and match exactly.

If `blocks/header/` exists, **keep the existing JS**. Customize CSS only.

If `blocks/header/` does NOT exist, create both files. The JS should:

- Load `nav.plain.html` as a fragment via `getMetadata('nav')`
- Build sections based on section-metadata Style values
- Handle hamburger toggle for mobile
- Handle dropdown open/close (hover on desktop, click on mobile)
- Support keyboard navigation (arrow keys, Escape)

---

## Step 4: Generate nav.plain.html

Write to `{projectPath}/drafts/nav.plain.html`.

> **Brand logos: never ship an SVG as a bare `<img>`.** Downstream DA
> media optimization rasterizes SVGs; any SVG relying on `<text>` + web
> fonts loses its text. If the source logo is an SVG, decompose it:
> a **shape-only icon** committed to `{projectPath}/icons/{icon-name}.svg`,
> referenced through the EDS icon system
> (`<span class="icon icon-{icon-name}"></span>`), plus the wordmark as
> **real HTML text**. Raster logos (PNG/JPG) may remain `<img>` elements.

### Single-Row Format

```html
<div>
  <!-- SVG source logo: icon + HTML wordmark -->
  <p><a href="/"><span class="icon icon-brand"></span> <strong>Company</strong></a></p>
  <!-- Raster source logo: plain img -->
  <!-- <p><a href="/"><img src="/drafts/images/logo.png" alt="Company"></a></p> -->
  <ul>
    <li><a href="/products">Products</a>
      <ul>
        <li><a href="/products/a">Product A</a></li>
        <li><a href="/products/b">Product B</a></li>
      </ul>
    </li>
    <li><a href="/solutions">Solutions</a></li>
    <li><a href="/about">About</a></li>
  </ul>
  <p><a href="/login">Login</a> | <a href="/signup">Sign Up</a></p>
  <div class="section-metadata">
    <div><div>Style</div><div>main-nav</div></div>
    <div><div>Mobile Style</div><div>accordion</div></div>
  </div>
</div>
```

### Multi-Section Format

```html
<div>
  <p><span class="icon icon-brand"></span> <strong>Company</strong></p>
  <div class="section-metadata">
    <div><div>Style</div><div>brand</div></div>
  </div>
</div>
<div>
  <p>Free shipping on orders over $50 <a href="/promo">Shop Now</a></p>
  <div class="section-metadata">
    <div><div>Style</div><div>top-bar</div></div>
  </div>
</div>
<div>
  <ul>
    <li><a href="/products">Products</a>
      <ul>
        <li><a href="/products/a">Product A</a></li>
      </ul>
    </li>
    <li><a href="/about">About</a></li>
  </ul>
  <div class="section-metadata">
    <div><div>Style</div><div>main-nav</div></div>
    <div><div>Mobile Style</div><div>slide-in</div></div>
  </div>
</div>
<div>
  <ul>
    <li><a href="/login">Login</a></li>
    <li><a href="/cart">Cart</a></li>
  </ul>
  <div class="section-metadata">
    <div><div>Style</div><div>utility</div></div>
  </div>
</div>
```

### Section Styles Reference

| Style | Purpose | Typical Content |
| ------- | --------- | ----------------- |
| `brand` | Logo/company identity | Image, company name |
| `top-bar` | Announcements, promo | Text, promo links |
| `main-nav` | Primary navigation | `<ul>` with dropdowns |
| `utility` | User actions | Login, search, cart, language |

### Mobile Style Reference

| Mobile Style | Behavior |
| ------------- | ---------- |
| `accordion` | Submenus expand in place (default) |
| `slide-in` | Submenus slide from right with back button |
| `fullscreen` | Submenus take full viewport with fade |

### Content Transformation Rules

When converting source HTML to nav.plain.html:

- **Remove** all classes, inline styles, data attributes
- **Keep** only HTML structure, text content, and href attributes
- **Logo (SVG source):** shape-only icon at
  `{projectPath}/icons/{icon-name}.svg` (no `<text>` elements) +
  `<span class="icon icon-{icon-name}"></span>` + wordmark as HTML text
- **Logo (raster source):** wrap in `<p><a><img></a></p>`, download
  image to `/drafts/images/` using binary-safe download
- **Nav links:** clean `<ul><li><a>` hierarchy, preserve dropdown nesting
- **Mega menus:** convert columns to `<li>` items, normalize headings to `<h3>`
- **Utility:** convert to `<ul>` list or pipe-separated `<p>` links
- **Announcements:** wrap in `<p>` with inline links

### Mega Menu Transformation

> **Known limitation — mega-menu richness is flattened.** Rich mega-menu
> content is reduced to flat nested link lists. All link destinations are
> preserved, but descriptive text and imagery are dropped by design.

Source:

```html
<div class="mega-menu">
  <div class="mega-column">
    <h4>Category</h4>
    <p>Description text</p>
    <a href="/cta">Learn More</a>
  </div>
</div>
```

Becomes:

```html
<ul>
  <li>
    <h3>Category</h3>
    <p>Description text</p>
    <a href="/cta">Learn More</a>
  </li>
</ul>
```

---

## Step 5: Customize Header CSS

Edit `{projectPath}/blocks/header/header.css`.

### Seed known tokens from brand.json first

Before iterating on CSS, read `{projectPath}/.migration/brand.json` and
seed the values it already measured:

- `spacing.navHeight` → your `--nav-height`
- `fonts.heading.family` → the nav/brand/heading font
- `fonts.body.family` → nav link / utility text font
- `colors.background` / `colors.text` → header background and text

Apply these as your STARTING custom-property values, then iterate only on
what the screenshot comparison still shows off.

**ALL rules MUST use `.header.block` specificity:**

```css
/* ❌ WRONG — global styles can override */
.header .header-nav a { color: inherit; }

/* ✅ CORRECT — protected from overrides */
.header.block .header-nav a { color: inherit; }
```

**Key custom properties to adjust:**

```css
.header.block {
  --header-background: #1a0a3e;
  --header-section-padding: 0.5rem 1rem;
  --header-max-width: 1400px;
  --header-nav-gap: 2rem;
  --header-nav-font-size: 1rem;
  --header-nav-font-weight: 500;
  --header-dropdown-background: #fff;
  --header-dropdown-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  --header-dropdown-padding: 1.5rem;
  --header-mobile-menu-background: #fff;
}
```

**`aria-expanded` desktop behavior:** Standard header.js sets
`aria-expanded="true"` on the nav element when on desktop. Your desktop
CSS MUST handle both states:

```css
/* Mobile: expanded menu takes full width */
@media (width < 900px) {
  .header.block nav[aria-expanded='true'] {
    display: grid;
    grid-template: 'brand' auto 'sections' 1fr 'tools' auto / 1fr;
  }
}

/* Desktop: MUST override mobile expanded styles */
@media (width >= 900px) {
  .header.block nav,
  .header.block nav[aria-expanded='true'] {
    display: grid;
    grid-template:
      'brand . tools' {topRowHeight}
      'sections sections sections' {navRowHeight}
      / auto 1fr auto;
  }
}
```

### Brand icon + wordmark sizing

When the brand uses the icon + HTML-text pattern, size both explicitly:

```css
.header.block .icon-brand svg,
.header.block .icon-brand img {
  height: var(--brand-icon-height, 32px);
  width: auto;
}

.header.block .header-brand strong {
  font-size: var(--brand-wordmark-size, 1.25rem);
  font-weight: 700;
}
```

---

## Step 6: Preview and Verify

### 6a. Create Preview Page

Read `{projectPath}/head.html`.

Write `{projectPath}/drafts/header-preview.html`:

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
    <div><h1>Header Preview</h1><p>Content below header for context.</p></div>
  </main>
  <footer></footer>
</body>
</html>
```

### 6b. Serve and Open the Preview

Serve the project root (`{projectPath}`) as a static site and open
`drafts/header-preview.html` in the browser. Root-relative paths must
resolve against the project root.

To pick up CSS/JS changes during iteration, reload the preview page — do
not re-open or re-serve for every iteration.

### 6c. Verify EDS Framework

Execute JS in the page:

```javascript
JSON.stringify({
  hlx: !!window.hlx,
  codeBasePath: window.hlx?.codeBasePath,
  bodyAppear: document.body.classList.contains('appear'),
  headerBlock: !!document.querySelector('.header.block'),
  navSections: document.querySelectorAll('.header-section').length
})
```

**Required:** `hlx: true`, `bodyAppear: true`, `headerBlock: true`.
If `headerBlock` is false, check that `nav.plain.html` exists and
the `<meta name="nav">` points to `/drafts/nav`.

### 6d. Verify Images

Execute the `verify-images.js` script (shipped with the `migrate-block`
skill) in the page context.

**Required:** `pass: true`. The brand icon is the most common
`svg-indeterminate` hit — it is healthy when its `httpStatus` is 200.

---

## Step 7: Visual Verification (Max 5 Iterations)

Header target: a **close visual match by eye**. Max **5 iterations**.

**Font rendering note:** Adobe Fonts (Typekit) on `localhost` returns
empty CSS — fonts will show fallbacks. This is expected. Focus on
layout, spacing, colors, and structure.

**Source screenshot:** Read from
`{projectPath}/.migration/source-header.png`. Do NOT navigate back.

For thin headers (<150px tall), also use JS-based measurements:

```javascript
(() => {
  const h = document.querySelector('header');
  const r = h.getBoundingClientRect();
  const logo = h.querySelector('img')
    || h.querySelector('.icon svg')
    || h.querySelector('.icon');
  const lr = logo ? logo.getBoundingClientRect() : null;
  return JSON.stringify({
    totalHeight: r.height,
    logoHeight: lr?.height,
    logoWidth: lr?.width
  });
})()
```

**Capture target:** Use a stable CSS selector like `.header.block` or
`.header-wrapper`. Reuse across iterations.

For each iteration:

1. **Screenshot** the preview header by CSS selector. Save to
   `{projectPath}/.migration/preview-header-iter{N}.png`.

2. **Compare** source and preview: focus on background color, logo size,
   nav spacing, layout.

3. **Fix:** Batch ALL CSS fixes into a SINGLE file edit. Edit
   `header.css` custom properties only.

4. **Reload** the preview page.

**Common header-specific fixes:**

- Background color → `--header-background`
- Logo size → `.header.block .header-brand img { max-height }`; or
  `--brand-icon-height` / `--brand-wordmark-size`
- Nav link spacing → `--header-nav-gap`
- Font size/weight → `--header-nav-font-size`, `--header-nav-font-weight`
- Dropdown position → `--header-dropdown-padding`
- Section padding → `--header-section-padding`

**Stop conditions:**

- After iteration 5: finalize
- If a further iteration would yield no meaningful improvement

---

## Step 8: Write Report — OPT-IN

**Skip this step unless the user explicitly requested reports.**

Write in **two passes** (same as migrate-block).

Write to `{projectPath}/.migration/reports/header-report.json`:

```json
{
  "blockName": "header",
  "sourceUrl": "{sourceUrl}",
  "timestamp": "<ISO 8601>",
  "status": "<success|partial|failed>",
  "headerType": "<single-row|multi-section>",
  "sections": ["brand", "main-nav", "utility"],
  "mobileStyle": "accordion",
  "dropdownTypes": { "Products": "mega", "About": "simple" },
  "files": {
    "css": "blocks/header/header.css",
    "js": "blocks/header/header.js",
    "plainHtml": "drafts/nav.plain.html",
    "previewHtml": "drafts/header-preview.html"
  },
  "images": [
    { "source": "https://...", "local": "/drafts/images/logo.png" }
  ],
  "edsVerification": {
    "hlx": true,
    "headerBlock": true,
    "navSections": 3
  },
  "visualVerification": {
    "iterationsUsed": 3,
    "previewWorked": true,
    "iterations": [
      { "iteration": 1, "changes": "...", "gaps": ["..."] }
    ],
    "finalAssessment": "..."
  },
  "designTokens": {
    "--header-background": "#1a0a3e",
    "--header-nav-font-size": "0.875rem"
  },
  "issues": ["..."]
}
```

## Step 9: Notify Orchestrator

**Close the preview tab** before notifying.

Report completion to the orchestrator with this JSON payload:

```json
{
  "done": true,
  "blockName": "header",
  "status": "success|partial|failed",
  "headerType": "single-row|multi-section",
  "iterations": 3,
  "files": {
    "css": "blocks/header/header.css",
    "js": "blocks/header/header.js",
    "plainHtml": "drafts/nav.plain.html"
  },
  "issues": ["optional list of problems"]
}
```

- `done` is always `true` — signals the agent finished
- `status`: success / partial / failed — self-assessed by eye
- `headerType`: detected layout type
- `files`: actual paths, relative to project root
- `issues`: empty array if none
