# Learnings — Cross-Run Findings

The living brain. Anything that should outlive a single run goes here.
Append entries as `## YYYY-MM-DD — short title` at the top. Each entry
should link to the run(s) that produced it.

Categories to look for as the list grows:
- **Conversion patterns** that worked across different inputs
- **EDS gotchas** discovered while wiring the overlay
- **DA gotchas** discovered while pushing content
- **LLM prompting patterns** that produced good block segmentation
- **DOM equality failures** — what slipped past the converter and why
- **Things that looked simple but weren't**

When an entry stabilizes (we've seen it hold across multiple runs),
promote it to `architecture.md` or `eds-da-mechanics.md` as a
verified fact, and link back here.

---

## 2026-05-19 — Don't put `data-slot` on a container that has nested `data-slot` children

**From run #005** (Heathrow's pillar-cards hinted at this, BizPro Hub's
product-cards proved it). The slot writer for every element type
(`<a>`, `<picture>`, default text) ultimately writes to the target
element's `innerHTML` (or replaces the element entirely). When the
target has nested `[data-slot]` children, those markers and their
content are destroyed before they can be processed.

**Specific failure mode observed in run #005.** Subagent slotted the
wrapping `<a class="explore-card-link-container" data-slot="card-1.link">`
of a product card AND its inner `<h3 data-slot="card-1.title">`,
`<p data-slot="card-1.body">`, and `<img data-slot="card-1.icon">`.
The link writer ran, set `el.innerHTML = "Firefly"` from the DA cell
value `<a href="#">Firefly</a>`, and obliterated icon + title + body.
Visible result: 9 product cards reduced to dark labels with no content.

**The rule.** For any element pattern where a container wraps multiple
authorable children: slot the children individually, leave the container
static. Conversely, if you want the whole block to be authorable as
one chunk, don't slot its children. Never both.

**Edge cases.** An `<a data-slot="cta">Learn more <img></a>` (text +
decorative icon, no nested data-slot) is fine — the icon is lost on
edit but that's acceptable for buttons. The trigger is **nested
`[data-slot]`**, not "any inner content".

**Substrate implications.** The engine COULD detect this and warn (or
skip the outer slot when inner data-slots exist). For now, methodology-
level rule only. Worth adding to the Generate phase rules.

## 2026-05-19 — Cross-origin `@font-face` requires CORS headers on the font host

**From run #005**. Browsers strictly enforce CORS on `@font-face url(…)`
requests, unlike `<img>`, `<script src>`, `<source src>`, or CSS
`url(image.jpg)` references, which all work cross-origin without
explicit headers.

**Observed in run #005.** Source page self-hosts 18 OTF font files at
`http://127.0.0.1:8080/.../assets/fonts/...`. Once the converted page
was loaded from `http://localhost:3000`, every font URL produced:

> Access to font at '…' from origin 'http://localhost:3000' has been
> blocked by CORS policy: No 'Access-Control-Allow-Origin' header…

**Effect.** Fonts fall back to system-ui. For Adobe Clean / Inter /
similar mainstream typefaces, visually subtle but noticeable.

**When this hits future runs.** Any source page that self-hosts fonts
on a different origin from the served EDS page. The source host needs
`Access-Control-Allow-Origin: *` (or matching) on font responses.
Other cross-origin resources are not affected.

**Mitigation paths.**
- (Recommended for one-off conversions) Configure source host CORS.
- Migrate fonts to the EDS repo's `/fonts/` directory (counts as
  asset migration — currently out of methodology scope).
- Replace `@font-face` with a font CDN that does send CORS headers
  (Adobe Fonts kit, Google Fonts).

## 2026-05-19 — Media Bus needs ABSOLUTE URLs in DA cells (root-relative produces `about:error`)

**From run #005 production round-trip**. EDS Media Bus, which
optimises `<img>` URLs in DA-source HTML, only handles **absolute
URLs**. Root-relative paths (`/assets/section-2/card-image-1.png`)
are resolved against the DA content host (`content.da.live`) where
those paths don't exist — the pipeline serves them as
`<img src="about:error">` and the browser surfaces a console
`ERR_UNKNOWN_URL_SCHEME` error.

**Observed symptom in run #005.** First production push had DA cell
values like `<img src="/assets/section-2/card-image-1.png">`. The
pipeline rewrote each one to `<img src="about:error">`. Story-card
backgrounds (background-image slot writer) ended up with
`style="background-image: url('about:error')"` and the cards rendered
as black tiles. 2 console errors per page-load (`net::ERR_UNKNOWN_URL_SCHEME`).

**Fix.** Use absolute URLs in DA cells. For run #005 the assets are
vendored on the same branch, so `https://<branch>--<repo>--<owner>.aem.page/assets/...`
works. After re-PUT, Media Bus correctly fetched + optimised:
`./media_<sha>.png?width=750&format=webply&optimize=medium`.

**The asymmetry that's easy to miss.**
- Template/fragment HTML refs to `/assets/...` — the BROWSER resolves
  these against the rendered page host, which is the code-bus host.
  Code-bus serves `/assets/`. Works fine.
- DA cell `<img src=...>` refs — the EDS PIPELINE (Media Bus) resolves
  these. Media Bus resolves against the DA content host. Doesn't work
  unless the URL is absolute to a publicly reachable image source.

**Generic rule for DA cells with images.** Always use absolute URLs.
Common shapes that work:
- Vendored same-branch: `https://<branch>--<repo>--<owner>.aem.page/assets/...`
- Public source (github.io, etc.): `https://<source-host>/assets/...`
- DA media: `https://content.da.live/<org>/<repo>/media_<sha>...`

