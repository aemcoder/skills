# Migration Skills Hardening — Retrospective #1 Fixes (Design)

Date: 2026-07-24
Branch: `fix-skills-liftoff-retrospective-01`
Source: PLG labs retrospective for the wknd-adventures.com/basecamp.html
migration (`RETROSPECTIVE.md`, session 2026-07-23).

## Goal

Convert each in-scope struggle from the retrospective into either an
enforced skill step or an executable check, in the migration skills of
this repo. No new frameworks, no speculative machinery.

Retrospective items in scope: **2.2** (viewport / empty visual tree),
**2.3** (scripts not node-runnable), **2.6a partial** (root-relative
image paths awareness), **2.8** (text-bearing SVG logo rasterized),
**2.9** (`naturalWidth` false negatives for SVGs).

Out of scope (handed off — see Appendix A): 2.1, 2.5, 2.10 (liftoff-demo
skill, separate session), 2.4, 2.11 (Slicc runtime / labs config).

## Runtime contract (verified 2026-07-24)

Slicc's `node` now bridges standard Node FS APIs: `require('fs')`,
`require('node:fs')`, and `require('fs/promises')` all return one bridge
object with coherent sync + async methods, flushed to VFS after the
script exits. The PLG labs environment runs real node. **Therefore:
skill scripts intended for `node <file.js>` must use standard Node FS
APIs (CommonJS `require`), and must NOT use Slicc VFS globals
(`fs.readDir`, global `fs`) or top-level `await` in CJS files.**

---

## Workstream 1 — migrate-page Phase 1: viewport mandate + tree guard

Fixes 2.2. Files: `skills/migration/migrate-page/SKILL.md`,
`skills/migration/migrate-page/scripts/visual-tree.js`.

**Root cause detail (include as rationale in the skill text):**
`visual-tree.js` only descends into elements ≥900px wide
(`var minWidth = 900` at ~line 624). `playwright-cli tab-new` opens at a
default viewport of ~780px, so nothing qualifies and the tree degenerates
to a single `<body>` node. Every Phase 1 artifact captured at that width
is unusable.

### 1a. Fold viewport setup into Step 1.2

Amend `### Step 1.2: Navigate to Source Page` (SKILL.md ~line 105) —
rename it `Navigate to Source Page and Set Desktop Viewport`. After the
existing `tab-new` command + targetId capture, append:

```bash
playwright-cli resize --tab={sourceTabId} 1440 900
```

with prose: this step is **MANDATORY before any extraction step**. The
default tab viewport is ~780px; the visual-tree extractor ignores
elements narrower than 900px, so extraction at the default width
produces an unusable 1-node tree and a mobile-width screenshot.

> Implementer note: verify the exact `resize` syntax with
> `playwright-cli resize --help` (positional `1440 900` vs
> `--width/--height`) and use whatever the CLI actually accepts. The
> retrospective session used `resize 1440 900` successfully.

Do NOT renumber the other steps — fold the resize into Step 1.2 so
cross-references to Steps 1.3–1.10 stay valid.

### 1b. `visual-tree.js` self-reports viewport and node count

In the final return object of `visual-tree.js` (currently
`{ tree, text, nodeMap }`, end of file), add:

- `viewport: { width: window.innerWidth, height: window.innerHeight }`
- `nodeCount: Object.keys(nodeMap).length`

### 1c. Hard guard after Step 1.6

After the Step 1.6 command block, add a **guard subsection**:

- Check the extracted file, e.g.:

  ```bash
  grep -o '"nodeCount":[0-9]*' /shared/{repo-name}/.migration/visual-tree.json
  grep -o '"viewport":{[^}]*}' /shared/{repo-name}/.migration/visual-tree.json
  ```

- **If `nodeCount` < 5, or `viewport.width` < 1024: HARD ERROR.** Do not
  proceed. Re-run the resize from Step 1.2, then re-run Steps 1.4–1.6
  (lazy-load, de-sticky, tree). Never continue to Phase 2 with a
  degenerate tree — decomposition is impossible from it.

Acceptance:

- Step 1.2 contains the resize command and rationale.
- `visual-tree.js` output contains `viewport` and `nodeCount`.
- The guard names concrete thresholds (nodeCount ≥ 5, width ≥ 1024) and
  says "hard error / do not proceed".

---

