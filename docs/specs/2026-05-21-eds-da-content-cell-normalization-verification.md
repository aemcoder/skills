# Verification: cell content normalization in EDS pipeline

**Date:** 2026-05-21
**Test space:** `aemcoder/snowflake-demos` branch `main`
**Protocol:** PUT to DA Source API (multipart, field `data`) → POST preview → GET `.plain.html`
**Test docs:**
- `https://main--snowflake-demos--aemcoder.aem.page/verification/2026-05-21-cell-normalization.plain.html`
- `https://main--snowflake-demos--aemcoder.aem.page/verification/2026-05-21-inline-tags.plain.html`
- `https://main--snowflake-demos--aemcoder.aem.page/verification/2026-05-21-br-probes.plain.html`

## Scope

This run was scoped to resolve two open questions in `docs/specs/2026-05-21-eds-da-content-cell-content-gap.md`:

1. `<mark>` — contradictory empirical findings (one entry "preserved", another "stripped").
2. `<ul>` / `<ol>` / `<li>` inside block cells — not addressed by any prior learning.

The same protocol cheaply covered remaining `[assumed]` items, so the run was extended to cover `<b>`, `<i>`, `<u>`, `<s>`, `<span>` (classed + bare), `<br>`, `<ins>`, `<kbd>`, plus controls (`<strong>`, `<del>`, `<code>`, `<sub>`, `<sup>`).

## Headline finding

The original spec's two-bucket model (PRESERVE vs. STRIP) is incomplete. **The pipeline runs three distinct operations on inline tags inside block cells:**

1. **PRESERVE** — tag and content pass through unchanged.
2. **REWRITE** — tag is replaced with a semantic equivalent; content survives wrapped in the new tag.
3. **STRIP** — tag wrapper is removed; text content survives unwrapped.

This resolves the `<mark>` contradiction: both prior entries were partly right. `<mark>` is rewritten to `<em>` — the tag changes (a "strip" of `<mark>` from one viewpoint), but the content is wrapped in another semantic tag (a "preservation" of formatting from another).

## Results — verification 1 (mark + lists)

Input → output pairs from `.plain.html`:

| Row | Input | Output | Verdict |
|---|---|---|---|
| 1 | `<mark>highlight</mark>` | `<em>highlight</em>` | REWRITE mark → em |
| 2 | `<p>before <mark>highlight</mark> after</p>` | `before <em>highlight</em> after` (p unwrapped — cell IS the paragraph context) | REWRITE mark → em |
| 3 | `<mark><a href="…">linked highlight</a></mark>` | `<em><a href="…">linked highlight</a></em>` | REWRITE; inner `<a>` preserved |
| 4 (control) | `<strong>bold control</strong>` | `<strong>bold control</strong>` | PRESERVE |
| 5 | `<ul><li>Alpha</li><li>Beta</li><li>Gamma</li></ul>` | identical | PRESERVE |
| 6 | `<ol><li>One</li><li>Two</li></ol>` | identical | PRESERVE |
| 7 | `<ul><li>Top<ul><li>Sub A</li><li>Sub B</li></ul></li></ul>` | `<ul><li><p>Top</p><ul><li>Sub A</li><li>Sub B</li></ul></li></ul>` | PRESERVE with markdown-roundtrip quirk: inline text of a parent `<li>` with a nested list becomes wrapped in `<p>` |
| 8 | `<p>Intro paragraph</p><ul><li>Item X</li></ul>` | identical | PRESERVE; mixed list + p in same cell works |
| 9 | `<ul><li><strong>Bold</strong> item</li><li><a>Link</a> item</li></ul>` | identical | PRESERVE; inline formatting inside `<li>` works |

## Results — verification 2 (inline tags)

