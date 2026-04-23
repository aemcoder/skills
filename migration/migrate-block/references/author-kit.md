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

```bash
playwright-cli eval --tab={previewTabId} "JSON.stringify({ hlx: !!window.hlx, bodySession: document.body.classList.contains('session'), sections: document.querySelectorAll('.section').length, blockContent: document.querySelectorAll('.block-content').length, decoratedBlock: !!document.querySelector('.{blockName} .{blockName}-inner, .{blockName} [class*=\"-inner\"], .{blockName} [class*=\"-container\"]') })"
```

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

```css
.{blockName}-wrapper {
  max-width: 100% !important;
  padding: 0 !important;
}
```

AK may add an additional `.block-content` level between the wrapper
and the block — check your DOM at runtime and scope accordingly.

## Card block contract

If your block uses the existing `card` block from the repo, images
MUST be wrapped in `<p>` tags:

```html
<!-- CORRECT — card.js promotes this to .card-picture-container -->
<div><p><picture>...</picture></p><p>Content text</p></div>

<!-- WRONG — card.js ignores the picture; it stays in content-container -->
<div><picture>...</picture><p>Content text</p></div>
```

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

```bash
mkdir -p /shared/{repo}/fragments/nav
cp /shared/{repo}/drafts/footer.plain.html /shared/{repo}/fragments/nav/footer.plain.html
```

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