## Workstream 2 — Make shipped scripts plain-node

Fixes 2.3. Files:
`skills/migration/migrate-page/scripts/block-inventory.js`,
`skills/migration/migrate-page/scripts/generate-scoop-prompts.js`.

Both scripts already have CLI entry blocks but call the legacy VFS API
(global `fs`, `fs.readDir`, `fs.readFile(path, {encoding})`) and
`block-inventory.js` uses top-level `await` in a CJS file. Under real
node this fails with `ReferenceError: fs is not defined` /
top-level-await syntax errors.

### 2a. `block-inventory.js` rewrite

- `const fsp = require('node:fs/promises');` at top. No VFS globals.
- Replace `fs.readDir` with `fsp.readdir(dir, { withFileTypes: true })`;
  directory test via `entry.isDirectory()`.
- Replace whole-file reads for sizes with `(await fsp.stat(p)).size` —
  cheaper and standard. Keep output shape:
  `{ name, hasJs, hasCss, jsSize, cssSize }` (sizes `undefined`/absent
  when the file is missing).
- Wrap the CLI in `async function main()` + `main().catch(...)` — no
  top-level `await`.
- CLI contract (unchanged from docs): `node block-inventory.js
  <project-path>` scans `<project-path>/blocks/`, writes
  `<project-path>/.migration/block-inventory.json`, prints
  `{"blockCount": N, "blocks": [...]}` to stdout.
- Hardening: `await fsp.mkdir(projectPath + '/.migration', { recursive:
  true })` before writing; missing argument or unreadable project path →
  clear message to **stderr** + `process.exit(1)`. Missing `blocks/` dir
  stays a soft case (empty inventory, exit 0) — an EDS repo without
  blocks is legal.
- Keep `module.exports = { scanBlockInventory }`.
- Update the header comment: runs under plain node; Slicc's node bridge
  supports standard `require('fs')` (do not claim VFS globals).

### 2b. `generate-scoop-prompts.js` rewrite

- Same treatment: `require('node:fs/promises')`, async `main()`, no
  top-level `await`.
- **Do not change** `generateScoopConfigs`, `buildBlockPrompt`,
  `buildHeaderPrompt`, `buildFooterPrompt` logic or the emitted prompt
  text — only the fs/CLI plumbing.
- CLI contract (unchanged): `node generate-scoop-prompts.js
  <migration-dir> [model]` reads `<migration-dir>/decomposition.json`,
  prints the JSON configs array to stdout.
- Fail fast: missing arg, missing/unparseable `decomposition.json`, or
  `decomposition.url` absent → stderr message naming the file and the
  problem + exit 1.
- Keep `module.exports = { generateScoopConfigs }`.
- Update the header usage comment (currently "in slicc JavaScript tool")
  to describe the plain-node CLI invocation.

Acceptance: both scripts run under real node (verified by Workstream 6
smoke tests); no references to `fs.readDir`/global `fs` remain; SKILL.md
invocations (lines ~179 and ~393) need no changes.

---

## Workstream 3 — Shared image-verification script

Fixes 2.9; provides the detection half of 2.6. New file:
`skills/migration/migrate-block/scripts/verify-images.js` (owned by
migrate-block, delegated to by migrate-header — same ownership pattern
as `dismiss-overlays/overlay-dismiss.js`).

### 3a. Script spec

Browser-side script for `playwright-cli eval-file`, wrapped in an IIFE
(per repo skill-authoring rules; avoid top-level redeclarations across
eval calls). Async is allowed (the IIFE may return a Promise — verify
during implementation that `playwright-cli eval-file` awaits promises;
the skills already use promise-returning evals).

Behavior:

1. Collect **every** `<img>` in the document — including hidden ones
   (retrospective 2.6c: images in `display:none` tab panes never load
   and hide breakage).
2. For each image record:
   `{ src, complete, naturalWidth, naturalHeight, isSVG, visible }`
   - `isSVG`: `src` ends in `.svg` (before query string) or starts with
     `data:image/svg`.
   - `visible`: `el.getClientRects().length > 0`.
3. Classify `status`:
   - `ok` — `complete && naturalWidth > 0`
   - `pending` — `!complete` (not yet loaded; typical for hidden/lazy)
   - `svg-indeterminate` — `complete && naturalWidth === 0 && isSVG`
     (SVGs legitimately report 0 — retrospective 2.9)
   - `broken` — `complete && naturalWidth === 0 && !isSVG`