## 2026-05-19 — Vendoring `/assets/` in the repo is a viable option for locally-hosted source pages

**From run #005 follow-up**. When the source URL is private/local-only,
the cleanest alternative to "skip production" is to copy the source's
asset tree (or just the referenced subset) into `/assets/` at the
repo root. Code-bus serves them at the same paths the source used,
so:

- Template and fragment HTML keep relative paths working (browser
  resolves against the rendered page host = code-bus).
- CSS `url(…)` refs (e.g. `@font-face`) keep working same-origin.
- Same-origin means no CORS issues for fonts.
- DA cell image refs still need to be absolute URLs (see the
  Media-Bus learning above).

**Trade-offs.**
- Binary assets in git — discouraged by EDS guidance for production
  sites because they bloat the repo + slow code-bus pulls. For run
  #005, 38 MB / 72 files added; repo grew 62→100 MB. Acceptable for
  a one-off bespoke prototype.
- DA media migration would be the cleaner long-term path but requires
  upload tooling not currently in scope.

**Steps that worked for run #005.**
1. `cp -R <source-assets-dir> ./assets/`
2. Remove `.DS_Store`s and unreferenced files
3. Rename any directory with spaces in the name (AEM CLI 404s on
   URL-encoded `%20`)
4. `sed` pass to rewrite localhost URLs to root-relative `/assets/...`
   in template/fragments/CSS/DA-output files
5. For the DA doc specifically, also rewrite to ABSOLUTE branch URLs
   (Media Bus requires absolute)

## 2026-05-19 — AEM CLI dev server 404s on URL-encoded `%20` (spaces in paths)

**From run #005**. The source page's font directory was literally
`Adobe Clean Display` (with spaces). Browsers URL-encode to
`Adobe%20Clean%20Display`. The aem CLI's static-file middleware
returned 404 for the encoded form even though the file existed at
the decoded path on disk.

**Fix.** Rename directories to remove spaces before committing.
For run #005: `Adobe Clean Display` → `AdobeCleanDisplay`, and
update CSS `url(…)` refs to match.

**Generic rule.** Vendored asset directories should not contain
spaces. Replace with PascalCase (`AdobeCleanDisplay`) or kebab-case
(`adobe-clean-display`).

## 2026-05-19 — Locally-hosted source pages: production round-trip needs an asset story

