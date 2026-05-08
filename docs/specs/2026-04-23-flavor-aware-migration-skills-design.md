# Flavor-Aware Migration Skills Design

Make the three migration skills (`migrate-page`, `migrate-block`,
`migrate-header`) work across multiple EDS boilerplate flavors by extracting
flavor-specific rules into peer reference files per skill. The cone detects
the flavor once in Phase 1 and the reference is loaded on demand by the
cone and each scoop.

## Context

The migration skills currently target the standard EDS boilerplate
(`scripts/aem.js`). Assumptions are written in generic-sounding prose but
are aem.js-specific: `body.appear` gating, `data-block-status="loaded"`
polling, plain `<p><a>` button decoration, `--body-font-family` CSS var,
`<meta name="footer">` for fragment loading.

A migration session against astrazeneca.com — built on the Author Kit
boilerplate (`aemsites/author-kit`, entry script `scripts/ak.js`) — surfaced
roughly 13 divergences from the aem.js assumptions. See
`/Users/catalan/Downloads/author-kit-findings.md` for the full list.

The three divergence categories are:

- **Parameters** — different variable names, class names, file paths
  (e.g., `--font-family` vs `--body-font-family`).
- **Behaviors** — framework entry (`body.session` vs `body.appear`),
  preview-load verification, footer fragment placement.
- **Idioms** — composition via `section-metadata` + card variants vs
  bespoke nth-child CSS; `<strong>`/`<em>` button wrapping.

Rather than branch on flavor inside each SKILL.md, we extract the
flavor-specific content into peer reference files and keep the SKILL.md
prose flavor-agnostic.

## Design

### File layout

Each skill grows a `references/` folder with one peer doc per flavor:

```
migration/
  migrate-page/
    SKILL.md
    migrate-config.json
    scripts/
    references/
      aem-js.md
      author-kit.md
  migrate-block/
    SKILL.md
    references/
      aem-js.md
      author-kit.md
  migrate-header/
    SKILL.md
    references/
      aem-js.md
      author-kit.md
  dismiss-overlays/   (unchanged)
```

### Detection

A new step at the start of Phase 1 in `migrate-page/SKILL.md`, immediately
after cloning the repo:

```bash
if [ -f /shared/{repo}/scripts/ak.js ]; then flavor=author-kit
elif [ -f /shared/{repo}/scripts/aem.js ]; then flavor=aem-js
else flavor=unknown
fi
echo "{\"flavor\":\"$flavor\"}" > /shared/{repo}/.migration/flavor.json
```

If `flavor=unknown`, the cone sends an error sprinkle and halts. No silent
fallback to aem-js — surfacing the gap is more useful than producing a
broken migration.

### Reference file structure

Each `references/{flavor}.md` uses a fixed heading layout so the SKILL.md
prose can reference sections without knowing which flavor is active.

**`migrate-page/references/{flavor}.md`:**
- Brand and styles (Phase 2.5)
- Preview HTML meta tags
- Preview load-wait verification (Phase 4.4)
- Known quirks

**`migrate-block/references/{flavor}.md`:**
- Framework entry
- Preview verification (Step 6c)
- Button decoration
- Full-width blocks
- Card block contract
- Footer meta tag
- Known quirks

**`migrate-header/references/{flavor}.md`:**
- Framework entry
- Header load timing
- Header block conventions
- Preview verification (Step 6c)
- aria-expanded desktop behavior
- Known quirks

Each heading corresponds to a step or subject area where flavors diverge.
The skill prose says *"see 'Preview verification (Step 6c)' in
`references/{flavor}.md`"* instead of inlining aem.js-specific selectors.

### Extraction boundaries

The table below lists what moves out of each SKILL.md into the flavor
references, and what stays in SKILL.md.

#### `migrate-page/SKILL.md` (cone work)

| Moves to flavor reference | Stays in SKILL.md |
|---|---|
| Phase 2.5c brand.css variable names; AK's `--font-family` override in `:root` | Phase and step ordering; cone orchestration |
| Phase 2.5d styles.css `@import` line placement and button reset rules | Font cascade logic (cascade letters a–e) |
| Phase 4.4 preview HTML `<meta name="nav|header|footer">` rules | Decomposition rules (visual tree, fragments, classification) |
| Phase 4.4 load-wait eval (`data-block-status="loaded"` vs `body.session` + timeout) | Sprinkle handling, progress reporting |
| Footer fragment placement (AK copies `footer.plain.html` to `/fragments/nav/footer`) | Report collection, final summary, commit step |

