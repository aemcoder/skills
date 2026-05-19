---
name: snowflake
description: Convert an AI-generated static HTML page (Stardust, Mobirise, Relume, Lovable, v0, Figma-derived hand-coded, etc.) into an Adobe Edge Delivery Services page that preserves the original DOM byte-for-byte while making the text and image content authorable in Document Authoring. Triggers on "convert this page to EDS", "static-to-EDS overlay", "next experimentation", "next run", "start run #N", or when a user provides a source URL and asks to make it editable in DA.
---

# Snowflake — Static-to-EDS Overlay Conversion

Convert a static HTML page into an EDS page using the **overlay
pattern**: the original DOM is preserved exactly, and only the text
and image content becomes authorable in Document Authoring. Header
and footer remain static repository fragments. The page CSS and any
animation JavaScript ship per-template under the EDS code bus.

## When to use this skill

The user has an AI-generated polished static HTML page and wants to
launch it on Edge Delivery Services without losing the original
design while still making content editable in DA.

Typical user phrasing:
- "Convert https://example.com/static-page to EDS"
- "Make this page editable in DA but keep the original markup"
- "Start the next experimentation for URL …"
- "Static-to-EDS overlay for …"

## What this skill does NOT do

- Does **not** rewrite the page into EDS-shape markup (blocks with
  `<div class="blockname">`). That's a different workflow
  (`migrate-page`). The overlay pattern is for keeping the original
  generator's DOM intact.
- Does **not** migrate the page assets into DA `/media/` (out of
  scope; the skill documents two acceptable alternatives — vendor in
  repo, or DA media migration done separately).
- Does **not** modify the EDS substrate code in the target repo
  (`scripts/scripts.js` overlay engine, lifecycle CSS, etc.) unless
  the conversion surfaces a substrate gap. Substrate evolution is a
  separate change with its own PR review.

## Prerequisites

Before invoking, confirm with the user:

1. **Source URL** — the static page to convert. Must be reachable
   from this machine (publicly hosted or local dev server).
2. **Target EDS repo** — owner/repo on GitHub. Must already have the
   overlay engine wired (see `knowledge/architecture.md` §"Solution
   shape"). For first-time setup, the substrate has to be in place;
   the skill assumes it.
3. **DA root path** — where in the DA tree the converted doc lands
   (e.g., `/<some-root>/<page-slug>`).
4. **DA admin token** — the skill reads from `.hlx/.da-token.json` in
   the target repo (or `~/.hlx/.da-token.json` as fallback). If
   missing, fail early with instructions to fetch one.

## How to invoke (host adapters)

**Slicc**: the cone receives a sprinkle event or chat trigger,
verifies prerequisites, then executes the phases sequentially as
described below. See `HOST-NOTES.md` for sprinkle wiring.

**Claude Code**: user types `/snowflake` or the agent
auto-invokes on description match. Either way, the agent walks
the phases sequentially.

**Generic shell / other hosts**: the assistant works through the
phases the same way — each phase is a discrete chunk of bash + Node
invocations described in the corresponding `phases/<N>-<phase>.md`
file.

Across hosts, the skill body and phase prompts never reference
host-specific primitives. The skill is sequential — no parallel
execution in this version.

## Bundle assets

The skill ships with:

```
SKILL.md                       ← this file (entry point)
phases/
  1-capture.md                 ← phase 1 prompt
  2-analyze.md                 ← phase 2 prompt
  3-generate.md                ← phase 3 prompt
  4-wire.md                    ← phase 4 prompt
  5-roundtrip.md               ← phase 5 prompt
  6-reflect.md                 ← phase 6 prompt
knowledge/
  methodology.md               ← canonical phase rules (read by every phase)
  architecture.md              ← overlay engine design + slot writer reference
  eds-da-mechanics.md          ← EDS pipeline and DA admin API reference
  learnings.md                 ← cross-project findings (5 runs distilled)
scripts/
  transform-da-to-eds.mjs      ← Node script: DA divs-with-class → drafts HTML
examples/
  README.md                    ← pointers to worked examples (closed iterations)
HOST-NOTES.md                  ← per-host adapter notes (not loaded by agent)
README.md                      ← human-readable docs (not loaded by agent)
```

### Resolving paths inside this bundle

When a phase prompt references `<SKILL_DIR>/knowledge/methodology.md`
or similar, the assistant resolves `<SKILL_DIR>` to the directory
containing this `SKILL.md` file. Conventions per host:

- **Slicc**: `<SKILL_DIR>` = `/workspace/skills/snowflake/`
- **Claude Code**: `<SKILL_DIR>` = `${CLAUDE_SKILL_DIR}`
- **Generic**: assistant computes the directory of `SKILL.md` and
  uses that.

Node scripts inside `scripts/` self-locate via `import.meta.url` and
don't need the env var.

## The six phases (sequential)

Each phase is described in its own file under `phases/`. The
assistant reads the phase prompt, executes its steps, writes any
state transitions, and proceeds to the next phase.

State for a single run lives in:
```
experiments/projects/<NNN>-<slug>/state.json
```
relative to the target repo's root (found via
`git rev-parse --show-toplevel`). The skill creates this on Capture
and updates it at each phase boundary. Phases check state.json on
start and skip work that's already done — reruns are safe.