4. For every non-`ok` image with an http(s) `src`, do an in-page
   `fetch(src)` and record `httpStatus` (network error → `httpStatus:
   0`). This resolves the indeterminate cases: an SVG with `httpStatus
   200` is fine; anything with a non-2xx status is genuinely broken.
5. Return JSON:

   ```json
   {
     "pass": true,
     "counts": { "total": 12, "ok": 9, "pending": 2, "svgIndeterminate": 1, "broken": 0 },
     "failures": [ { "src": "...", "status": "broken", "httpStatus": 404 } ],
     "images": [ ...all records... ]
   }
   ```

   `pass` = no `broken` images AND every non-`ok` image resolved with a
   2xx `httpStatus`.

### 3b. Skill integration

- **migrate-block SKILL.md** — after `### 6c. Verify EDS Framework
  Loaded`, add `### 6d. Verify Images`:

  ```bash
  playwright-cli eval-file --tab={previewTabId} /workspace/skills/migrate-block/scripts/verify-images.js
  ```

  Required: `pass: true`. If false, list `failures` and fix the content
  or asset paths before visual iteration. Include the rule verbatim:
  **"Never trust `naturalWidth` alone for SVG images — SVGs can render
  perfectly while reporting `naturalWidth: 0`. Trust the combined
  `complete` + HTTP-status check, or a screenshot."**
- **migrate-header SKILL.md** — after `### 6c. Verify EDS Framework`
  (~line 444), add the same step (same script path — migrate-block is
  always installed alongside), with an extra note that the brand icon
  is the most common `svg-indeterminate` hit and is healthy when its
  HTTP status is 200.

Acceptance: script exists; both skills invoke it with `pass: true` as a
gate; the SVG rule appears in both verification sections.

---

## Workstream 4 — migrate-header brand-logo pattern

Fixes 2.8 (+ the header side of 2.6a). File:
`skills/migration/migrate-header/SKILL.md`.

### 4a. The rule (add as a prominent callout in Step 4)

> **Brand logos: never ship an SVG as a bare `<img>`.** Downstream DA
> media optimization rasterizes SVGs (`media_*.svg?...&format=webply`);
> any SVG relying on `<text>` + web fonts loses its text and can render
> blank. If the source logo is an SVG, decompose it: a **shape-only
> icon** (no `<text>` elements) committed to `{projectPath}/icons/
> {icon-name}.svg`, referenced through the EDS icon system, plus the
> wordmark as **real HTML text**. The icon system serves raw SVG from
> the code bus and bypasses DA media optimization entirely. Raster
> logos (PNG/JPG) may remain `<img>` elements.

### 4b. Update Step 4 examples

Replace the logo line in the Single-Row Format example (~line 179)
`<p><a href="/"><img src="/drafts/images/logo.png" alt="Company"></a></p>`
with the branching pattern, showing both accepted forms:

```html
<!-- SVG source logo: icon + HTML wordmark (REQUIRED for SVG) -->
<p><a href="/"><span class="icon icon-brand"></span> <strong>Company</strong></a></p>
<!-- Raster source logo: plain img is acceptable -->
<p><a href="/"><img src="/drafts/images/logo.png" alt="Company"></a></p>
```

Update the Multi-Section Format example (~line 208) and the
`**Structure:**` / Content Transformation Rules "Logo:" bullets
(~line 199, ~line 271) to match:

- SVG source → extract/create shape-only icon, write to
  `{projectPath}/icons/{icon-name}.svg` (verify it contains no `<text>`
  element — `grep -c '<text' icons/{icon-name}.svg` must be 0), use
  `<span class="icon icon-{icon-name}"></span>` + wordmark text;
  `decorateIcons` in aem.js resolves the span to the raw code-bus SVG.
- Raster source → keep existing guidance (download to `/drafts/images/`
  via `fs.fetchToFile`, wrap in `<p><a><img></a></p>`).

### 4c. Step 2 analysis + Step 5 CSS + verification

- Step 2 (Analyze Header Structure): when recording the logo, also
  record its type — `svg-with-text`, `svg-shape-only`, or `raster` —
  since it decides the Step 4 pattern. (The existing capture script
  already grabs `logo.src`; add a note to fetch the SVG source and check
  for `<text>` when the src is an SVG.)
