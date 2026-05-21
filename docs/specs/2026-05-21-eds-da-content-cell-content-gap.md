# Task: Add block-cell content normalization rules to `eds-da-content`

**Date:** 2026-05-21
**Skill to modify:** `skills/eds-da-content/`
**Status:** Ready to execute. Self-contained — next session needs no prior conversation context.

## Task in one sentence

Add a new section to `eds-da-content/references/html-content.md` documenting how the EDS post-pipeline normalizes inline content **inside block cells** — which inline tags survive and which get stripped — because cell-content normalization is stricter than default-content normalization and the current skill conflates the two.

## Context — what to know before editing

### The gap

The `eds-da-content` skill currently has §6 "Default content" listing allowed elements for content *outside* blocks: `<h1>`–`<h6>`, `<p>`, `<ul>`, `<ol>`, `<li>`, `<a>`, `<img>`, `<strong>`, `<em>`, `<code>`, `<sub>`, `<sup>`, `<u>`, `<s>`, `<br>`.

That list is correct for default content. But **inside block cells**, the EDS pipeline runs a stricter inline normalization that strips additional tags. A `<br>` that survives in a default-content paragraph gets stripped when the same `<br>` lives inside a block cell. A `<span class="accent">` outside a block is fine; inside a cell it's flattened to bare text.

This matters because programmatic generators (Snowflake, helix-importer-ui, anything that writes block cells from extracted source HTML) need to know what survives the cell-normalization pass. Generating a cell value that contains stripped tags produces silent content corruption: the DA source has the tags, the rendered page doesn't, and there is no error anywhere.

### Source material

All findings below come from the Snowflake skill's accumulated `learnings.md`. The relevant entries:

- `skills/snowflake/knowledge/learnings.md` lines 154-253 — 2026-05-20 entry "EDS pipeline strips `<span class="...">` from DA cell content"
- `skills/snowflake/knowledge/learnings.md` lines 770-783 — 2026-05-19 entry "`<br>` is stripped by the pipeline normaliser"
- `skills/snowflake/knowledge/learnings.md` lines 929-941 — 2026-05-18 entry "`<b>` is stripped by the pipeline normaliser (use `<strong>`)"
- `skills/snowflake/knowledge/learnings.md` lines 1054-1068 — 2026-05-18 entry "Pipeline normalises inline HTML inside cells; `<span class="accent">` is stripped"

Read all four before drafting the new section — they contain example HTML and observed pipeline output that should anchor the documentation.

### Why this is universal, not Snowflake-specific

The pipeline normalization runs server-side on every DA document during preview/publish. It's not coupled to Snowflake's overlay engine — any consumer of the DA Source API that generates block cells with extracted inline content (Word imports, helix-importer-ui, hand-authored programmatic generators) will hit the same stripping behavior. This belongs in the shared reference skill, not in any one consumer.

## The change — high-level shape

Add a new subsection to `references/html-content.md §3` (the "Blocks" section) titled "Cell content normalization." Position: after §3.8 "Forbidden patterns" and before §4 "Section Metadata block." Number it §3.9.

The subsection documents:

1. **What it is** — the EDS pipeline runs an inline-content normalization pass on block cell content during preview/publish, distinct from the default-content rules in §6.
2. **The empirical preserve list** — tags that survive normalization unchanged.
3. **The empirical strip list** — tags that get flattened to their text content (or dropped entirely, in the case of `<br>`).
4. **Practical implications** — what to do when source HTML contains stripped tags (CSS-only fixes, semantic-element swaps, structural restructuring for `<br>` → two `<p>`s).
5. **Detection** — how a generator can scan output before upload to catch stripped tags pre-flight.
6. **Open questions** — tags whose behavior hasn't been verified yet (see "Verification gaps" below).

## Drafted content for the new §3.9 (use as starting point)

