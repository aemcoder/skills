# author-kit — migrate-page (cone) overrides

Flavor-specific rules for the cone phases when the project uses the
Author Kit boilerplate. Read after Phase 1 flavor detection.

## Brand and styles (Phase 2.5)

### brand.css variables

AK uses a single `--font-family` variable instead of
`--heading-font-family` / `--body-font-family`. Write
`{projectPath}/styles/brand.css` with:

```css
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
```

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

```html
<link rel="stylesheet" href="https://use.typekit.net/{kitId}.css">
```

## Preview HTML meta tags

**Do NOT include `<meta name="footer">`.** AK uses it as the block
class name, which collides with `blocks/footer/footer.js`'s fragment
path lookup. Setting it produces `blocks//drafts/footer//drafts/footer.js`
and fails.

Required meta tags:

```html
<meta name="nav" content="/drafts/nav">
```

Do NOT include `<meta name="header">` either — `decorateHeader()`
defaults to class `'header'`, which loads the correct block.

After assembling the preview HTML, copy the footer fragment to the path
`blocks/footer/footer.js` falls back to:

```bash
mkdir -p /shared/{repo-name}/fragments/nav
cp /shared/{repo-name}/drafts/footer.plain.html /shared/{repo-name}/fragments/nav/footer.plain.html
```

`utils/footer.js` then defaults `footer.className = 'footer'`, loads the
block, and the block falls back to its `FOOTER_PATH` constant
(`/fragments/nav/footer`). Both steps use safe defaults.

## Preview load-wait verification (Phase 4.4)

AK does NOT persist `data-block-status` — it's removed after each block
loads. Polling for `loaded` status returns 0. Use this signal set
instead:

```bash
playwright-cli eval --tab={previewTabId} "JSON.stringify({ bodySession: document.body.classList.contains('session'), sections: document.querySelectorAll('.section').length, blockContent: document.querySelectorAll('.block-content').length, header: !!document.querySelector('.header.block'), footer: !!document.querySelector('.footer.block') })"
```

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