- Step 5 (Customize Header CSS): add a short subsection with icon +
  wordmark sizing guidance (icon height via `.header .icon-{name} svg /
  img` sizing, wordmark font-size/weight to match source) — mirror what
  the retrospective's manual fix did.
- Step 7 thin-header measurement snippet (~line 479) queries
  `h.querySelector('img')`; extend it to fall back to `.icon` when
  there is no `<img>`.
- Logo verification goes through Workstream 3's script (no bare
  `naturalWidth` checks).

Acceptance: the callout exists; no example in the file ships an SVG as
a bare `<img>`; analysis captures logo type; CSS guidance present.

---

## Workstream 5 — eds-da-content cross-references

Fixes the awareness half of 2.6a. Files:
`skills/migration/migrate-page/SKILL.md`,
`skills/migration/migrate-header/SKILL.md`.

Add a one-paragraph callout in each place image srcs are authored:

- **migrate-page Phase 4**, at the `**Rules:**` list containing "Images
  use `/drafts/images/` root-relative paths" (~line 519) — append:

  > Root-relative `/drafts/...` paths resolve in **local preview only**.
  > DA ingestion does not resolve arbitrary code-bus paths — they become
  > `<img src="about:error">` on the live page. Rewriting srcs for DA
  > (absolute URLs or DA-hosted media) is owned by the DA upload flow,
  > per the `eds-da-content` skill (`references/media.md`). This skill's
  > deliverable intentionally stops at local preview.

- **migrate-header Content Transformation Rules** (raster-logo bullet,
  Workstream 4b): one-line version of the same callout, pointing at
  `eds-da-content`.

Keep it to pointers — the contract knowledge stays in `eds-da-content`;
do not duplicate its tables into the migration skills.

Acceptance: both callouts present, both name the `eds-da-content` skill
and `references/media.md`.

---

## Workstream 6 — Script smoke tests

Guards 2.3 against doc/runtime drift. New files under top-level
`tests/` (outside `skills/migration`, so `upskill --path
skills/migration` never ships them).

```
tests/
  migrate-page-scripts/
    smoke.sh                 # entry point, set -euo pipefail
    fixtures/project/
      blocks/foo/foo.js      # any content
      blocks/foo/foo.css     # any content
      blocks/skipme/readme.txt   # dir without js/css → must be excluded
      .migration/decomposition.json
```

`decomposition.json` fixture must exercise every branch of
`generateScoopConfigs`: a `url` field; fragments containing a
`default-content` child (skipped), a `section` child wrapping a `block`,
a header block (`name: "nav-bar"` or fragment `path: "/nav"`), and a
footer block (`name: "footer"`).

`smoke.sh` (run from repo root, real node):

1. Copies fixtures to a temp dir (scripts write into the project dir —
   never mutate fixtures; use `mktemp -d`, clean up with `trap`).
2. `node skills/migration/migrate-page/scripts/block-inventory.js
   <tmp-project>` → asserts via `node -e` JSON parse: stdout has
   `blockCount === 1`, `blocks === ["foo"]`; file
   `<tmp-project>/.migration/block-inventory.json` exists, entry has
   `hasJs`, `hasCss` true and numeric sizes.
3. `node skills/migration/migrate-page/scripts/generate-scoop-prompts.js
   <tmp-project>/.migration` → asserts: output parses as a JSON array;
   contains a `nav-bar-block` config whose prompt mentions
   `migrate-header/SKILL.md`; a footer config whose prompt mentions
   `footer.plain.html`; no config for the `default-content` child; each
   config has `name`, `model`, `prompt`.
4. Error paths: running either script with no args exits non-zero with
   a message on stderr; `generate-scoop-prompts.js` against a dir with
   no `decomposition.json` exits non-zero.
5. Prints `SMOKE OK` on success.

Lint the script: `shellcheck tests/migrate-page-scripts/smoke.sh &&
shfmt -d tests/migrate-page-scripts/smoke.sh`.

CI wiring is a deliberate follow-up, not part of this change.

---

## Workstream 7 — CLAUDE.md runtime gotcha update