```markdown
### 3.9 Cell content normalization

The EDS preview/publish pipeline runs an **inline-content normalization
pass** on block cell content. The normalization is stricter than the
default-content rules in §6: tags that survive in a paragraph outside a
block get stripped when the same tag lives inside a block cell.

This is the most common silent failure when generating block content
programmatically from extracted source HTML: the cell values in the
uploaded DA document look correct, but the rendered page on `aem.page`
silently loses formatting.

#### Preserve list (verified)

These inline tags survive normalization inside block cells unchanged:

| Tag | Semantic role |
|---|---|
| `<strong>` | Bold emphasis |
| `<em>` | Italic emphasis |
| `<a href="…">` | Link |
| `<img src="…" alt="…">` | Image |
| `<picture>` | Responsive image (with nested `<source>` and `<img>`) |
| `<h1>` – `<h6>` | Headings |
| `<p>` | Paragraph |
| `<del>` | Strikethrough (semantic deletion) |
| `<ins>` | Insertion |
| `<mark>` | Highlight |
| `<code>` | Inline code |
| `<kbd>` | Keyboard input |
| `<sub>` | Subscript |
| `<sup>` | Superscript |

`[verified]` empirically across multiple programmatic upload runs.

#### Strip list (verified)

These tags are stripped during normalization. Their text content
survives as bare text in the parent element; the tag wrapper disappears:

| Tag | Observed behavior |
|---|---|
| `<b>` | Flattened to text. Use `<strong>` instead. `[verified]` |
| `<i>` | Flattened to text. Use `<em>` instead. `[assumed]` from `<b>` parallel — verify if relied on. |
| `<u>` | Flattened to text. No semantic replacement; restructure or use CSS. `[assumed]` |
| `<s>` | Flattened to text. Use `<del>` for semantic strikethrough. `[assumed]` |
| `<span class="…">` | Span removed; text content survives. Class is lost so any CSS targeting the class no longer matches. `[verified]` |
| `<span>` (no class) | Likely same as classed span. `[assumed]` |
| `<br>` | Dropped entirely. Adjacent text concatenates with no separator. `[verified]` |

#### Practical guidance

When source HTML contains a stripped tag inside content destined for a
block cell, pick the smallest-change fix:

1. **CSS-only fix using structural selectors.** When the stripped tag was
   a styling hook (typically `<span class="…">`), rewrite the page CSS to
   target structure instead of class. `:has()`, sibling combinators, and
   `:nth-child()` cover most cases. Example for a price pattern:

   ```html
   <!-- Source: span class used for styling -->
   <p class="price">
     <del>CHF 20.90</del>
     <span class="price-now">CHF 14.63</span>
   </p>
   ```

   ```css
   /* Was: .price-now { color: orange; } — but span gets stripped */
   /* Now: target the position structurally */
   .price:has(del) { color: orange; }
   .price del { color: grey; }
   ```

2. **Semantic-element swap.** If the stripped tag was bold/italic visual
   styling (`<b>`, `<i>`), swap to the semantic equivalent (`<strong>`,
   `<em>`) which is preserved. Update page CSS to target the element
   instead of the class.

3. **`<br>` → restructure to two `<p>` tags or two slots.** A line break
   inside a cell value drops entirely on the rendered page. If the line
   break carries meaning, split the content:

   ```html
   <!-- Stripped: -->
   <p><strong>Title</strong><br>trailing text</p>
   <!-- Renders as: <p>Titletrailing text</p> (no break, no space) -->

   <!-- Restructured: -->
   <p><strong>Title</strong></p>
   <p>trailing text</p>
   ```

#### Why this happens

The preview pipeline converts the DA-stored HTML into a markdown-ish
intermediate representation as part of producing `*.plain.html` and the
final delivered page. Tags without semantic meaning to the markdown
schema (presentational `<b>` / `<i>` / `<u>` / `<s>`, classless or
classed `<span>`, line-break `<br>`) don't survive the round-trip
because markdown has no representation for them inside flow content.
Tags with semantic meaning (`<strong>`, `<em>`, `<del>`, `<ins>`,
`<mark>`, `<code>`, `<kbd>`, `<sub>`, `<sup>`, anchors, images,
headings) round-trip through markdown intact. `[assumed]` — the
pipeline's exact behavior isn't publicly documented; the preserve/strip
lists above are empirical observations.

#### Detection

When generating block content programmatically, scan the output before
upload to catch stripped tags:

```bash
# Flag any cell content that contains tags from the strip list
grep -nE '<(b|i|u|s|br|mark|span)[ >]' path/to/da-output.html
```

(Note: `<mark>` is in the preserve list above but the regex flags it for
manual review — `<mark>` inside a block cell IS preserved, but inside
some pipeline configurations may behave differently; treat as
warning-level.)

For more rigorous detection, a Node script can parse the DA HTML, walk
into every block cell (depth-3 `<div>` inside any `<div class="…">`),
and check for tag-set violations.

#### Relationship to §6 (default content)

§6 lists allowed elements for content *outside* blocks. The cell
normalization rules here are *stricter*: every tag in §3.9's preserve
list is in §6's allowed list, but §6 includes tags (`<ul>`, `<ol>`,
`<li>`, `<br>`, `<u>`, `<s>`) that get stripped inside cells.

**Rule of thumb:** if a tag is in this section's preserve list, it works
both inside cells and as default content. If it's only in §6, it works
as default content but not inside cells. When generating block-heavy
content programmatically, restrict yourself to this section's preserve
list everywhere — that always works.
```

## Verification gaps the implementer should flag

The Snowflake learnings contain some inconsistencies that the new section should NOT paper over. Specifically:

1. **`<mark>` behavior.** The 2026-05-20 entry (line 165) explicitly lists `<mark>` as surviving. The 2026-05-19 `<br>` entry (line 779) lists `<mark>` as stripped. Both are empirical but contradictory. Likely explanation: behavior was investigated in different contexts at different times. The draft above resolves this by listing `<mark>` as preserved (newer finding) but flagging it as warning-level in the detection regex. Document this open question with a TODO in the new section, or — better — run a verification test against the empirical-confirmation pattern documented in `DA-BLOCK-FORMAT.md` lines 312-339, to pin the actual behavior.

