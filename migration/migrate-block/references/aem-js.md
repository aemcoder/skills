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

## DOM structure

When aem.js decorates your block, the DOM changes from the authored
structure to the decorated structure. Target the decorated structure
in your CSS.

```
Authored (.plain.html):            After aem.js decoration:

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

The block `<div>` gets `.block` class + `data-block-name` +
`data-block-status="loaded"` (which persists after load).

A `-wrapper` div is inserted around the block. A `.section` div wraps
the section. Rows and cells inside the block are NOT changed.

## Preview verification (Step 6c)

Run this eval to verify the framework loaded. It produces the shared
top-level shape (`frameworkLoaded`, `pageReady`, `blockDecorated`,
`details`) described in Step 6c of the main SKILL.md:

```bash
playwright-cli eval --tab={previewTabId} "(() => {
  const target = document.querySelector('.{blockName}.block');
  const blocks = Array.from(document.querySelectorAll('[data-block-name]'))
    .map(b => ({ name: b.dataset.blockName, status: b.dataset.blockStatus }));
  return JSON.stringify({
    frameworkLoaded: !!window.hlx && !!window.hlx.codeBasePath,
    pageReady: document.body.classList.contains('appear'),
    blockDecorated: target?.dataset.blockStatus === 'loaded',
    details: {
      codeBasePath: window.hlx?.codeBasePath,
      sections: document.querySelectorAll('.section').length,
      blocks
    }
  });
})()"
```

Required: all three top-level booleans must be `true`. If
`blockDecorated` is `false`, inspect `details.blocks` for your block's
entry — it may still have `status: "loading"` (wait and retry) or be
missing entirely (check nav meta, script paths, and that your block
exists in the `.plain.html`).

If any check fails, stop and debug — do not work around framework
failures by inlining CSS/JS.

## Button decoration

`decorateButtons()` (called during `decorateMain()`) automatically
transforms standalone paragraph links into buttons:

```html
<!-- Authored .plain.html -->
<p><a href="/cta">Learn More</a></p>

<!-- After decoration -->
<p class="button-container"><a href="/cta" class="button">Learn More</a></p>
```

Plain `<p><a>` becomes `.button`. EDS also applies `text-align: center`
to `.button` elements by default.

Check `{projectPath}/styles/styles.css` for project-level button resets
before writing overrides. Use `main .{blockName} a.button:any-link` as
your baseline selector to match project reset specificity.

## Full-width blocks

EDS wraps sections in `.section > div { max-width: 1200px }`. Full-bleed
blocks (heroes, banners) need their wrapper overridden:

```css
.{blockName}-wrapper {
  max-width: 100% !important;
  padding: 0 !important;
}
```

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
