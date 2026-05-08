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

```js
export default async function loadPostLCP() {
  const header = document.querySelector('header');
  if (header) await loadBlock(header);
}
```

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

```html
<div><!-- brand content --></div>
<div><!-- nav ul --></div>
<div><!-- actions --></div>
```

Fragment path default: `/fragments/nav/header` (read from a constant
inside `header.js`). Set `<meta name="nav" content="...">` in the
preview to override.

## Preview verification (Step 6c)

```bash
playwright-cli eval --tab={previewTabId} "JSON.stringify({ hlx: !!window.hlx, bodySession: document.body.classList.contains('session'), headerBlock: !!document.querySelector('.header.block'), headerSections: document.querySelectorAll('.header.block > div').length })"
```

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