2. **`<i>`, `<u>`, `<s>` behavior.** Only `<b>` is verified stripped (line 929). The others are listed in Snowflake's strip list (line 779) but never empirically demonstrated. Mark them `[assumed]` in the new section, parallel to `<b>`.

3. **`<span>` without class.** The 2026-05-18 entry on `<span class="accent">` confirms classed spans are stripped. Whether a bare `<span>` (no attributes) behaves identically is `[assumed]`. Worth a verification test if anyone relies on it.

4. **`<ul>`, `<ol>`, `<li>` inside cells.** §6 allows lists in default content. Whether the pipeline preserves them inside block cells is not addressed by any Snowflake learning. Worth a verification test — lists in cells are common (FAQ blocks, feature lists).

A short empirical-verification protocol the implementer can run:

```bash
# 1. Create a test DA doc with each questionable tag inside a block cell
# 2. PUT to admin.da.live/source/<org>/<repo>/<test-path>.html
# 3. POST preview to admin.hlx.page/preview/<org>/<repo>/main/<test-path>
# 4. Fetch the rendered .plain.html
# 5. Inspect what survived
```

Use the same `aemcoder/snowflake-demos` test space referenced in
`/Users/catalan/repos/ai/da/DA-BLOCK-FORMAT.md` line 312.

## File-by-file edits required

### `skills/eds-da-content/references/html-content.md`

- **Add §3.9** as drafted above, positioned between §3.8 (Forbidden patterns) and §4 (Section Metadata block).
- **Add a cross-reference in §6** (Default content) at the end of the "Allowed elements" subsection: *"For block cell content, a stricter normalization applies — see §3.9."*

### `skills/eds-da-content/SKILL.md`

- **Update "The 10 silent-failure rules" list.** Either add an 11th rule about cell content normalization, OR fold it into an existing rule. Suggested 11th rule:

  > **11. Block cell content uses a stricter inline tag list than default content.** Inside block cells, `<b>` / `<i>` / `<u>` / `<s>` / `<span>` / `<br>` are stripped silently — text survives, formatting disappears. Use `<strong>`, `<em>`, `<del>`, `<mark>`, or restructure. → [html-content.md §3.9](./references/html-content.md)

  If you prefer to keep the list at 10, fold this finding into rule 2 ("Block class encodes block identity…") as a trailing note. The 11-rule path is cleaner.

- **Update the SKILL.md frontmatter `description`** if the cell-normalization concern isn't already implied by "block HTML format" wording. Current description covers "block HTML format (canonical `<div class="…">` form and accepted `<table>` alternate)" — consider adding "block cell content normalization rules" to make trigger matching more reliable for this concern.

### `skills/eds-da-content/tile.json`

If the tile description mirrors the SKILL.md frontmatter, update consistently.

## Acceptance criteria

After the edits, a consumer reading the skill should be able to:

- [ ] Find a dedicated section about block-cell inline normalization (distinct from default content).
- [ ] See an explicit preserve list and strip list, each tagged `[verified]` or `[assumed]` per the underlying confidence.
- [ ] Find the three practical fixes (CSS-only, semantic swap, `<br>` restructuring) with worked examples.
- [ ] See the relationship to §6 (default content) clearly stated — narrower-than rule.
- [ ] See an open-questions list (or TODO markers) for the inconsistencies in `<mark>` behavior and the unverified `[assumed]` items.

Negative checks:

- [ ] §6 (default content) is NOT modified to be stricter — it remains correct for default content. Only the new §3.9 introduces the stricter cell rules.
- [ ] No claim is added without a `[verified]` or `[assumed]` tag.
- [ ] The new rule 11 (if added) maintains the format of rules 1-10 in SKILL.md.

## Out of scope

- **Do not** import Snowflake-specific concerns (e.g., the `<span data-slot>` counter-pattern at `learnings.md:235-240` — that's overlay-engine-specific, not pipeline-wide). The new section is about the pipeline, not about any consumer.
- **Do not** modify `skills/snowflake/`. After this task lands, Snowflake's `methodology.md` rule 3 will be replaceable with a citation — but that's a separate cleanup task.
- **Do not** restructure §3 numbering — append §3.9 only.

## Notes for the implementer

- The Snowflake learnings file is `skills/snowflake/knowledge/learnings.md`. Read the four cited entries before drafting — their wording and worked examples are higher-quality than what's drafted here, and the cross-references between them give context (e.g., the price-styling worked example).
- If you run the empirical verification protocol to resolve the `<mark>` / `<i>` / `<u>` / `<s>` / lists ambiguities, update the `[assumed]` tags to `[verified]` with a date and a one-line note on the test (path + branch + observed output). The skill convention rewards verification — flip every `[assumed]` you can.
- After landing this, the Snowflake cleanup spec at `docs/specs/2026-05-21-eds-da-content-divs-as-canonical.md` can proceed without changes — the cell-content gap will be closed.
