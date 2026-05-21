# Task: Make `<div>` blocks the canonical form in `eds-da-content`

**Date:** 2026-05-21
**Skill to modify:** `skills/eds-da-content/`
**Status:** Ready to execute. Self-contained — next session needs no prior conversation context.

## Task in one sentence

Update the `eds-da-content` reference skill so that **`<div class="…">` block markup is documented as the canonical, recommended form for programmatic DA HTML authoring**, while keeping `<table>` documented as an accepted (but legacy/import-flow) alternative.

## Context — what to know before editing

### The skill being modified

`skills/eds-da-content/` is a reference skill (not a workflow). It tells consumers (other skills, agents) what the rules are for generating DA-compatible HTML, uploading binaries, and hitting the DA Admin API. Bundle layout:

```
skills/eds-da-content/
├── SKILL.md                       ← entry point; lists 10 silent-failure rules
├── tile.json
└── references/
    ├── html-content.md            ← HTML generation rules (block format lives here)
    ├── media.md                   ← binary upload rules
    └── platform.md                ← DA Source API + Admin API
```

Every factual claim in the skill is tagged `[verified]` (read from code or observed empirically) or `[assumed]` (inferred from docs). Preserve that convention in all edits.

### What's wrong today

The skill currently documents `<table>` as **the** block format. Specifically, `references/html-content.md §3` titled "Block tables" presents tables as the only authoring shape, with the rendered `<div class="…">` form shown as a post-decoration output.

This is incomplete, not wrong. Both forms are fully supported as DA source. The canonical storage form — what the editor saves, what storage returns on GET, what the Universal Editor adapter reads — is the `<div class="…">` form. Tables are normalized to divs by the Helix preview pipeline (the `md2da` step) on the way to render.

For programmatic authoring (the primary audience of this skill), the `<div>` form is recommended because:

1. **Round-trip identity with storage.** Generating divs means the read shape (when fetching existing DA content) matches the write shape. No re-conversion needed.
2. **Matches the rendered DOM.** What you author IS what `*.aem.page` serves (minus pipeline-injected wrappers like `data-block-name`).
3. **Skips one pipeline step.** No `md2da` normalization to fail silently.

Tables remain a valid input — required if you're piping from Word/Google-docs imports, helix-importer-ui, or any markdown→HTML chain that emits tables. Don't remove them; demote them.

## Source of truth

The authoritative investigation is at `/Users/catalan/repos/ai/da/DA-BLOCK-FORMAT.md` (in a sibling repo). It traced both forms through:

- `adobe/da-admin` — storage service. Accepts anything; stores raw bytes; no transformation. Verified at `src/storage/object/put.js:33-58` and `src/helpers/source.js:62-71`.
- `adobe/da-nx` — bulk importer and Helix-mirror converters. `convertBlocks()` in `nx/utils/converters.js:33-60` normalizes `<table>` → `<div class="…">`. The bulk importer (`nx/blocks/importer/importer.js:301-305`) generates tables then converts to divs before upload.
- `adobe/da-live` — editor. Opens divs via `aem2doc` (`deps/da-parser/dist/index.js` function `me`, helper `H`), saves them back as divs via `prose2aem.js:26-58` `convertBlocks()` and `tableToBlock`/`doc2aem`. Internally ProseMirror represents blocks as table nodes; on save they always serialize back to divs.
- `adobe/da-universal` — `src/utils/hast.js:36-103` reads div-form blocks directly (post-Helix-normalization).

Empirical confirmation (from that doc, line 312-339): direct POST of `<table>`-form source to `admin.da.live/source/...`, followed by preview, produced byte-identical rendered block markup to a `<div>`-form upload.

Notable side finding (line 341-342, line 361-363): the `aem content` CLI applies pre-upload normalization that strips EDS-specific decorations (e.g., `<span class="icon icon-X">`). Direct `curl -F` PUT to `admin.da.live/source/...` preserves bytes. If a doc cites the CLI as the recommended upload path, flag this gotcha.

**Before starting edits**, read `/Users/catalan/repos/ai/da/DA-BLOCK-FORMAT.md` in full. It's ~380 lines and provides the precise wording, file:line citations, and conversion-flow diagram you'll need to write authoritative copy.