### Phase summaries (full instructions in `phases/`)

1. **Capture** — fetch source HTML and referenced external assets;
   set up the project folder under `experiments/projects/NNN-<slug>/`.
   See `phases/1-capture.md`.

2. **Analyze** — structural map of the page; identify header/footer
   boundaries, section list, slot opportunities, head-level links to
   lift, asset rewriting strategy. Produce `notes.md` and
   `decisions.json` in the project folder. See `phases/2-analyze.md`.

3. **Generate** — produce the 5 deployable artifacts (template HTML,
   header fragment, footer fragment, page CSS, page animations JS)
   plus the DA-source body fragment. Outputs go to
   `experiments/projects/NNN-<slug>/output/`. See `phases/3-generate.md`.

4. **Wire** — copy artifacts to the EDS-served paths (`templates/`,
   `fragments/<tpl>/`, `styles/`, `scripts/`), build the local-test
   drafts file, run lint. See `phases/4-wire.md`.

5. **Round-trip** — local first (dev server + headless browser
   verification), then production (branch + push + DA PUT + preview
   API + verify on `<branch>--<repo>--<owner>.aem.page`). See
   `phases/5-roundtrip.md`.

6. **Reflect** — append run findings to project notes; promote
   cross-project learnings to `knowledge/learnings.md` (a PR to the
   skill repo, if the host supports raising one); update methodology
   if any new rule emerged. **Do not close the iteration — that's a
   user decision.** See `phases/6-reflect.md`.

## Closing an iteration

The skill **never closes a run on its own**. After phase 6, it
returns control to the user and waits for an explicit close request.
Closure means tagging `iter-NNN-close` on the run branch and fast-
forwarding the integration trunk. Closure is described in
`phases/6-reflect.md` but only runs when the user asks.

## Host-portable constraints (for skill maintainers)

Maintainers extending this skill should keep it host-agnostic. See
`HOST-NOTES.md` for the full list. Key points:

- Use only: `bash`, `node` (≥22), `git`, `curl`, `jq`, `npm`/`npx`,
  `playwright-cli`, POSIX `sed`/`grep`/`awk`.
- Banned: Slicc-specific (`sprinkle send`, `upskill`), Claude-Code-
  specific (`mcp__*`, named subagents in Agent tool), any GUI / MCP
  / daemon.
- Browser interaction: **`playwright-cli` only**. No host-bundled
  browser tools.
- State files: project-relative paths (under `experiments/projects/`),
  never `<SKILL_DIR>` or `/workspace`.
- Subagent fan-out: out of scope in this version. The skill is fully
  sequential.
- Idempotency: every phase checks state.json on start. Reruns are
  safe.

## Reading order for first invocation

1. This file (you're reading it).
2. `knowledge/methodology.md` (canonical phase rules — every phase
   needs this).
3. `knowledge/architecture.md` (overlay engine and slot writer
   semantics — Generate phase needs this most).
4. `knowledge/learnings.md` (cross-project findings — Generate and
   Round-trip should at least skim this; specific entries are
   referenced by individual phase prompts).
5. The phase prompt for the current phase.

Then start at Phase 1.
