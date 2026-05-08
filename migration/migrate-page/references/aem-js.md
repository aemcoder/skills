# aem-js — migrate-page (cone) overrides

Flavor-specific rules for the cone phases when the project uses the
standard EDS boilerplate. Read after Phase 1 flavor detection.

## Brand and styles (Phase 2.5)

### brand.css variables

Write `{projectPath}/styles/brand.css` with:

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

### styles.css edits

Add `@import url('brand.css');` as the VERY FIRST LINE of
`{projectPath}/styles/styles.css` (CSS spec requires `@import` before
all other rules). Update `:root` variables to match brand values where
the base `styles.css` declared them.

Add the global button reset after `:root`:

```css
main .button-container { display: inline; }
main a.button:any-link {
  background: none; border: none; border-radius: 0;
  color: var(--link-color); font-size: inherit; font-weight: inherit;
  padding: 0; margin: 0; text-decoration: underline; white-space: normal;
}
```

## Preview HTML meta tags

Include these meta tags:

```html
<meta name="nav" content="/drafts/nav">
<meta name="footer" content="/drafts/footer">
```

(Add `<meta name="header">` only if the project uses a non-default
header block class — typically not needed.)

## Preview load-wait verification (Phase 4.4)

Wait for all blocks to reach `data-block-status="loaded"` before
screenshotting:

```bash
playwright-cli eval --tab={previewTabId} "JSON.stringify({ blocks: document.querySelectorAll('[data-block-status=\"loaded\"]').length, expected: document.querySelectorAll('[data-block-name]').length, appear: document.body.classList.contains('appear') })"
```

Poll until `blocks >= expected` and `appear: true`. Then screenshot.

## Known quirks

None specific to this flavor.