## The change — high-level shape

The intended end state in `eds-da-content`:

1. **`references/html-content.md §3` is renamed/restructured** to lead with the `<div class="…">` form as canonical. Tables are documented in a clearly-marked subsection as an accepted alternative used by import flows.
2. **All examples that author block content** (§3 itself, plus §4 Section Metadata block and §5 Page Metadata block) lead with the div form. Table form is shown alongside only where useful for contrast.
3. **`SKILL.md`'s "10 silent-failure rules" list** is updated so block-format rules (currently rules 2-3) are reframed around divs. Table-specific failure modes (merged first cell, etc.) move under the table subsection in §3 since they're alternate-format-specific.
4. **The conversion model is added** — a short section in `html-content.md` (likely near the top of §3) explaining the three-layer model from DA-BLOCK-FORMAT.md (storage → preview pipeline → editor) so consumers understand why both forms work and why divs are recommended.
5. **A "which form should I generate?" decision callout** lives in §3, mirroring DA-BLOCK-FORMAT.md's "Practical guidance" section (lines 343-363 there).
6. **The `aem content` CLI normalization gotcha** is added to `references/platform.md §7` (the CLI section currently treats the CLI uncritically).

## File-by-file edits required

### `skills/eds-da-content/references/html-content.md`

#### §3 — full rewrite of "Block tables"

Current state: §3 is titled "Block tables" and frames `<table>` as the block format. Subsections cover: block name normalization (keyed off table header cell text), block name constraints, block variants/options (parenthetical syntax in the header), DOM output after decoration (showing table → decorated div), forbidden patterns (table-specific: merged cell, nested tables, missing tbody, stray text nodes), max cells per row.

Intended state:

- **Rename §3 to "Blocks"** (drop "tables" from the heading).
- **Open with the `<div class="…">` form as the canonical example.** First code block in the section should be a div-form block, not a table.
- **Add the conversion model paragraph** (3 layers: storage, preview pipeline, editor) up front, with file:line citations to da-admin, da-nx, and da-live source from DA-BLOCK-FORMAT.md.
- **Block name encoding** moves from "header cell text" to "first className token; subsequent tokens are variants." The `toBlockCSSClassNames` algorithm is identical (lowercase, hyphenate non-alphanumeric, collapse runs), but the input is now className tokens rather than parenthetical header text.
- **Block variants / options** table needs both forms shown:
  - Div form: `class="columns features 3-col"` → classes `columns`, `features`, `3-col`
  - Table form (for reference): header text `"Columns (features, 3-col)"` → same classes after normalization
- **DOM output "after decoration"** — for div-form input, the only delivery-time changes are the wrapper div (`<div class="columns-wrapper">`), the added `block` class, `data-block-name` and `data-block-status` attributes. Show this clearly. Decoration is not a format conversion for div-form input.
- **Forbidden patterns** — split into two:
  - **Div-form patterns to avoid:** block-name class missing or non-first; nested block divs (no block-in-block); deviations from the depth-2-row, depth-3-cell convention.
  - **Table-form patterns to avoid** (preserved as a subsection under the table form): merged first cell required; empty header cell; nested tables; missing tbody; stray text nodes.
- **Max cells per row** — reframe as "max children per row div" for the div form. Same limit (4).
- **Add the "which form to generate" guidance** based on DA-BLOCK-FORMAT.md lines 343-363:
  > Use the `<div class="…">` form when generating HTML programmatically or by hand. It matches what the editor saves and what storage returns, so the round-trip is identity. Use `<table>` only when piping content from Word/Google-doc imports, helix-importer-ui, or markdown→HTML chains that emit tables natively — the Helix preview pipeline normalizes them on the way to render.

#### §4 — Section Metadata block

Current example uses `<table>`. Add div-form example as the primary, keep table form as alternate. Example div form:

```html
<div class="section-metadata">
  <div><div>Style</div><div>dark, center</div></div>
  <div><div>Background</div><div>https://content.da.live/{org}/{repo}/media/bg.jpg</div></div>
</div>
```

