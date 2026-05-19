# Worked examples

The five closed iterations from the upstream R&D project
(`aemcoder/snowflake`) serve as worked examples of the methodology.
Each one tags at `iter-NNN-close` on a branch named
`sf-overlay-exp-NNN`.

Browse them at:
- https://github.com/aemcoder/snowflake/tree/iter-001-close (Semrush home, Stardust cinematic)
- https://github.com/aemcoder/snowflake/tree/iter-002-close (Vanguard proposed-A, Stardust)
- https://github.com/aemcoder/snowflake/tree/iter-003-close (Patagonia proposed-A, Stardust)
- https://github.com/aemcoder/snowflake/tree/iter-004-close (Heathrow proposed-A, Stardust)
- https://github.com/aemcoder/snowflake/tree/iter-005-close (BizPro Hub prototype, hand-coded Figma)

Each iteration has, under `experiments/projects/NNN-<slug>/`:
- `README.md` — what shipped, source URL, status
- `notes.md` — full phase log
- `learnings.md` — project-specific + promoted findings
- `input/` — captured source HTML and external assets
- `output/` — generated artifacts (template, fragments, CSS,
  animations JS, DA doc)
- `diff/` — local + production screenshots

Run #005 also includes a
`timing-and-orchestration-report.md` with measured per-phase
durations, parallelization analysis, and per-phase model/effort
recommendations. Worth reading before raising a v2 PR to this skill.

## Run summary

| Run | Source                        | Notable | Substrate change |
|-----|-------------------------------|---------|------------------|
| 001 | Semrush home (Stardust)       | First end-to-end verification; 885/885 DOM elements identical | engine, slot writers IMG/PICTURE/A/text |
| 002 | Vanguard (Stardust)           | Inline `<style>` extraction + Google Fonts head links | head-link lifting |
| 003 | Patagonia (Stardust)          | 13 background-image tiles, header/footer collision | lifecycle CSS direct-child fix, animations HEAD-probe |
| 004 | Heathrow (Stardust)           | External CSS file, pillar-card photo authoring | background-image slot writer (5th case) |
| 005 | BizPro Hub (hand-coded Figma) | First non-Stardust source; 38 MB vendored assets; Media Bus URL rule | no engine change; methodology rules added |

Patterns to look at by example:

- **Background-image slots**: run #004 (Heathrow pillar cards) and
  run #005 (BizPro Hub story cards).
- **Vendored assets in repo**: run #005 (BizPro Hub).
- **Source has no `<header>` tag**: run #005 used
  `<div class="nav-wrap">`.
- **Hero is a `<div>`, not `<section>`**: run #005's `hero-scroll`.
- **Heavy inline animation JS + external lib loader**: run #005
  Lenis pattern.
- **Disambiguation when sections share a first class**: run #003.
- **First-class collisions in source markup**: run #003 (two
  `<section class="section">`).