| Row | Input | Output | Verdict |
|---|---|---|---|
| 1 | `<b>bold-b</b>` | `<strong>bold-b</strong>` | REWRITE b → strong |
| 2 | `<i>italic-i</i>` | `<em>italic-i</em>` | REWRITE i → em |
| 3 | `<u>underline-u</u>` | `<u>underline-u</u>` | PRESERVE (surprise — spec assumed strip) |
| 4 | `<s>strike-s</s>` | `<del>strike-s</del>` | REWRITE s → del |
| 5 | `<span class="accent">classed-span</span>` | `classed-span` | STRIP |
| 6 | `<span>bare-span</span>` | `bare-span` | STRIP |
| 7 | `<p>before<br>after</p>` | `before<br>after` (p unwrapped, br **survives**) | PRESERVE — overturns 2026-05-19 learning |
| 8 | `<del>deletion</del>` | `<del>deletion</del>` | PRESERVE |
| 9 | `<ins>insertion</ins>` | `insertion` | STRIP (overturns spec draft which had ins as preserved) |
| 10 | `<code>inline-code</code>` | `<code>inline-code</code>` | PRESERVE |
| 11 | `<kbd>Ctrl+C</kbd>` | `<code>Ctrl+C</code>` | REWRITE kbd → code (overturns spec draft which had kbd as preserved) |
| 12 | `x<sub>i</sub> y<sup>2</sup>` | identical | PRESERVE |

## Consolidated empirical tables for §3.9

### PRESERVE list (verified 2026-05-21)

| Tag | Notes |
|---|---|
| `<strong>` | |
| `<em>` | |
| `<a href="…">` | |
| `<img>` / `<picture>` | (not retested in this run — assumed unchanged from prior `[verified]`) |
| `<h1>` – `<h6>` | (block headings not in scope of this run) |
| `<p>` | Cell-level `<p>` is unwrapped when cell content is a single inline-only paragraph (rows 2 and 7) — but `<p>` survives when there are multiple block-level children in the same cell (row 8). |
| `<ul>`, `<ol>`, `<li>` | Including nested lists and lists mixed with `<p>`. |
| `<del>` | |
| `<u>` | |
| `<code>` | |
| `<sub>`, `<sup>` | |
| `<br>` | Preserved when surrounded by flow text (inside or outside `<p>`, inside `<li>`). Position-dependent — see "br rules" below. |

### REWRITE list (verified 2026-05-21) — new category

The pipeline normalizes presentational and near-semantic tags to canonical semantic equivalents. Content survives, tag changes.

| Input tag | Rewritten to | Note |
|---|---|---|
| `<b>` | `<strong>` | |
| `<i>` | `<em>` | |
| `<s>` | `<del>` | |
| `<mark>` | `<em>` | Markdown has no native highlight; pipeline falls back to italic. **If you want highlight styling, you need a CSS-only structural approach — there's no inline tag that survives as `<mark>`.** |
| `<kbd>` | `<code>` | |

### STRIP list (verified 2026-05-21)

| Tag | Note |
|---|---|
| `<span class="…">` | Class lost. CSS targeting the class will not match. |
| `<span>` (no class) | |
| `<ins>` | No semantic alternative survives. If insertion semantics matter, use a different markup pattern. |

## Implications for §3.9 draft

The original draft needs structural changes, not just data updates:

1. **Add a third category section: "Rewrite list."** The mark→em, b→strong, i→em, s→del, kbd→code rewrites all share a single mechanism (markdown-roundtrip canonicalization) and should be documented together with the explanation.

2. **Move `<mark>` out of the preserve list.** It's REWRITE → `<em>`, not PRESERVE. The "warning-level in detection regex" caveat in the original draft was the contradiction surfacing — now resolvable: `<mark>` should be in the detection regex (it disappears) but with the explanation "becomes `<em>`", not "stripped".

3. **Move `<ins>` out of the preserve list.** Verified STRIP. The draft listed it as preserved without verification.

4. **Move `<kbd>` out of the preserve list.** Verified REWRITE → `<code>`.

5. **Move `<u>` out of the strip list and add to preserve list.** Verified PRESERVE. The draft had it as `[assumed]` strip — that assumption was wrong.

6. **Update `<br>` finding — position-dependent rules now nailed down.** The 2026-05-19 learning saying "stripped" is overturned for its own example pattern (`<strong>Title</strong><br>trailing text` survives intact today). The actual rules are below in the "br rules" section.

