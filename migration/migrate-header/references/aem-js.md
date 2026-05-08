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

```bash
playwright-cli eval --tab={previewTabId} "JSON.stringify({ hlx: !!window.hlx, codeBasePath: window.hlx?.codeBasePath, bodyAppear: document.body.classList.contains('appear'), headerBlock: !!document.querySelector('.header.block'), navSections: document.querySelectorAll('.header-section').length })"
```

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