#### `migrate-block/SKILL.md` (scoop work)

| Moves to flavor reference | Stays in SKILL.md |
|---|---|
| Step 6c framework verification eval (`hlx`, `bodyAppear` vs `bodySession`) | Draft-first workflow |
| Entire "Known EDS Behaviors" section | Content extraction from source |
| Card block contract (AK requires `<picture>` in `<p>`) | Image download pattern (`fs.fetchToFile`) |
| "Footer Block — Special Case" subsection | `.plain.html` format and structure rules |
| `<strong>`/`<em>` button wrapping rules (AK) | CSS/JS file patterns, scoping, visual iteration protocol |
| | Report schema, completion message |

#### `migrate-header/SKILL.md` (scoop work)

| Moves to flavor reference | Stays in SKILL.md |
|---|---|
| Step 6c header verification eval | Single-row vs multi-section detection |
| Header load timing (postlcp.js for AK vs eager for aem.js) | nav.plain.html format (both structures) |
| Index-based vs section-metadata header.js contract | Mega menu transformation |
| AK's `<meta name="header">` fallback behavior | Header CSS specificity rule (`.header.block`) |
| | Visual iteration protocol, report schema |

#### Prose pattern after extraction

Before:

> Run this eval to verify EDS loaded:
> `JSON.stringify({ hlx: !!window.hlx, bodyAppear: document.body.classList.contains('appear'), blocks: [...] })`.
> Required: `hlx: true`, `bodyAppear: true`, block status `loaded`.

After:

> Run the verification eval from 'Preview verification (Step 6c)' in
> `references/{flavor}.md`. The reference specifies the exact fields to
> check and acceptable values for this flavor.

### Scoop prompt injection

`generate-scoop-prompts.js` reads `.migration/flavor.json` from the
migration directory it already receives as its first argument and appends
a `## Flavor Context` block to every generated prompt:

```
## Flavor Context
This project uses the {flavor} EDS boilerplate. After reading the skill,
ALSO read /workspace/skills/migrate-block/references/{flavor}.md (or
migrate-header/references/{flavor}.md if you are the header scoop). It
overrides the skill's defaults — most notably framework entry, preview
verification, button decoration, and footer/card contracts.
```

The existing `buildBlockPrompt`, `buildHeaderPrompt`, and
`buildFooterPrompt` functions each receive the flavor string from the
caller and append the context block to their output.

### Unknown flavor handling

If Phase 1 detection finds neither `aem.js` nor `ak.js`:

1. Cone sends
   `sprinkle send migrate-page '{"phase":"error","message":"Unknown EDS flavor — scripts/aem.js and scripts/ak.js both missing. Add references/{name}.md across the three skills and re-run."}'`
2. Cone halts. No Phase 1 continuation.
3. The user adds a new flavor by creating three reference files (one per
   skill), committing, and re-running.

## Testing strategy

- **Regression** — pick one aem.js project previously migrated
  successfully. Re-run after the refactor. Final preview-assembled
  screenshots should be visually equivalent.
- **AK smoke test** — run on astrazeneca.com against a fresh
  `aemsites/author-kit` clone. Verify: `flavor.json` contains
  `author-kit`; `--font-family` overridden in `styles.css`; no
  `<meta name="footer">` in preview HTML; `footer.plain.html` copied to
  `/fragments/nav/footer`; preview-load wait uses `body.session` + timeout.
- **Detection test** — minimal repos containing only `scripts/ak.js` or
  only `scripts/aem.js`. Run the detection bash step in isolation; assert
  `flavor.json` content.

## What does NOT change

- Sprinkle UI, config format, progress reporting contract
- Cone/scoop parallelism model
- Visual tree extraction, decomposition, or screenshot pipeline
- Report schema, completion message format
- `dismiss-overlays` skill

## Adding a new flavor later

To support a third flavor (e.g., `bespoke-boilerplate`):

1. Add `migration/{skill}/references/bespoke-boilerplate.md` for all three
   skills, using the fixed heading layout.
2. Update the Phase 1 detection bash step with a new branch that matches
   the new boilerplate's entry script.
3. Run the regression + smoke tests for the new flavor.

No SKILL.md prose changes required.