**From run #005**. Source URL was `http://127.0.0.1:8080/…` —
reachable only from the dev machine. Initial conversion rewrote asset
paths to absolute localhost URLs, which works locally but breaks on
production (the public preview host can't reach private addresses).

**Three forward paths** when the source URL is local-only:

1. **Skip production round-trip.** Document the gap, complete local
   verification only. Lowest effort; least value.
2. **Vendor assets in the repo at `/assets/`.** Run #005 took this
   path successfully. Same paths work locally and on production via
   code-bus. Caveat: binary assets in git (38 MB / 72 files added in
   run #005). Acceptable for one-off bespoke prototypes. Methodology
   detail: DA cell image refs still need absolute URLs (see the
   Media Bus learning above).
3. **Asset migration to DA `/media/`.** Cleaner long-term. Would
   need a tool to walk asset references, upload via DA admin API to
   `/media/`, rewrite paths in DA cells. Currently out of scope.

**Don't default to path #1 without asking.** Skipping prod round-
trip on the agent's own initiative was a mistake on run #005 — the
user wanted to know how far the chain works. Path #2 turned out to
be ~30 minutes of mechanical work and gave a fully working production
deploy.
3. **User publishes the source publicly.** GitHub Pages, Netlify drop,
   even a `ngrok http 8080` for a one-off — anything that gives the
   production preview host a reachable URL.

For run #005 we chose path #1 (skipped production round-trip).
Methodology Round-trip section should document this branch.

## 2026-05-19 — Hero (or any logical section) may be a `<div>`, not `<section>` — rewrite to `<section>`

**From run #005**. Source's hero was `<div class="hero-scroll">…</div>`.
The overlay engine's `applySlotsToTemplate` does
`templateMain.querySelectorAll('section[class]')` — so a `<div>`-shaped
hero would never match a block name from the DA doc.

**Generic rule.** In the Generate phase, when a logical section in the
source uses any tag OTHER than `<section>` (most common: hero divs,
nav wrappers, footer-like callouts), rewrite the outermost element to
`<section class="originalClassListHere">`. Keep the inner DOM intact.
The CSS continues to work because the original classes carry through.

This complements the existing methodology rule about synthesizing
`<main>` when the source doesn't have one.

## 2026-05-19 — For scroll-animated pages, fullPage screenshots are misleading; capture per-section instead

**From run #005**. Source page uses `position: sticky` hero with
parallax + IntersectionObserver-driven `.anim-enter` fades. A
`fullPage: true` Playwright screenshot captures the page at its
top-of-scroll state — sticky positioning leaves visual gaps, and
`.anim-enter` elements stay at `opacity: 0` because they were never
scrolled into view to trigger their observers.

**What worked.** For each section, call
`element.scrollIntoView({ block: 'start' })` + a 400-800ms settle,
then take a viewport screenshot. Save under `diff/local-<section>.jpg`.

**Rule of thumb.** If the source page uses `position: sticky`,
`scroll-driven JS`, `IntersectionObserver`, or any of the well-known
scroll-animation patterns, default to per-section viewport screenshots
in the Round-trip phase. The methodology's "viewport screenshot" step
can stay; just don't trust a single `fullPage: true` capture.

---

## 2026-05-18 — Source HTML may not have a `<main>` wrapper

(from [003-patagonia-proposed-a](../projects/003-patagonia-proposed-a/))

Runs #001 and #002 both had `<main>…</main>` in their source HTML.
The overlay engine queries `doc.body.querySelector('main')` to extract
the template's main content — if the parser returns null, the
engine bails with `console.warn('[overlay] template "X" has no <main>')`.

Run #003's Patagonia source has **no `<main>` element**. Its
top-level sections are direct children of `<body>`, sandwiched
between `<header>` and `<footer>`. This is valid HTML5 and a
perfectly reasonable authoring choice.

**Generic rule:** the Generate phase must wrap the body-level
sections in a synthesized `<main>` when the source doesn't already
have one. The `<main>` is not authored content; it's a contract
boundary between the overlay engine and the template. Methodology
updated accordingly.

## 2026-05-18 — Sections can share a first-class — disambiguate via `data-section`

(from [003-patagonia-proposed-a](../projects/003-patagonia-proposed-a/))

The overlay engine matches DA block tables to template sections by
the template `<section>` element's first class
(`section.className.split(' ')[0]`). Run #003 input had three
collisions:
- Two `<section class="section" data-section="...">` blocks (activity-tile-grid, category-tile-grid)
- Two `<section class="sec-hero" data-section="...">` blocks (secondary-photo-hero, tertiary-photo-hero)
- One `<section class="section values" ...>` (sharing the `section` first-token with the first two)

If left as-is, all three "section" sections would collide on `section.section` selectors and the engine couldn't tell them apart. Same for both `sec-hero`s.

**Generic rule:** the Generate phase must ensure each
template `<section>`'s **first class** is unique within the
template. When the source's first class isn't unique, derive a
unique first-class from `data-section` (Stardust's stable
discriminator) and reorder so it's first in the class list. The
original classes stay in the list — CSS rules depending on them
still apply.

Example:
```diff
- <section class="section" data-section="activity-tile-grid">
+ <section class="activity-tile-grid section" data-section="activity-tile-grid">
```

Pattern observed across Stardust 0.2.0 outputs: when a generator
emits semantically distinct sections that happen to share a
utility class (`section`, `card`, `tile`, etc.), use the
`data-section` (or equivalent per-instance label) as the canonical
unique identifier. Methodology updated.

## 2026-05-19 — DA admin PUT replaces the entire doc — clobbers author edits

(from [004-heathrow-proposed-a](../projects/004-heathrow-proposed-a/),
when we deployed the photo-slot change)

The DA admin source API has no merge semantics. `PUT /source/<org>/<repo>/<path>.html`
**replaces the document wholesale**. If the user has made content
edits in the DA editor since the last upload, a PUT of our local
copy silently discards their edits.

This happened in run #004: the user had added a `WOW!` prefix to
the hero eyebrow as a content-change test. Later, when we uploaded
the locally-modified DA doc to add 6 photo-slot rows, the `WOW!`
edit was lost — our local doc didn't have it.

**Generic rule for any "edit local file → upload to DA" workflow:**
- Before PUTting, GET the current DA source and diff against your
  last-uploaded version to surface author edits.
- If there are edits, either merge them into the local copy or
  flag them to the user before proceeding.
- A naive PUT after a session of DA editing **will lose work**.

A safer pattern for incremental updates: fetch the DA source first,
modify in place (e.g., insert the new slot rows but keep author-
edited slot values), then PUT. The current
`experiments/knowledge/tools/transform-da-to-eds.mjs` is
unidirectional (file → file, no DA round-trip) — a future helper
could do the fetch-merge-PUT pattern for in-place additions.

## 2026-05-19 — Background-image slot writer (5th writeSlot case)

(from [004-heathrow-proposed-a](../projects/004-heathrow-proposed-a/),
follow-up: image authorability ask)

Static pages often use CSS-driven photos rather than `<img>` tags
— hero backdrops, tile/card "media" divs with
`style="background-image:url(…)"`. Run #003 (Patagonia) had 13
such photos; run #004 (Heathrow) had 6 pillar-card photos. None
were authorable through the existing image slot writer (which
only knows `<img>`/`<picture>`/`<a>`).

**Substrate addition** in `scripts/scripts.js writeSlot()`: when
the target element has a truthy `el.style.backgroundImage`, treat
it as a background-image slot. The DA cell carries an `<img>`;
the engine extracts the `src` and writes
`el.style.backgroundImage = \`url('\${src}')\``, preserving any other
inline styles. ~8 lines.

Template authoring: just add `data-slot` to the existing
background-image-bearing element. No DOM restructuring.

DA authoring: an `<img src="…" alt="…">` in the cell. Authors
get DA's standard image picker.

**Bonus** confirmed in run #004 production: the EDS pipeline's
Media Bus auto-rewrites `<img>` URLs in DA cells to optimised
references (e.g. `./media_<sha>.jpg?width=750&format=jpg&optimize=medium`).
The engine writes that URL into background-image — so the
overlay-rendered page gets responsive, optimised images even when
the source markup is CSS-driven.

Per the branching policy, this fix applies to trunk + run #004
only. Run #003's 13 background-image tiles stay frozen with the
gap; backportable on explicit request.

## 2026-05-19 — `<br>` is also stripped by the pipeline normaliser

(from [004-heathrow-proposed-a](../projects/004-heathrow-proposed-a/))

The preserve-list discoveries from run #002 (`<b>` stripped) and
run #003 (`<span class>` stripped, by extrapolation) now extend
to `<br>`. Run #004's source used `<p><strong>Title</strong><br>trailing
text</p>` in 4 phase descriptions. If we'd put the whole `<p>`
content into a DA cell with the `<br>`, the pipeline would have
emitted `Titletrailing text` on one line.

The subagent surfaced this and worked around by slotting only the
`<strong>` (as `phase-N.heading`) and leaving the trailing text as
static per-phase template defaults — preserving visual fidelity
at the cost of per-phase body authorability.

**Updated preserve list (empirical, 4 runs):**
`<strong>`, `<em>`, `<a>`, `<img>`, `<picture>`, `<h1>`-`<h6>`, `<p>`.
**Stripped:** `<b>`, `<i>`, `<u>`, `<mark>`, `<span class>`, **`<br>`**.

Methodology updated to add `<br>` explicitly to the strip list.
For content that needs a line break inside a slot value, the
Generate phase should restructure to two `<p>` tags (or two slots)
rather than one `<p>` with `<br>`.

## 2026-05-19 — When `data-section` is absent, derive first-class from a label or eyebrow

(from [004-heathrow-proposed-a](../projects/004-heathrow-proposed-a/))

Run #003 introduced the rule: when multiple sections share a
first class, promote `data-section`'s value to first class.
Heathrow has no `data-section` attributes — it's not a Stardust
output, it's hand-crafted (or a different generator).

Two `<section class="section">` blocks still needed
disambiguation. Solution: derive a slug from the section's
**visible label** (the `<p class="label">` or similar eyebrow
typically present at the top of every section in static-page
designs):
- `<p class="label label--accent">About this consultation</p>`
  → `about-consultation` becomes the first class
- `<p class="label label--accent">A phased expansion</p>`
  → `phased-expansion` becomes the first class

This generalises the methodology rule. The discriminator hierarchy
is now:
1. `data-section` attribute (Stardust convention).
2. `id` attribute on the section element (Heathrow's `cta-band` had
   `id="have-your-say"` but its first class was already unique).
3. **Slug from the most prominent eyebrow/label inside the
   section.**
4. Last resort: positional `section-N`.

Methodology updated.

## 2026-05-19 — Source pages with relative asset paths need URL rewriting

(from [004-heathrow-proposed-a](../projects/004-heathrow-proposed-a/))

Vanguard, Patagonia, Semrush all used **absolute CDN URLs** for
their images (`https://investor.vanguard.com/…`,
`https://cdn.shopify.com/…`). They worked unchanged in our
overlay because absolute URLs resolve identically from any host.

Heathrow's source uses **relative paths** (`assets/photos/hero-vision.jpg`,
`assets/logos/heathrow-white.png`). These resolve against the
serving host. On our overlay-served URL
(`localhost:3000/drafts/<page>.html` or
`<branch>--<repo>--<owner>.aem.page/<da-root>/<page>`), they
404 because the assets don't exist at the corresponding paths
on our host.

