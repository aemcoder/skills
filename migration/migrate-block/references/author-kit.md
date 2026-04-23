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

## DOM structure

When ak.js decorates your block, `decorateSections()` calls
`groupChildren()`, which wraps `<div>` children in
`<div class="block-content">` and non-`<div>` children in
`<div class="default-content">`. Blocks are discovered as
`.block-content > div[class]`.

```
Authored (.plain.html):            After ak.js decoration:

<div>                              <div class="section">
  <div class="hero">                 <div class="block-content">
    <div>  ← row 1                     <div class="hero-wrapper">
      <div>cell 1</div>                    <div class="hero block"
      <div>cell 2</div>                          data-block-name="hero">
    </div>                                     <div>  ← row 1 (unchanged)
  </div>                                         <div>cell 1</div>
</div>                                           <div>cell 2</div>
                                               </div>
                                             </div>
                                           </div>
                                         </div>
```

Key differences from aem-js:
- An extra `<div class="block-content">` layer sits between `.section`
  and `.{blockName}-wrapper` (added by `groupChildren()`).
- `data-block-status` is REMOVED after the block finishes loading — it
  does not persist.
- `data-block-name` is set during decoration but may also be removed
  on cleanup.

Rows and cells inside the block are NOT changed.

## Preview verification (Step 6c)

Because `data-block-status` is transient in AK, the `blockDecorated`
check uses internal decoration markers (elements with class ending in
`-inner` or `-container`) rather than a block-status attribute:

```bash
playwright-cli eval --tab={previewTabId} "(() => {
  const target = document.querySelector('.{blockName}');
  const decorated = !!target?.querySelector('[class*=\"-inner\"], [class*=\"-container\"]');
  return JSON.stringify({
    frameworkLoaded: !!window.hlx,
    pageReady: document.body.classList.contains('session'),
    blockDecorated: decorated,
    details: {
      bodySession: document.body.classList.contains('session'),
      sections: document.querySelectorAll('.section').length,
      blockContent: document.querySelectorAll('.block-content').length,
      hasTarget: !!target
    }
  });
})()"
```

Required: all three top-level booleans must be `true`. If
`blockDecorated` is unreliable for your block (e.g., the block has no
internal `*-inner` or `*-container` children), either widen the
selector to match your block's own decoration output or add a 2-second
hard timeout before screenshotting.

If any check fails, stop and debug — do not work around framework
failures by inlining CSS/JS.

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
  2.5 must override this variable specifically — see "Brand and styles
  (Phase 2.5)" in `migrate-page/references/author-kit.md`.
- **section-metadata as grid container:** AK treats sections as CSS Grid
  containers configured by `section-metadata` (e.g., `layout: bento`,
  `grid: 3`, `gap: s`). For complex layouts, prefer composing with
  `section-metadata` + card variants over bespoke nth-child CSS.
- **Card variants via class:** AK cards accept space-separated classes
  (e.g., `<div class="card ceo-quote">`). Variant styles scope via
  `.card.variant-name { ... }` in the block's CSS.