Note: section metadata block name is `section-metadata` (kebab) when authored as a div. Verify against `da-nx/nx/utils/converters.js`'s `toBlockCSSClassNames`.

#### §5 — Page Metadata block

Current example uses `<table>`. Add div-form example as primary. Example:

```html
<div class="metadata">
  <div><div>title</div><div>My Page Title</div></div>
  <div><div>description</div><div>Page summary</div></div>
  <div><div>image</div><div><img src="https://content.da.live/{org}/{repo}/media/og.png"></div></div>
  <div><div>template</div><div>article</div></div>
</div>
```

The rule "Block header must be exactly `Metadata` (case-insensitive)" becomes "Block class must be exactly `metadata`" for div form. Misspelled className → not recognized as page metadata block → no `<meta>` tags emitted.

#### Cross-cutting

Any other code example in `html-content.md` that uses `<table>` for a block (search for `<table>` in the file) should be migrated to the div form or shown in both forms. Pure-content tables (data tables that aren't blocks) are unaffected — block tables specifically are the target.

### `skills/eds-da-content/SKILL.md`

#### "The 10 silent-failure rules" list

Current rule 2: "Block tables need a merged first cell. First row must be a single `<td>` containing the block name. Multi-cell first rows or empty first cells render as plain HTML tables (no JS, no CSS)."

This rule is table-format-specific. Reframe rule 2 around the canonical div form, and demote the table-specific failure mode to a subsection in §3:

> **2. Block class encodes the block identity.** For the canonical div form, the outermost `<div>` carries `class="<block-name> [<variant>…]"`. The first class token is the block name and resolves to `/blocks/<name>/<name>.{js,css}`. For the table form, the first row must be a single merged `<td>` containing the block name. Misshapen blocks render as plain HTML without block JS or CSS.

Current rule 3: "Block names use alphanumeric + single hyphens only. No underscores, no double dashes, no digit-first names. Variants in parentheses: `Block (option-a, option-b)`."

Update to be format-agnostic. The parenthetical syntax is table-form-only; for divs, variants are additional class tokens:

> **3. Block names use alphanumeric + single hyphens only.** No underscores, no double dashes, no digit-first names. Variants in div form: additional class tokens after the name (`class="hero cta center"`). Variants in table form: parentheses after the name (`Hero (cta, center)`). Both normalize identically.

Current rule 4 (Page Metadata): "Page Metadata block header is exactly `Metadata` (case-insensitive)." Update to mention className for div form.

The "Minimal upload example" section in SKILL.md uses a hypothetical `page.html`. No change required there — it's about the upload mechanics, not the content shape. But verify the section linked from rule 2 (currently `→ html-content.md §3`) still points to the right place after §3 is restructured.

### `skills/eds-da-content/references/platform.md`

#### §7 — `aem content` CLI section

Current section documents the CLI git-style workflow neutrally. Add a note about pre-upload normalization stripping EDS decorations (per DA-BLOCK-FORMAT.md line 361-363):

> **Note: the CLI applies pre-upload normalization** that strips EDS-specific decorations (e.g. `<span class="icon icon-X">` icon markers). For byte-faithful upload of pre-shaped EDS HTML, POST directly to `admin.da.live/source/…` with `Content-Type: text/html` rather than going through the CLI. The CLI is fine for prose-heavy content where decorations are absent.

The existing "Known limitation: binaries" warning stays.

### `skills/eds-da-content/references/media.md`

Skim for any block-format references. Likely unaffected, since this file is about binaries. If `<img>` examples are shown inside block tables anywhere, update to div form for consistency.

## Source citations to add

When updating §3, cite verifiable sources inline (the skill convention is to tag claims `[verified]` from code-read and `[assumed]` from docs-read). Use these:

| Claim | Cite |
|---|---|
| da-admin stores raw bytes without transformation | `da-admin/src/storage/object/put.js:33-58`, `src/helpers/source.js:62-71` |
| Helix preview pipeline normalizes table→div via md2da | `da-nx/nx/utils/converters.js:33-60` `convertBlocks()` |
| `mdToDocDom + docDomToAemHtml` mirrors Helix md2da | `da-nx/test/utils/converters/converters.test.js:145-160` (comment names the upstream contract) |
| Bulk importer generates tables then converts to divs before upload | `da-nx/nx/blocks/importer/importer.js:301-305` |
| DA editor saves blocks as divs | `da-live/blocks/shared/prose2aem.js:26-58` `convertBlocks()` |
| Universal Editor reads div-form blocks | `da-universal/src/utils/hast.js:36-103` `readBlockConfig` |
| Empirical round-trip test | `DA-BLOCK-FORMAT.md` lines 312-339 (`https://da.live/#/aemcoder/snowflake-demos` against `catalan-tests/table-block-raw`) |

All of these are `[verified]` — they were read from source.

## Suggested approach

1. Read `/Users/catalan/repos/ai/da/DA-BLOCK-FORMAT.md` end-to-end first. It's the source you'll be paraphrasing into the skill. Note in particular the conversion-flow diagram (lines 23-56), the `toBlockCSSClassNames` algorithm (lines 290-308), and the "Practical guidance" section (lines 343-363).
2. Read the three eds-da-content reference files end-to-end (`SKILL.md`, `references/html-content.md`, `references/media.md`, `references/platform.md`) to internalize the skill's voice and `[verified]/[assumed]` tagging convention.
3. Apply the edits in this order:
   a. `html-content.md §3` (the biggest change — write it fresh, then diff against current)
   b. `html-content.md §4` and `§5` (smaller — just add div-form examples)
   c. `SKILL.md` 10-rules list (small — three rule rewrites)
   d. `platform.md §7` (one paragraph addition)
4. Verify nothing in `media.md` references block tables in a now-stale way.
5. Re-read `SKILL.md`'s table of contents (the table at the top mapping "Doing X" → "Read Y") and confirm the description still fits after restructuring §3.

## Acceptance criteria

A consumer agent reading the skill end-to-end after the edits should:

- [ ] Generate `<div class="…">` blocks by default for any new HTML it produces.
- [ ] Be able to identify a `<table>`-form block in input HTML (e.g. from a Word import) and either upload it as-is (knowing the pipeline normalizes it) or convert it to div form using the documented `toBlockCSSClassNames` algorithm.
- [ ] Know that page metadata is authored as `<div class="metadata">` (canonical) or `<table>` with `Metadata` header (alternate), with the former preferred.
- [ ] See file:line citations on every claim about pipeline behavior, with `[verified]`/`[assumed]` tags.
- [ ] Find the `aem content` CLI's normalization gotcha documented in `platform.md §7`.

Negative checks:

- [ ] No remaining text in `html-content.md` or `SKILL.md` implies tables are the only block format.
- [ ] No example in §3, §4, §5 leads with `<table>` (table examples appear after div examples or in clearly-labeled "alternate form" subsections).
- [ ] Every claim borrowed from DA-BLOCK-FORMAT.md has a `[verified]` tag and a file:line citation.

## Out of scope

- **Do not** modify `skills/snowflake/`. Snowflake's choice to emit divs is already correct; its rationale gets rewritten in a separate cleanup task. This task is purely about `eds-da-content`.
- **Do not** delete the `<table>` documentation. It remains valid input — Word imports, helix-importer-ui, and markdown→HTML pipelines all emit tables. Demote, don't remove.
- **Do not** restructure the bundle layout (file count, file names) — only content within existing files.
- **Do not** change the `[verified]`/`[assumed]` tagging convention.

## Notes for the implementer

- The `description` field in `SKILL.md`'s frontmatter currently says "block table HTML format" — update to "block HTML format (div and table forms)" or similar so trigger matching still works for both terms.
- DA-BLOCK-FORMAT.md lives in a sibling repo at `/Users/catalan/repos/ai/da/DA-BLOCK-FORMAT.md`. Consider whether to copy a stripped-down version into the skill bundle (e.g. as `references/block-format-investigation.md`) so the skill is self-contained for consumers without access to that repo. If you do, link to it from `html-content.md §3` as the authoritative deep-dive.
- After the edits, run a quick consistency pass: search the skill for the word `table` and confirm every remaining mention is correctly framed (data tables, table-form blocks as alternate, or genuinely about HTML `<table>` elements).