**Generic rule for the Generate phase:** scan the source for
relative asset references (matches like `="assets/`, `url('assets/`,
etc., or any non-`http(s)`/non-`data:` URL in src/href/url()
positions). Rewrite to absolute URLs pointing back to the source's
host — for Heathrow, the prefix is
`https://paolomoz.github.io/stardust-site/samples/heathrow/`.

For the substrate, this means asset migration is **explicitly
out of scope** — we link back to the source's CDN/host for
images, fonts, etc. If a future iteration wants self-hosted
assets, the DA `/media/<site-slug>/` pattern from the team docs
is the path. For now, "rewrite to source-absolute" keeps things
simple.

Run #004's 10 relative refs were rewritten in `output/templates`,
`output/fragments`, and `output/da/home.html` before deployment.
Methodology updated.

## 2026-05-18 — Boilerplate lifecycle CSS uses descendant selectors that catch fragment internals

(from [003-patagonia-proposed-a](../projects/003-patagonia-proposed-a/),
follow-up: header/footer visibility regression)

The boilerplate `styles/styles.css` ships a visibility-lifecycle
rule for the empty header/footer placeholders:

```css
/* before */
header .header,
footer .footer { visibility: hidden; }

header .header[data-block-status="loaded"],
footer .footer[data-block-status="loaded"] { visibility: visible; }
```