File: `CLAUDE.md` (repo root), lines ~88–91 ("`node -e "<inline>"` has
no VFS `fs` globals…"). Replace that bullet with:

> **Slicc's `node` bridges standard Node FS APIs (since ~2026-07-20).**
> `require('fs')`, `require('node:fs')`, and `require('fs/promises')`
> return a unified bridge: async methods are RPC-backed to the VFS, sync
> methods hit a coherent local cache flushed back after the script
> exits. Skill scripts run with `node <file.js>` must use standard
> `require('node:fs')`-style APIs — never the legacy VFS globals
> (`fs.readDir`, bare `fs`), which don't exist under real node (PLG
> labs) and are no longer needed under Slicc.

Keep the adjacent `fs.fetchToFile` rule in Skill Authoring Rules — that
applies to the browser/JS-tool `eval` context, which is a different
runtime from `node <file.js>`; add the parenthetical "(JS tool context,
not node scripts)" to it if ambiguity remains.

---

## Execution notes

- **Order:** WS2 → WS6 (tests prove WS2), then WS1, WS3, WS4, WS5, WS7
  in any order. Suggested commits: one per workstream, imperative
  subjects ≤72 chars.
- **Branch/PR:** work on `fix-skills-liftoff-retrospective-01` (this
  worktree), single PR to `main`.
- **Manifests:** `manifest.yaml` files don't enumerate files — no
  manifest changes needed. Optionally bump `version` minor for
  migrate-page, migrate-block, migrate-header.
- **Style:** scripts are CJS on purpose (Slicc-verified contract is
  `require`); the repo's Node/ESM standard applies to Node projects,
  not these sandboxed skill scripts. Keep functions ≤100 lines,
  fail-fast stderr errors, no commented-out code.
- **Doc-ref lint:** if the repo runs a `check-doc-refs`-style gate,
  ensure new backtick-quoted paths in this doc and SKILL.md files exist.

## Verification (definition of done)

1. `bash tests/migrate-page-scripts/smoke.sh` prints `SMOKE OK` under
   real node (v22).
2. `shellcheck` + `shfmt -d` clean on `smoke.sh`.
3. `rg "fs\.readDir|Slicc's JavaScript tool context|in slicc JavaScript tool"
   skills/migration/migrate-page/scripts/block-inventory.js
   skills/migration/migrate-page/scripts/generate-scoop-prompts.js`
   returns nothing.
4. `rg -n "resize" skills/migration/migrate-page/SKILL.md` shows the
   Step 1.2 mandate; the Step 1.6 guard names nodeCount/viewport
   thresholds.
5. `rg -n "verify-images" skills/migration/migrate-block/SKILL.md
   skills/migration/migrate-header/SKILL.md` shows one invocation each.
6. No SVG-as-bare-`<img>` logo remains in migrate-header examples:
   `rg -n 'img src="/drafts/images/logo' skills/migration/migrate-header/SKILL.md`
   only matches lines explicitly marked as the raster-logo variant.
7. `rg -n "eds-da-content" skills/migration/*/SKILL.md` shows the two
   Workstream 5 callouts.
8. CLAUDE.md no longer claims `node <file.js>` provides VFS `fs`
   globals.
9. Manual spot-check: `node skills/migration/migrate-page/scripts/
   generate-scoop-prompts.js` (no args) exits 1 with a usage message.

---

## Appendix A — Out-of-scope handoff (do not implement here)

| Retro item | Issue | Owner |
| --- | --- | --- |
| 2.1 | `openssl rand -hex 2` not portable — use `node -e "crypto.randomBytes(2).toString('hex')"` | liftoff-demo session |
| 2.5 | Deploy step must document `admin.hlx.page` preview auth: `-H "Authorization: Bearer $(oauth-token adobe)"` | liftoff-demo session |
| 2.10 | Handoff prompt must state target content path explicitly (e.g., "publish as index at site root") | liftoff-demo session |
| 2.4 | Seed `/.playwright**` NOPASSWD in block-scoop sandbox template; report duplicate lick re-notification (resolved licks re-notify) | Slicc runtime |
| 2.11 | `/shared/CLAUDE.md` "cone MUST NOT run sprinkle" rule needs a carve-out for cone-driven migration/liftoff flows | PLG labs config |
| 2.6b/c warm-media helper, 2.7 DA-native metadata mechanism | Deploy-time media warmer + metadata authoring — belongs to the DA upload flow (liftoff-demo), informed by `eds-da-content` | liftoff-demo session |