7. **Add the lists-fully-preserved finding prominently.** Many programmatic generators will assume the spec's pre-verification conservatism applied — that lists in cells were risky. Verified safe. Including nested lists. The only surprise is that nested-list parent `<li>` text gets wrapped in `<p>` (a markdown-roundtrip artifact, not a content loss).

8. **Add the `<p>`-unwrapping behavior to the cell-mechanics explainer.** When a cell contains only a single `<p>` of inline content, the `<p>` wrapper is dropped in the rendered output because the cell `<div>` IS the paragraph-equivalent context. Generators that depend on the `<p>` wrapper being present should know this. Mixed cell content (multiple block-level children) keeps the `<p>` intact.

## br rules (verified 2026-05-21)

Probe input → output pairs, all from cell content directly:

| Input | Output | Verdict |
|---|---|---|
| `before<br>after` | `before<br>after` | PRESERVE — br between flow text |
| `<p>before<br>after</p>` | `before<br>after` | PRESERVE (p unwrapped) |
| `<strong>Title</strong><br>trailing text` | identical | PRESERVE — overturns 2026-05-19 learning |
| `<p><strong>Title</strong><br>trailing text</p>` | `<strong>Title</strong><br>trailing text` | PRESERVE (p unwrapped); overturns 2026-05-19 learning |
| `<p>first</p><br><p>second</p>` | `<p>first</p><p>second</p>` | STRIP — br between block siblings |
| `<br>` (alone in cell) | `` (empty div) | STRIP — lonely br |
| `text<br>` | `text` | STRIP — trailing br |
| `<br>text` | `<br>text` | PRESERVE — leading br (asymmetric with trailing) |
| `a<br><br>b` | `a<br><br>b` | PRESERVE — consecutive brs between flow text |
| `<li>first line<br>second line</li>` | identical | PRESERVE — br inside li |

**Rule of thumb:** `<br>` survives when there's flow content on **at least the side after it** (it must "break to" something). The pipeline strips `<br>` when:
- It's alone in a cell
- It trails text with nothing after
- It sits between block-level siblings (the block boundary already separates them)

The 2026-05-19 learning's claim that `<strong>Title</strong><br>trailing text` is stripped does not reproduce today. Either pipeline behavior changed since then, or the original test context was different (perhaps trailing-br case). The strip cases here are precise and likely match what was actually observed.

**Implication for the original spec's `<br>` → restructure-to-two-`<p>` guidance:** still good advice for **block-boundary** semantic breaks (the strip case), but `<br>` is no longer a hard "don't use this" — line breaks inside a paragraph with text on both sides work fine.

## Open questions still outstanding

1. **`<p>`-unwrapping rules.** Single-inline-content `<p>` gets unwrapped at cell top level (multiple test rows confirm). Whether the same unwrap happens deeper (e.g. `<div><p>x</p></div>` inside a cell) is unverified. Probably yes — the pipeline appears to apply a consistent "inline-only flow contexts don't need a `<p>` wrapper" rule.

2. **`<picture>` and `<img>` inside cells.** Not tested in this run. Prior learnings suggest preserved, but worth a one-shot confirmation given how many other "preserved" assumptions turned out wrong.

3. **Behavior on aem.live (published) vs. aem.page (preview).** All tests here used aem.page. Whether the published pipeline applies the same normalization is unverified — though aem.page is canonical for content preview, so any difference would be a publishing-step bug.

## Method footprint

Test artifacts left in `aemcoder/snowflake-demos`:
- `/verification/2026-05-21-cell-normalization.html`
- `/verification/2026-05-21-inline-tags.html`
- `/verification/2026-05-21-br-probes.html`

These are durable and re-runnable. Suggested follow-up: leave them in place as canonical empirical fixtures the skill can cite. If the pipeline behavior ever changes, re-running the same docs will surface the diff.

Scripts used: `/tmp/verify-cell-norm/run-verification.mjs`, `/tmp/verify-cell-norm/run-inline.mjs`, `/tmp/verify-cell-norm/run-br.mjs`. They use the multipart-with-field-`data` upload pattern from `eds-da-content/references/platform.md §2`. The protocol is now proven for future verification cycles.