The intent: hide the EDS block wrapper (the `<div class="header block">`
that's the direct child of `<header>`) until JS decoration flips
`data-block-status` to `"loaded"`.

The bug: `header .header` is a DESCENDANT selector. It matches **any**
`.header` inside a `<header>`. If the fetched fragment contains its
own `<header class="header">` (which Patagonia's source did — same
class name), the descendant rule matches and hides it. The override
rule needs `data-block-status` on the matched element, which the
fragment-internal header doesn't have. → permanently hidden.

Vanguard (run #002) escaped this because its fragment-internal
header used `class="site-header"`. Semrush (run #001) used
`class="gnav"`. Only run #003 collided.

**Substrate fix** (in `styles/styles.css`): tighten to direct-child:

```css
/* after */
header > .header,
footer > .footer { visibility: hidden; }

header > .header[data-block-status="loaded"],
footer > .footer[data-block-status="loaded"] { visibility: visible; }
```

`header > .header` only matches the immediate `.header` child of
`<header>` — the EDS block wrapper. Fragment-internal `<header class="header">`
or `<footer class="footer">` are nested deeper and escape.

**Generic rule:** when adding cascading CSS to the boilerplate
substrate that targets standard HTML element classes (`.header`,
`.footer`, `.nav`, etc.), prefer direct-child selectors. Fragment
markup is opaque to the substrate; we don't know what class names
authors will use inside.

## 2026-05-18 — Boilerplate block CSS leaks into overlay-fetched fragments

(from [002-vanguard-proposed-a](../projects/002-vanguard-proposed-a/),
user spotted misaligned utility nav)

EDS auto-loads `/blocks/<blockname>/<blockname>.css` for every
decorated block. The aem-boilerplate's `blocks/header/header.css`
(272 lines!) and `blocks/footer/footer.css` define element-level
rules scoped to the BOILERPLATE's DA-authored nav markup:

```css
/* from boilerplate blocks/header/header.css */
header nav { display: grid; ... margin: auto; ... }
header .nav-wrapper { ... position: fixed; ... }
```

In our overlay model, `blocks/header/header.js` fetches a static
`/fragments/<template>/header.html` containing the source page's
real nav markup — `nav.utility`, `nav.gnav-links`, whatever. The
boilerplate's element-level selectors match our fragment's `<nav>`
elements too and cascade destructively:

- Run #002 Vanguard: `header nav { margin: auto }` competed with the
  template's `.utility { margin-left: auto }`, and `display: grid`
  killed the flex-row layout. Utility nav rendered mid-row instead
  of pinned right.
- Run #001 Semrush: the same boilerplate rules were affecting
  `<nav class="gnav-links">` — visually subtle enough we didn't
  notice, but it was there.

**Fix:** empty `blocks/header/header.css` and `blocks/footer/footer.css`
with a comment explaining why. Don't keep them as dead-but-loaded
files. For overlay-controlled pages, ALL header/footer styling
comes from `/styles/<template>.css` — the source's inline `<style>`
extracted faithfully.

**Generic rule:** when the overlay model takes over a block's
behaviour by replacing its JS (as we do for header/footer), the
matching boilerplate CSS becomes a hazard, not an asset. Empty it.
If another block ever gets the same treatment, do the same.

## 2026-05-18 — Template head-level `<link>` resources must be lifted into document.head

(from [002-vanguard-proposed-a](../projects/002-vanguard-proposed-a/),
follow-up: subtle styling difference user spotted)

Run #002 looked right at first glance but the user noticed subtle
typography drift. Root cause: the original `<head>` had three
`<link>` elements (Google Fonts preconnects + Mona Sans stylesheet)
that the mechanical CSS extraction missed — only the inline `<style>`
block was picked up. The CSS still named Mona Sans in font stacks,
so `font-family: ... "Mona Sans" ...` resolved against… nothing.
Browser fell back to system-ui, which is visually similar but
distinctly not Mona Sans.

**Substrate fix:** `scripts/scripts.js` `applyTemplateOverlay` now
lifts any top-level `<link>` elements from the template file into
`document.head` (deduping by href+rel). Templates self-describe their
head-level resource needs.

**Conversion-phase rule (in methodology now):** when extracting head
resources, capture all `<link>` elements — not just stylesheets,
also preconnects and any preload hints. Put them at the top of the
template file, above `<main>`. They get picked up automatically.

**Why this slipped the run #001 detection:** Semrush's source had
its fonts referenced from inline CSS (via `--heading-font-family:
'Adobe Clean Display' …` which is system-installed for most macOS
users running Adobe apps). Run #002 needed a Google Font that no
one has installed. Different surface for the same underlying gap.

## 2026-05-18 — `<b>` is stripped by the pipeline normaliser (use `<strong>`)

(from [002-vanguard-proposed-a](../projects/002-vanguard-proposed-a/))

The 2026-05-18 inline-stripping entry already covered `<span class="…">`.
Run #002 surfaced that `<b>` is also not on the preserve list — even
without a class. The Vanguard hero used `<b>0.25%</b>` and
`<b>$1.25M</b>` for typography accents; both survived as plain text
after the pipeline pass.

Pipeline preserve list (empirically): `<strong>`, `<em>`, `<a>`,
`<img>`, `<picture>`, `<h1>`-`<h6>`, `<p>`. Anything else gets
flattened to its text content.

**Generic rule:** in DA cell values, **only use `<strong>` and `<em>`**
for inline emphasis. Avoid `<b>`, `<i>`, `<u>`, `<mark>`, `<span class>`.
The methodology doc Generate section enforces this now.

## 2026-05-18 — Templates without an animation engine cost ~150 KB of wasted CDN load

(from [002-vanguard-proposed-a](../projects/002-vanguard-proposed-a/))

The original `delayed.js` always loaded GSAP + ScrollTrigger + Lenis
before checking whether the page's template actually had an animation
engine. For plain-HTML templates like `vanguard-home`, that's ~150 KB
of motion libs downloaded for nothing, plus a 404 on the missing
engine script.

Fix in `scripts/delayed.js`: HEAD-probe `/scripts/<template>-animations.js`
before loading CDN deps. If the probe 404s, skip everything silently.

Residual: the HEAD probe's own 404 still logs as a network error
in the browser console (cosmetic — page renders fine). A future
polish could use a `<meta name="has-animations">` flag in the DA
metadata block instead of file-presence probing. Not blocking.

## 2026-05-18 — The substrate works (run #002 needed no rule-restating)

(from [002-vanguard-proposed-a](../projects/002-vanguard-proposed-a/))

For run #002's Generate phase, the subagent prompt was just
"read methodology.md + learnings.md + this project's docs, then
produce template + DA doc per the rules in those docs." No re-inlining
of the run #001 lessons (div-shape DA, `<div class="metadata">` in
`<main>`, no inline classed spans, etc.).

The subagent applied all three rules correctly on first pass.
Verified by structural diff: 353/353 elements match input; 0 lint
warnings; production URL renders correctly on first preview.

This validates the "promote learnings to knowledge/, then a future
agent reads them and doesn't re-make the mistake" model. The
substrate IS a learning machine.

## 2026-05-18 — Generator placeholder conventions vary across versions

(from [002-vanguard-proposed-a](../projects/002-vanguard-proposed-a/))

| Generator | Placeholder marker |
|---|---|
| Stardust 0.3.0 (run #001) | `<element data-placeholder="true">` attr + nested `placeholder-eyebrow` / `placeholder-shape` spans |
| Stardust 0.2.0 (run #002) | `<span class="placeholder-tag">` inline marker inside the containing element |

The Generate phase needs to detect which convention is in the input
and tell the slot extractor what to skip. Both produce the same
"static template content, not a slot" outcome — but the marker
differs.

**Generic rule:** the Analyze phase should document the input's
placeholder convention in `notes.md`; the Generate subagent reads
that and applies the right skip pattern. Don't hardcode either
convention into methodology — sniff and pass.

## 2026-05-18 — EDS pipeline does not convert DA-source `<table>` → `<div class="blockname">`

(from [001-semrush-home-cinematic](../projects/001-semrush-home-cinematic/),
debugging the published `aem.page` render)

This contradicts my prior assumption. The team docs say "Blocks are
`<table>`s with a header row carrying the block name + options" —
that's the convention for **Word / Google Docs** source where the
ingest pipeline runs the table-to-block conversion. For
**DA-sourced** documents, the pipeline does NOT do that conversion.
What DA stores is what the renderer ships, modulo light markdown-ish
inner-content normalisation.

Observed behaviour when our DA source contained `<table>` blocks:
- `<th>BlockName</th>` row → dropped entirely (block name lost).
- `<td>cell content</td>` → flattened to bare `<p>cell content</p>`.
- The whole table → a single `<div>` wrapping a sequence of `<p>` tags.
- No `<div class="blockname">` wrapper at all.

**The canonical DA-source shape is divs-with-class, already in
post-pipeline form**, exactly like:
```html
<main>
  <div>
    <div class="hero">
      <div><div>slot-name</div><div>slot-value</div></div>
      ...
    </div>
  </div>
</main>
```
Anything calling itself a "DA-to-EDS converter" should emit this
shape directly, NOT the Word-Docs-style table convention.

(Confirmed by inspecting `/sf-semrush/home.html` in DA — the
canonical pattern uses divs-with-class as the source.)

**Action taken:** updated our DA doc to the div-shape (body fragment
of `drafts/home.html`, which already had that shape from
`transform-da-to-eds.mjs`). After re-upload + re-preview, the page
rendered correctly.

## 2026-05-18 — Metadata must be a `<div class="metadata">` block inside `<main>`, not a `<table>` in `<footer>`

(from [001-semrush-home-cinematic](../projects/001-semrush-home-cinematic/),
same debug session)

Team docs said "the footer typically holds a Metadata table that
the pipeline expands into `<meta>` tags." Empirically: our
`<footer><table>...</table></footer>` was **ignored** by the
pipeline. Zero `<meta>` tags in the rendered head other than the
EDS-injected viewport / twitter:* defaults.

What worked: a `<div class="metadata">` block inside `<main>` with
the same row shape as any other block:
```html
<main>
  <div>...content blocks...</div>
  <div>
    <div class="metadata">
      <div><div>template</div><div>home</div></div>
      <div><div>title</div><div>Page Title</div></div>
    </div>
  </div>
</main>
```
After re-upload + re-preview, `<meta name="template" content="home">`
and `<meta name="title" content="Page Title">` appeared in the
rendered head, and our overlay engine could resolve the template
name. Until that point, the engine kept bailing out (no template ⇒
falling through to standard EDS decoration ⇒ 40 × 404 trying to
load `/blocks/<name>/<name>.{css,js}` for every detected block).

Footer in DA source seems to be a vestigial slot; main-with-
metadata-block is the canonical way.

## 2026-05-18 — Pipeline normalises inline HTML inside cells; `<span class="accent">` is stripped

(from [001-semrush-home-cinematic](../projects/001-semrush-home-cinematic/))

Our title slot value was
`Be found <span class="accent">everywhere</span> search happens`.
The pipeline emitted just `Be found everywhere search happens` —
the span was removed.

It seems the pipeline runs a markdown-ish normaliser over inner
cell content that keeps `<strong>` / `<em>` / `<h1>`-`<h6>` /
`<a>` / `<img>` but discards arbitrary `<span class="...">`.

For typography accents the EDS-friendly path is `<strong>` (becomes
button primary in default decoration; needs class scoping if used
inside a heading) or a class on the parent element rather than an
inline span. Worth re-examining slot-value escaping rules in the
generator.

## 2026-05-18 — DA stores HTML literally; tables survive intact

(from [001-semrush-home-cinematic](../projects/001-semrush-home-cinematic/),
PUT to admin.da.live/source)

Two things I was uncertain about, now verified:

1. **`PUT https://admin.da.live/source/{org}/{repo}/{path}.html` with
   `multipart/form-data` (field `data`)** returns 200 + a JSON
   payload with the four canonical URLs (editUrl, contentUrl,
   previewUrl, liveUrl). The `Content-Type` for the field is sniffed
   from the data; passing `type=text/html` on the form part works.

2. **What you PUT is what DA stores.** I uploaded our table-format
   doc with `<table>` + `<th>` + `<tr><td>slot</td><td>value</td></tr>`
   rows. GET on the same URL returned the same shape, byte-for-byte.
   DA does not normalize tables → divs server-side. The
   table → div conversion happens only at pipeline render time
   (post-publish). The DA editor presents the table view of source
   for authoring.

This contradicts the assumption (which I held implicitly) that "DA's
editor canonicalizes everything to divs on save." If a doc has been
through DA's prose editor (open + edit + save), it can come back in
div-format with `<p>` wrappers around cell contents — but that's an
editor-roundtrip artifact, not DA's storage behavior. Direct PUT
preserves your source exactly.

## 2026-05-18 — Two competing block-content models in DA

(from [001-semrush-home-cinematic](../projects/001-semrush-home-cinematic/),
observing `/sf-semrush/home.html` in DA)

The same Semrush home page exists at `/sf-semrush/home.html` in this
DA repo from a prior conversion attempt using a **different model**.
Comparing the two approaches:

| Aspect | **Ours (slot-keyed)** | **Canon (positional)** |
|---|---|---|
| Row shape | `slot-name \| value` (2 cells) | `value` only (1 cell) |
| Block id | `<th>Hero</th>` header row | `<div class="hero">` class |
| Author UX | Sees slot names — clearer for partial edits | Sees just values — terser, EDS-native |
| Engine needs | Custom slot-resolution (our overlay) | Standard EDS block decorators |
| Add/remove rows | Slots keyed by name; safe to add | Position-coupled; reordering changes meaning |
| Schema clarity | Slot names self-document fields | Schema is implicit in block JS |

Both work in DA. Both produce valid post-pipeline EDS markup. The
choice has author-UX and engine-design implications:

- Slot-keyed is **friendlier for authors editing AI-generated
  content** because the slot names anchor what each cell is for
  ("title", "cta-primary", "card-3.tagline"). Authors don't need
  to remember "the 4th row is the CTA."
- Positional is **closer to native EDS conventions** and means a
  generic EDS deploy could render the page with stock block decorators
  if we ever ship one per template.

For run #001 we stuck with slot-keyed (locked in by the overlay
engine + template `[data-slot]` markers). Worth revisiting in a
future run by trying positional and comparing the editor UX
side-by-side.

## 2026-05-18 — DA upload knowledge promoted from team docs

User shared internal team documentation covering: admin.da.live
source/PUT/DELETE patterns, image storage (3 patterns — AEM Assets,
dot-folder, `/media`), image upload via multipart, `aem content`
git-style CLI, preview+publish API (separate step from push), media
format/size limits, document-shape body-fragment convention.

Promoted to `eds-da-mechanics.md` in full, replacing the previously
`[assumed]` Admin API section. Two specific gotchas worth flagging
across projects:

1. **`aem content push` ≠ published.** Drafts stage in DA's source
   endpoints. To make a page reachable at `aem.page`, you must
   `POST admin.hlx.page/preview/{owner}/{repo}/{branch}/{path}`.
   For `aem.live`, `POST admin.hlx.page/live/...`. Either step
   without the other looks like a successful push but produces a
   404 at the public URL.

2. **SVG cap is 40 KB.** Tight enough that complex illustrations
   often exceed it. AI generators that emit SVG-heavy hero or
   decoration markup may push us into rejection. Sniff SVG sizes
   during the analyze phase.

For image migration, prefer `/media/<site-slug>/<filename>` so
assets don't collide across projects. Same DA path → same Media
Bus content-addressed name across branches.

## 2026-05-14 — EDS dev server (`aem up`) serves drafts content verbatim

(from [001-semrush-home-cinematic](../projects/001-semrush-home-cinematic/))

`aem up --html-folder drafts` does **not** run the EDS pipeline on
files served from the drafts folder. The DA-format `<table>` blocks
stay as tables, the `<head>` is not injected from `head.html`,
metadata-table → `<meta>` conversion doesn't happen.

This is at odds with what the AGENTS.md doc implies ("Follow the
aem markup structure"). Drafts is for *raw post-pipeline content*,
not DA-shape content.

**Implication for the converter:** every project run needs a
DA-to-post-pipeline transformer step before drafts becomes usable
locally. We have one at
`experiments/knowledge/tools/transform-da-to-eds.mjs` (see that
file's directory README for usage).

**Open question for future:** does the production `.aem.page`
pipeline run on DA-uploaded content correctly? Almost certainly
yes — DA → pipeline is the normal flow. The local drafts shortcut
just bypasses it. Verify by uploading to DA in run #2.

## 2026-05-14 — Overlay engine must skip standard EDS decoration on main

(from [001-semrush-home-cinematic](../projects/001-semrush-home-cinematic/))

EDS's `decorateSections` queries `main > div`. Our template uses
`main > section.<blockname>` (and `main > div.<wrapper>` for
pin-spacer cases). Half of our template's main children are
`<section>` elements that EDS would ignore; the other half are
`<div>` wrappers that EDS would mistake for sections and re-wrap.

Either way, running standard EDS decoration on overlay-controlled
main produces broken DOM.

**Solution:** the overlay sets `main.dataset.overlay = templateName`.
`loadEager` skips `decorateMain` / `loadSection` when the marker is
present. `loadLazy` similarly skips `loadSections` on overlay main
(header/footer fragment loading is unchanged).

Verified by structural diff: 885 / 885 elements in identical order
between rendered and original main.

## 2026-05-14 — Body-hidden-until-`appear` gives a free no-flicker overlay window

(from [001-semrush-home-cinematic](../projects/001-semrush-home-cinematic/))

EDS's `styles/styles.css` has `body { display: none }` and
`body.appear { display: block }`. The `appear` class is added at
the end of `loadEager`. This is the EDS pattern for "no CLS, no
flash of unstyled content" — but it doubles as our overlay
window.

Sequence:
1. Page HTML arrives → body hidden by CSS.
2. `scripts.js` `loadEager` runs.
3. Overlay engine reads slots, fetches template, fills slots,
   replaces main innerHTML. (Body still hidden.)
4. `body.appear` added → body shown for the first time.

Result: user sees the overlay-merged DOM, never the intermediate
EDS-shape DOM. Zero flicker.

## 2026-05-14 — Inline HTML in slot values works via innerHTML

(from [001-semrush-home-cinematic](../projects/001-semrush-home-cinematic/))

Some slots contain inline HTML (`<span class="accent">everywhere</span>`
inside a hero title, `<a href>` content in CTAs). The writer
function in `applySlotsToTemplate` dispatches by tag:
- `IMG` → copy `src`, `alt`
- `PICTURE` → replace element with new picture
- `A` → copy `href`, set innerHTML to anchor's innerHTML
- default → set `innerHTML` (preserves inline HTML)

Using `innerHTML` for the default handler is the key. `textContent`
would emit `&lt;span class="accent"&gt;...` literally and break the
typography accent.

## 2026-05-14 — EDS `toClassName` makes block names case-tolerant

(from [001-semrush-home-cinematic](../projects/001-semrush-home-cinematic/))

`toClassName("Closing Cta")` → `closing-cta`. So is
`toClassName("Closing CTA")`. The block-table-to-class mapping
is normalized: only alphanumerics survive, hyphens between
words, all lowercase.

**Conversion implication:** we match block tables to template
sections by class slug (lowercased, hyphenated). Title-case of
the block-table label is human-readable cosmetic; whatever the
converter chooses is fine as long as the slug round-trips.

## 2026-05-14 — Generators emit "deliberate placeholder" UIs we must preserve

(from [001-semrush-home-cinematic](../projects/001-semrush-home-cinematic/))

Stardust marks not-yet-authored slots with
`<element data-placeholder="true">` containing a `placeholder-eyebrow`
span and a `placeholder-shape` span. The result is a visible "PLACEHOLDER
· image" UI that the designer intends to stay visible until real
content arrives.

These elements look like slots but **should not become slots**.
They're visible static template content with future intent. The
converter marks them `data-slot-skip="placeholder"` and leaves the
markup alone. The rendered DOM stays identical to the original;
authors get a clear flag that those positions are reserved.

Different generators will have different placeholder conventions
(or none). The rule generalises: **anything explicitly tagged as
placeholder/template-state in the source is not authorable
content — preserve as-is.**

## 2026-05-14 — Fragment load lifecycle: nested `<header>` is fine

(from [001-semrush-home-cinematic](../projects/001-semrush-home-cinematic/))

EDS adds `header-wrapper` / `footer-wrapper` classes and wraps the
header/footer block content. Our header fragment includes a
`<header class="gnav">` element — so the rendered DOM has
`<header class="header-wrapper"><div class="header block"><section class="announcement-banner">...</section><header class="gnav">...</header>...</div></header>`.

HTML5 allows nested `<header>` (the inner one is sectional content
inside an enclosing landmark). CSS class selectors target `.gnav`
directly so the nesting is invisible.

**Constraint surfaced:** if a future project's CSS uses
`body > header` or `body > .announcement-banner` (direct-child
selectors targeting the bare body), the EDS wrappers will break
those. Check generator CSS for direct-child selectors during
analyze phase.

## 2026-05-14 — Header is broader than `<header>`; footer broader than `<footer>`

(from [001-semrush-home-cinematic](../projects/001-semrush-home-cinematic/))

AI-generated pages often have global UI elements that don't sit
inside the `<header>` or `<footer>` semantic landmarks:
- Above main: announcement banners, mega-nav dropdown panels (siblings
  of `<header>` but functionally coupled)
- Below main: floating sticky CTAs, modal backdrops, modals

The fragment-extraction rule that works:
- Everything from `<body>` start to `<main>` start → header fragment
- Everything from `</main>` end to `<footer>` end → footer fragment
- Template = `<main>` content only

The fragment-load code injects fragments into EDS's `<header>` and
`<footer>` elements. CSS class selectors keep working.

## 2026-05-14 — Sequential CDN script chain is fragile

(from [001-semrush-home-cinematic](../projects/001-semrush-home-cinematic/))

`delayed.js` chained `gsap.min.js` → `ScrollTrigger.min.js` →
`lenis.min.js` using `.reduce(..., Promise.resolve())`. The
`.catch` on the chain meant any single CDN miss aborted the rest
*and* the engine script that depends on them.

In the first run, Lenis failed (or appeared to) and the engine
didn't load. GSAP and ScrollTrigger were both loaded by the time
the failure was detected (curious — probably the chained loader
fired onerror prematurely).

**Fix for run #2:** use `Promise.allSettled` so each CDN is loaded
independently. The engine script can defensively check for `gsap`,
`Lenis`, `ScrollTrigger` and degrade gracefully if any are missing.
The reduced-motion guards in `animations.js` already wrap each
timeline so missing libs shouldn't crash — they'll just no-op.
