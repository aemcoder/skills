# Migration Skills Hardening — Retrospective #1 Fixes: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the in-scope struggles from PLG labs retrospective #1 (items 2.2, 2.3, 2.6a, 2.8, 2.9) into enforced skill steps and executable checks in the migration skills.

**Architecture:** Doc + script changes across `skills/migration/`. Two shipped scripts become plain-node CJS (proven by a new smoke-test harness under top-level `tests/`); the migrate-page skill gains a viewport mandate + degenerate-tree guard; a new browser-side `verify-images.js` (owned by migrate-block, shared with migrate-header) replaces ad-hoc `naturalWidth` checks; migrate-header gets a mandatory brand-logo pattern; cross-references point at `eds-da-content` for DA image semantics.

**Tech Stack:** Markdown SKILL.md files, Node 22 CJS scripts, browser-side JS for `playwright-cli eval-file`, bash smoke test.

**Spec:** `docs/specs/2026-07-24-migration-skills-retrospective-fixes-design.md` (read it for rationale; this plan is self-contained for execution).

## Global Constraints

- Work on branch `fix-skills-liftoff-retrospective-01` (this worktree). Never push to main; one PR at the end.
- Node scripts are **CJS on purpose** (`require('node:fs/promises')`) — Slicc's node bridge supports standard `require('fs')`; do NOT convert to ESM and do NOT use Slicc VFS globals (`fs.readDir`, bare `fs`) or top-level `await`.
- Browser-side scripts (`verify-images.js`, `visual-tree.js`) are IIFEs (repo skill-authoring rule: avoid top-level redeclarations across eval calls).
- `tests/` stays at repo top level — it must NOT live under `skills/migration/` (upskill would ship it).
- Fail fast: errors to **stderr** + non-zero exit; no silently swallowed exceptions.
- Commits: imperative mood, ≤72-char subject, one logical change each.
- Bash: `set -euo pipefail`; must pass `shellcheck` and `shfmt -d`.
- SKILL.md edits keep surrounding step numbering intact (fold new content into existing steps or add lettered sub-steps like `6d` — never renumber).
- In this plan, 4-backtick fences wrap replacement content that itself contains 3-backtick code blocks; write the inner content verbatim (with its 3-backtick fences) into the target files.

---

### Task 1: Smoke-test harness + fixtures (the failing test)

**Files:**

- Create: `tests/migrate-page-scripts/smoke.sh`
- Create: `tests/migrate-page-scripts/fixtures/project/blocks/foo/foo.js`
- Create: `tests/migrate-page-scripts/fixtures/project/blocks/foo/foo.css`
- Create: `tests/migrate-page-scripts/fixtures/project/blocks/skipme/readme.txt`
- Create: `tests/migrate-page-scripts/fixtures/project/.migration/decomposition.json`

**Interfaces:**

- Produces: `bash tests/migrate-page-scripts/smoke.sh` — exits 0 and prints `SMOKE OK` only when both scripts satisfy their CLI contracts (Tasks 2–3 make it pass).

- [ ] **Step 1: Create fixture files**

`tests/migrate-page-scripts/fixtures/project/blocks/foo/foo.js`:

```js
export default function decorate(block) {}
```

`tests/migrate-page-scripts/fixtures/project/blocks/foo/foo.css`:

```css
.foo { display: block; }
```

`tests/migrate-page-scripts/fixtures/project/blocks/skipme/readme.txt`:

```text
Not a block — no js/css. Must be excluded from the inventory.
```

`tests/migrate-page-scripts/fixtures/project/.migration/decomposition.json`:

```json
{
  "url": "https://example.com/page",
  "fragments": [
    {
      "path": "/nav",
      "children": [
        { "type": "block", "name": "nav-bar", "id": "r1",
          "bounds": { "x": 0, "y": 0, "width": 1440, "height": 80 } }
      ]
    },
    {
      "path": "/page",
      "children": [
        { "type": "default-content", "name": "intro" },
        {
          "type": "section",
          "children": [
            { "type": "block", "name": "cards", "id": "r3",
              "bounds": { "x": 0, "y": 400, "width": 1440, "height": 600 } }
          ]
        }
      ]
    },
    {
      "path": "/footer",
      "children": [
        { "type": "block", "name": "footer", "id": "r9",
          "bounds": { "x": 0, "y": 2000, "width": 1440, "height": 400 } }
      ]
    }
  ]
}
```

- [ ] **Step 2: Write `tests/migrate-page-scripts/smoke.sh`**

```bash
#!/usr/bin/env bash
# Smoke tests for the migrate-page node scripts. Run from anywhere:
#   bash tests/migrate-page-scripts/smoke.sh
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

SCRIPTS=skills/migration/migrate-page/scripts
FIXTURES=tests/migrate-page-scripts/fixtures/project

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cp -R "$FIXTURES" "$TMP/project"

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

# --- block-inventory.js: happy path ---
out="$(node "$SCRIPTS/block-inventory.js" "$TMP/project")"
echo "$out" | node -e '
  const data = JSON.parse(require("fs").readFileSync(0, "utf8"));
  if (data.blockCount !== 1) throw new Error("blockCount: " + data.blockCount);
  if (data.blocks.join(",") !== "foo") throw new Error("blocks: " + data.blocks);
' || fail "block-inventory stdout summary"

node -e '
  const data = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  if (data.length !== 1) throw new Error("entries: " + data.length);
  const e = data[0];
  if (e.name !== "foo" || e.hasJs !== true || e.hasCss !== true) throw new Error(JSON.stringify(e));
  if (typeof e.jsSize !== "number" || typeof e.cssSize !== "number") throw new Error("sizes not numeric");
' "$TMP/project/.migration/block-inventory.json" || fail "block-inventory.json contents"

# --- block-inventory.js: error path (no args) ---
if node "$SCRIPTS/block-inventory.js" 2>/dev/null; then
  fail "block-inventory.js with no args should exit non-zero"
fi

# --- generate-scoop-prompts.js: happy path ---
out="$(node "$SCRIPTS/generate-scoop-prompts.js" "$TMP/project/.migration")"
echo "$out" | node -e '
  const configs = JSON.parse(require("fs").readFileSync(0, "utf8"));
  if (!Array.isArray(configs)) throw new Error("not an array");
  for (const c of configs) {
    for (const k of ["name", "model", "prompt"]) {
      if (typeof c[k] !== "string" || !c[k]) throw new Error("missing " + k + " in " + JSON.stringify(c));
    }
  }
  const names = configs.map((c) => c.name);
  const nav = configs.find((c) => c.name === "nav-bar-block");
  if (!nav) throw new Error("no nav-bar-block in: " + names);
  if (!nav.prompt.includes("migrate-header/SKILL.md")) throw new Error("nav prompt missing header skill ref");
  const footer = configs.find((c) => c.name === "footer-block");
  if (!footer) throw new Error("no footer-block in: " + names);
  if (!footer.prompt.includes("footer.plain.html")) throw new Error("footer prompt missing footer.plain.html");
  if (!configs.find((c) => c.name === "cards-block")) throw new Error("no cards-block in: " + names);
  if (names.some((n) => n.includes("intro"))) throw new Error("default-content got a scoop");
' || fail "generate-scoop-prompts output"

# --- generate-scoop-prompts.js: error paths ---
if node "$SCRIPTS/generate-scoop-prompts.js" 2>/dev/null; then
  fail "generate-scoop-prompts.js with no args should exit non-zero"
fi
if node "$SCRIPTS/generate-scoop-prompts.js" "$TMP" 2>/dev/null; then
  fail "generate-scoop-prompts.js without decomposition.json should exit non-zero"
fi

echo "SMOKE OK"
```

- [ ] **Step 3: Lint the script**

Run: `shellcheck tests/migrate-page-scripts/smoke.sh && shfmt -d tests/migrate-page-scripts/smoke.sh`
Expected: no output (clean). Fix any findings before continuing.

- [ ] **Step 4: Run smoke to verify it fails against the current scripts**

Run: `bash tests/migrate-page-scripts/smoke.sh`
Expected: FAIL — non-zero exit. Current `block-inventory.js` uses top-level `await` in a CJS file (`SyntaxError: await is only valid in async functions...`) and both scripts reference the VFS `fs` global. Do NOT "fix" the test — Tasks 2–3 fix the scripts.

- [ ] **Step 5: Commit**

```bash
git add tests/migrate-page-scripts/
git commit -m "test: add smoke harness for migrate-page node scripts"
```

---

### Task 2: Rewrite `block-inventory.js` as plain node

**Files:**

- Modify: `skills/migration/migrate-page/scripts/block-inventory.js` (full rewrite)
- Test: `tests/migrate-page-scripts/smoke.sh` (Task 1)

**Interfaces:**

- Produces: CLI `node block-inventory.js <project-path>` — writes `<project-path>/.migration/block-inventory.json` (array of `{ name, hasJs, hasCss, jsSize?, cssSize? }`), prints `{"blockCount": N, "blocks": [...]}` to stdout, exit 1 + stderr usage on missing arg or nonexistent project path. Missing `blocks/` dir → empty inventory, exit 0. Also `module.exports = { scanBlockInventory }`.

- [ ] **Step 1: Replace the entire file with**

```js
/**
 * Scan an EDS project's blocks/ directory for available blocks.
 *
 * CLI: node block-inventory.js <project-path>
 *
 * Writes <project-path>/.migration/block-inventory.json and prints a
 * summary ({ blockCount, blocks }) to stdout. Uses standard node fs —
 * Slicc's node bridges require('fs'), so the same invocation works
 * inside Slicc and under real node (PLG labs).
 */
const fsp = require('node:fs/promises');

async function fileSize(path) {
  try {
    return (await fsp.stat(path)).size;
  } catch {
    return undefined;
  }
}

async function scanBlockInventory(projectPath) {
  const entries = [];

  let dirEntries;
  try {
    dirEntries = await fsp.readdir(projectPath + '/blocks', { withFileTypes: true });
  } catch {
    return entries;
  }

  for (const entry of dirEntries) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    const blockDir = projectPath + '/blocks/' + name;
    const jsSize = await fileSize(blockDir + '/' + name + '.js');
    const cssSize = await fileSize(blockDir + '/' + name + '.css');
    if (jsSize === undefined && cssSize === undefined) continue;
    entries.push({
      name,
      hasJs: jsSize !== undefined,
      hasCss: cssSize !== undefined,
      jsSize,
      cssSize,
    });
  }

  return entries;
}

module.exports = { scanBlockInventory };

async function main() {
  const projectPath = process.argv[2];
  if (!projectPath) {
    console.error('Usage: node block-inventory.js <project-path>');
    process.exit(1);
  }
  try {
    await fsp.access(projectPath);
  } catch {
    console.error('block-inventory: project path not found: ' + projectPath);
    process.exit(1);
  }
  const blocks = await scanBlockInventory(projectPath);
  await fsp.mkdir(projectPath + '/.migration', { recursive: true });
  await fsp.writeFile(
    projectPath + '/.migration/block-inventory.json',
    JSON.stringify(blocks, null, 2)
  );
  console.log(
    JSON.stringify({ blockCount: blocks.length, blocks: blocks.map((b) => b.name) })
  );
}

if (require.main === module) {
  main().catch((err) => {
    console.error('block-inventory failed: ' + err.message);
    process.exit(1);
  });
}
```

- [ ] **Step 2: Run the block-inventory portion of the smoke test**

Run: `bash tests/migrate-page-scripts/smoke.sh`
Expected: the block-inventory assertions pass; the run now fails LATER, at the `generate-scoop-prompts.js` happy-path step (that script is still VFS-based — Task 3). Confirm the failure message is about generate-scoop-prompts, not block-inventory.

- [ ] **Step 3: Commit**

```bash
git add skills/migration/migrate-page/scripts/block-inventory.js
git commit -m "fix(migrate-page): make block-inventory.js runnable under plain node"
```

---

### Task 3: Rewrite `generate-scoop-prompts.js` CLI plumbing

**Files:**

- Modify: `skills/migration/migrate-page/scripts/generate-scoop-prompts.js` (header comment + CLI block ONLY)
- Test: `tests/migrate-page-scripts/smoke.sh`

**Interfaces:**

- Consumes: nothing new.
- Produces: CLI `node generate-scoop-prompts.js <migration-dir> [model]` — prints JSON array of `{ name, model, prompt }` to stdout; exit 1 + stderr on missing arg, unreadable/unparseable `decomposition.json`, or missing `decomposition.url`. `module.exports = { generateScoopConfigs }` unchanged.

**CRITICAL:** Do NOT change `generateScoopConfigs`, `buildBlockPrompt`, `buildHeaderPrompt`, `buildFooterPrompt` — logic and emitted prompt text stay byte-identical.

- [ ] **Step 1: Replace the file's opening doc comment** (the block starting `/**` with `* Generate scoop creation configs for page migration.` through the closing `*/` that precedes `function generateScoopConfigs`) with:

```js
/**
 * Generate scoop creation configs for page migration.
 *
 * CLI: node generate-scoop-prompts.js <migration-dir> [model]
 * Reads <migration-dir>/decomposition.json and prints scoop configs as
 * JSON to stdout. Uses standard node fs — works inside Slicc's node
 * bridge and under real node (PLG labs).
 *
 * Programmatic use: require(...).generateScoopConfigs(decomposition,
 * sourceUrl, projectPath, model?) returns Array<{ name, model, prompt }>.
 *
 * @param {object} decomposition - The decomposition.json content (parsed)
 * @param {string} sourceUrl - The source page URL
 * @param {string} projectPath - The EDS project path (e.g., "/shared/vibemigrated")
 * @param {string} [model='claude-opus-4-6'] - Model ID for scoops.
 * @returns {Array<{name: string, model: string, prompt: string}>}
 */
```

- [ ] **Step 2: Replace the trailing export + CLI block** (from the line `// Export for use when eval'd by another script` to end of file) with:

```js
module.exports = { generateScoopConfigs };

async function main() {
  const fsp = require('node:fs/promises');
  const migrationDir = process.argv[2];
  if (!migrationDir) {
    console.error('Usage: node generate-scoop-prompts.js <migration-dir> [model]');
    process.exit(1);
  }
  const decompositionPath = migrationDir + '/decomposition.json';
  let decomposition;
  try {
    decomposition = JSON.parse(await fsp.readFile(decompositionPath, 'utf8'));
  } catch (err) {
    console.error(
      'generate-scoop-prompts: cannot read ' + decompositionPath + ': ' + err.message
    );
    process.exit(1);
  }
  if (!decomposition.url) {
    console.error(
      'generate-scoop-prompts: ' + decompositionPath + ' has no "url" field'
    );
    process.exit(1);
  }
  const projectPath = migrationDir.replace(/\/\.migration\/?$/, '');
  const model = process.argv[3] || 'claude-opus-4-6';
  console.log(
    JSON.stringify(generateScoopConfigs(decomposition, decomposition.url, projectPath, model))
  );
}

if (require.main === module) {
  main().catch((err) => {
    console.error('generate-scoop-prompts failed: ' + err.message);
    process.exit(1);
  });
}
```

- [ ] **Step 3: Run the full smoke test**

Run: `bash tests/migrate-page-scripts/smoke.sh`
Expected: `SMOKE OK`, exit 0.

- [ ] **Step 4: Verify no VFS-era references remain**

Run: `rg "fs\.readDir|Slicc's JavaScript tool context|in slicc JavaScript tool" skills/migration/migrate-page/scripts/block-inventory.js skills/migration/migrate-page/scripts/generate-scoop-prompts.js`
Expected: no matches.

- [ ] **Step 5: Commit**

```bash
git add skills/migration/migrate-page/scripts/generate-scoop-prompts.js
git commit -m "fix(migrate-page): make generate-scoop-prompts.js runnable under plain node"
```

---

### Task 4: migrate-page viewport mandate + degenerate-tree guard

**Files:**

- Modify: `skills/migration/migrate-page/SKILL.md` (Step 1.2, Step 1.6)
- Modify: `skills/migration/migrate-page/scripts/visual-tree.js` (final return object, end of file)

**Interfaces:**

- Produces: `visual-tree.js` output JSON gains top-level `viewport: {width, height}` and `nodeCount: number` (consumed by the new Step 1.6 guard).

- [ ] **Step 1: Check the real resize syntax (do not guess)**

Run: `playwright-cli resize --help` if `playwright-cli` is available in this environment; otherwise search the slicc repo/docs for the resize command signature. The retrospective session used `resize 1440 900` (positional) successfully — use positional args unless help says otherwise, and adjust the snippet in Step 2 to whatever the CLI actually accepts.

- [ ] **Step 2: Edit SKILL.md Step 1.2** — replace this section:

````markdown
### Step 1.2: Navigate to Source Page

Open the source URL in a new browser tab:

```bash
playwright-cli tab-new {sourceUrl}
```

Capture the **targetId** from the output (e.g., `SRC123`). All subsequent
`playwright-cli` commands for this source tab MUST include `--tab={sourceTabId}`.
````

with:

````markdown
### Step 1.2: Navigate to Source Page and Set Desktop Viewport

Open the source URL in a new browser tab:

```bash
playwright-cli tab-new {sourceUrl}
```

Capture the **targetId** from the output (e.g., `SRC123`). All subsequent
`playwright-cli` commands for this source tab MUST include `--tab={sourceTabId}`.

**MANDATORY — resize to a desktop viewport before ANY extraction step:**

```bash
playwright-cli resize --tab={sourceTabId} 1440 900
```

New tabs open at a default viewport of ~780px. The visual-tree extractor
ignores elements narrower than 900px, so extraction at the default width
produces an unusable 1-node tree and a mobile-width screenshot — every
Phase 1 artifact would be wrong. Never skip this step.
````

- [ ] **Step 3: Edit SKILL.md Step 1.6** — directly after the existing Step 1.6 command block (`playwright-cli eval-file ... visual-tree.js --output=...visual-tree.json`) and before the `### Step 1.7` heading, insert:

````markdown
**Guard — verify the tree is usable before continuing:**

```bash
grep -o '"nodeCount":[0-9]*' /shared/{repo-name}/.migration/visual-tree.json
grep -o '"viewport":{[^}]*}' /shared/{repo-name}/.migration/visual-tree.json
```

**If `nodeCount` < 5, or `viewport.width` < 1024: HARD ERROR — do not
proceed.** The extraction ran at a too-narrow viewport (or the page did
not render). Re-run the resize from Step 1.2, then re-run Steps 1.4–1.6.
Never continue to Phase 2 with a degenerate tree — decomposition is
impossible from a 1-node tree.
````

- [ ] **Step 4: Edit `visual-tree.js`** — replace the final return object (end of file):

```js
  return {
    tree: root,
    text: text,
    nodeMap: nodeMap
  };
```

with:

```js
  return {
    tree: root,
    text: text,
    nodeMap: nodeMap,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    nodeCount: Object.keys(nodeMap).length
  };
```

- [ ] **Step 5: Verify**

Run: `node --check skills/migration/migrate-page/scripts/visual-tree.js && rg -n "resize --tab|nodeCount" skills/migration/migrate-page/SKILL.md skills/migration/migrate-page/scripts/visual-tree.js`
Expected: syntax check passes; matches in Step 1.2 (resize), Step 1.6 guard (nodeCount), and visual-tree.js (nodeCount).

- [ ] **Step 6: Commit**

```bash
git add skills/migration/migrate-page/SKILL.md skills/migration/migrate-page/scripts/visual-tree.js
git commit -m "fix(migrate-page): mandate desktop viewport and guard degenerate trees"
```

---

### Task 5: `verify-images.js` + verification steps in both skills

**Files:**

- Create: `skills/migration/migrate-block/scripts/verify-images.js`
- Modify: `skills/migration/migrate-block/SKILL.md` (new `### 6d. Verify Images` after 6c)
- Modify: `skills/migration/migrate-header/SKILL.md` (new `### 6d. Verify Images` after 6c)

**Interfaces:**

- Produces: browser-side script for `playwright-cli eval-file` returning JSON `{ pass: boolean, counts: {total, ok, pending, svgIndeterminate, broken}, failures: [{src, status, httpStatus?}], images: [...] }`. Both SKILL.md files gate on `pass: true`.

- [ ] **Step 1: Create `skills/migration/migrate-block/scripts/verify-images.js`**

```js
/**
 * Verify every <img> on the page — including hidden ones (images inside
 * display:none tab panes never load and hide breakage).
 *
 * Run: playwright-cli eval-file --tab={previewTabId} \
 *        /workspace/skills/migrate-block/scripts/verify-images.js
 *
 * naturalWidth alone is unreliable: SVGs can render perfectly while
 * reporting naturalWidth 0. Ambiguous cases (SVGs, pending/lazy images)
 * are resolved with an in-page fetch of the src. Non-http(s) srcs
 * (e.g., data: URIs) cannot be fetch-verified; if not ok they count as
 * failures. pass = no broken images AND every non-ok image resolved 2xx.
 */
(async function verifyImages() {
  var imgs = Array.from(document.querySelectorAll('img'));

  var records = imgs.map(function (img) {
    var src = img.currentSrc || img.src || '';
    var path = src.split(/[?#]/)[0];
    var isSVG = /\.svg$/i.test(path) || src.indexOf('data:image/svg') === 0;
    var status;
    if (!img.complete) status = 'pending';
    else if (img.naturalWidth > 0) status = 'ok';
    else status = isSVG ? 'svg-indeterminate' : 'broken';
    return {
      src: src,
      complete: img.complete,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      isSVG: isSVG,
      visible: img.getClientRects().length > 0,
      status: status
    };
  });

  for (var i = 0; i < records.length; i++) {
    var rec = records[i];
    if (rec.status === 'ok' || !/^https?:/.test(rec.src)) continue;
    try {
      var resp = await fetch(rec.src);
      rec.httpStatus = resp.status;
    } catch (e) {
      rec.httpStatus = 0;
    }
  }

  var failures = records.filter(function (r) {
    if (r.status === 'broken') return true;
    if (r.status === 'ok') return false;
    return !(r.httpStatus >= 200 && r.httpStatus < 300);
  });

  function count(status) {
    return records.filter(function (r) { return r.status === status; }).length;
  }

  return JSON.stringify({
    pass: failures.length === 0,
    counts: {
      total: records.length,
      ok: count('ok'),
      pending: count('pending'),
      svgIndeterminate: count('svg-indeterminate'),
      broken: count('broken')
    },
    failures: failures.map(function (r) {
      return { src: r.src, status: r.status, httpStatus: r.httpStatus };
    }),
    images: records
  });
})();
```

- [ ] **Step 2: Syntax-check**

Run: `node --check skills/migration/migrate-block/scripts/verify-images.js`
Expected: no output, exit 0.

- [ ] **Step 3: Add `### 6d. Verify Images` to migrate-block SKILL.md** — replace:

```markdown
Do NOT work around framework failures by inlining CSS/JS.

---

## Step 7: Visual Verification (Max 3 Iterations)
```

with:

````markdown
Do NOT work around framework failures by inlining CSS/JS.

### 6d. Verify Images

Run the shared image verifier (checks EVERY `<img>`, including hidden
ones, and resolves ambiguous cases with an in-page HTTP fetch):

```bash
playwright-cli eval-file --tab={previewTabId} /workspace/skills/migrate-block/scripts/verify-images.js
```

**Required:** `pass: true`. If false, inspect `failures` (each entry has
`src`, `status`, `httpStatus`) and fix the content or asset paths before
visual iteration.

**Never trust `naturalWidth` alone for SVG images — SVGs can render
perfectly while reporting `naturalWidth: 0`. Trust the combined
`complete` + HTTP-status check, or a screenshot.**

---

## Step 7: Visual Verification (Max 3 Iterations)
````

- [ ] **Step 4: Add `### 6d. Verify Images` to migrate-header SKILL.md** — replace:

```markdown
`nav.plain.html` exists at `{projectPath}/drafts/nav.plain.html` and
the `<meta name="nav">` points to `/drafts/nav`.

---

## Step 7: Visual Verification (Max 5 Iterations)
```

with:

````markdown
`nav.plain.html` exists at `{projectPath}/drafts/nav.plain.html` and
the `<meta name="nav">` points to `/drafts/nav`.

### 6d. Verify Images

Run the shared image verifier from the migrate-block skill (installed
alongside this one):

```bash
playwright-cli eval-file --tab={previewTabId} /workspace/skills/migrate-block/scripts/verify-images.js
```

**Required:** `pass: true`. The brand icon is the most common
`svg-indeterminate` hit — it is healthy when its `httpStatus` is 200.
**Never trust `naturalWidth` alone for SVG images** — SVGs can render
perfectly while reporting `naturalWidth: 0`.

---

## Step 7: Visual Verification (Max 5 Iterations)
````

- [ ] **Step 5: Verify integration**

Run: `rg -n "verify-images" skills/migration/migrate-block/SKILL.md skills/migration/migrate-header/SKILL.md`
Expected: exactly one `eval-file` invocation in each file.

- [ ] **Step 6: Commit**

```bash
git add skills/migration/migrate-block/ skills/migration/migrate-header/SKILL.md
git commit -m "feat(migrate-block): add shared verify-images.js image gate"
```

---

### Task 6: migrate-header brand-logo pattern

**Files:**

- Modify: `skills/migration/migrate-header/SKILL.md` (Steps 2, 4, 5, 7)

All edits below are to that one file.

- [ ] **Step 1: Add logo-type capture note to the Step 1 extraction.** After the "Extract all header content in one comprehensive call" command block (the eval that returns `{ html, logo, links, tokens }`), append:

```markdown
**Record the logo type** — it decides the Step 4 brand pattern:

- If `logo.src` is an SVG, fetch it (`curl -s {logo.src}`) and check for
  `<text>` elements. Record `svg-with-text` or `svg-shape-only`.
- Otherwise record `raster`.
```

- [ ] **Step 2: Add the brand-logo callout at the top of Step 4.** Replace:

```markdown
## Step 4: Generate nav.plain.html

Write to `{projectPath}/drafts/nav.plain.html`.
```

with:

```markdown
## Step 4: Generate nav.plain.html

Write to `{projectPath}/drafts/nav.plain.html`.

> **Brand logos: never ship an SVG as a bare `<img>`.** Downstream DA
> media optimization rasterizes SVGs (`media_*.svg?...&format=webply`);
> any SVG relying on `<text>` + web fonts loses its text and can render
> blank. If the source logo is an SVG (either type recorded in Step 1),
> decompose it: a **shape-only icon** (no `<text>` elements) committed
> to `{projectPath}/icons/{icon-name}.svg`, referenced through the EDS
> icon system (`<span class="icon icon-{icon-name}"></span>` —
> `decorateIcons` in aem.js serves the raw SVG from the code bus,
> bypassing DA media optimization), plus the wordmark as **real HTML
> text**. Verify the icon has no text: `grep -c '<text' icons/{icon-name}.svg`
> must output 0. Raster logos (PNG/JPG) may remain `<img>` elements.
```

- [ ] **Step 3: Update the Single-Row Format example.** Replace the line:

```html
  <p><a href="/"><img src="/drafts/images/logo.png" alt="Company"></a></p>
```

with:

```html
  <!-- SVG source logo: icon + HTML wordmark (REQUIRED for SVG) -->
  <p><a href="/"><span class="icon icon-brand"></span> <strong>Company</strong></a></p>
  <!-- Raster source logo: plain img is acceptable -->
  <!-- <p><a href="/"><img src="/drafts/images/logo.png" alt="Company"></a></p> -->
```

- [ ] **Step 4: Update the Structure bullet.** Replace:

```markdown
- Logo: `<p><a><img></a></p>` (first element)
```

with:

```markdown
- Logo (first element): SVG source → `<p><a><span class="icon icon-{name}"></span> <strong>Wordmark</strong></a></p>`; raster source → `<p><a><img></a></p>`
```

- [ ] **Step 5: Update the Multi-Section Format brand section.** Replace the line:

```html
  <p><img src="/drafts/images/logo.png" alt="Company"></p>
```

with:

```html
  <p><span class="icon icon-brand"></span> <strong>Company</strong></p>
```

- [ ] **Step 6: Update the Content Transformation Rules logo bullet.** Replace:

```markdown
- **Logo:** wrap in `<p><a><img></a></p>`, download image to `/drafts/images/`
  using `fs.fetchToFile(url, path)`. Do NOT use `fs.writeFile()` for images —
  it corrupts binary data by coercing bytes to UTF-8.
```

with:

```markdown
- **Logo (SVG source):** shape-only icon at `{projectPath}/icons/{icon-name}.svg`
  (no `<text>` elements) + `<span class="icon icon-{icon-name}"></span>` +
  wordmark as HTML text. Never a bare SVG `<img>` — DA rasterization drops
  font-dependent `<text>` (see the Step 4 callout).
- **Logo (raster source):** wrap in `<p><a><img></a></p>`, download image to
  `/drafts/images/` using `fs.fetchToFile(url, path)`. Do NOT use
  `fs.writeFile()` for images — it corrupts binary data by coercing bytes to
  UTF-8. Note: `/drafts/...` root-relative paths resolve in local preview
  only; DA upload flows must rewrite them per the `eds-da-content` skill
  (`references/media.md`).
```

- [ ] **Step 7: Add icon/wordmark sizing guidance to Step 5.** After Step 5's opening `.header.block` specificity rule and its WRONG/RIGHT example block, append this subsection:

````markdown
### Brand icon + wordmark sizing

When the brand uses the icon + HTML-text pattern, size both explicitly —
defaults render the icon at 16px and the wordmark at body size:

```css
.header.block .icon-brand svg,
.header.block .icon-brand img {
  height: var(--brand-icon-height, 32px);
  width: auto;
}

.header.block .brand strong {
  font-size: var(--brand-wordmark-size, 1.25rem);
  font-weight: 700;
}
```

Substitute `icon-brand` with the actual `icon-{icon-name}` class. Match
`--brand-icon-height` and the wordmark size to the source header
measurements from Step 1.
````

- [ ] **Step 8: Make the thin-header measurement snippet icon-aware.** In the Step 7 eval snippet, replace:

```js
  const logo = h.querySelector('img');
```

with:

```js
  const logo = h.querySelector('img') || h.querySelector('.icon svg') || h.querySelector('.icon');
```

- [ ] **Step 9: Verify**

Run: `rg -n 'img src="/drafts/images/logo' skills/migration/migrate-header/SKILL.md`
Expected: matches only on commented (`<!-- ... -->`) raster-variant lines — no uncommented bare-`<img>` logo examples remain. Also run `rg -n "icon icon-" skills/migration/migrate-header/SKILL.md` and confirm the pattern appears in the Step 4 callout, both examples, the Structure bullet, and the transformation rules.

- [ ] **Step 10: Commit**

```bash
git add skills/migration/migrate-header/SKILL.md
git commit -m "fix(migrate-header): mandate icon+wordmark brand pattern for SVG logos"
```

---

### Task 7: migrate-page eds-da-content callout

**Files:**

- Modify: `skills/migration/migrate-page/SKILL.md` (Phase 4 Rules list)

Note: the migrate-header side of this cross-reference was already added in Task 6 Step 6.

- [ ] **Step 1: Edit the Phase 4 Rules list.** Replace the bullet:

```markdown
- Images use `/drafts/images/` root-relative paths
```

with:

```markdown
- Images use `/drafts/images/` root-relative paths — **local preview
  only**. DA ingestion does not resolve arbitrary code-bus paths; they
  become `<img src="about:error">` on the live page. Rewriting srcs for
  DA (absolute URLs or DA-hosted media) is owned by the DA upload flow —
  see the `eds-da-content` skill (`references/media.md`). This skill's
  deliverable intentionally stops at local preview.
```

- [ ] **Step 2: Verify**

Run: `rg -n "eds-da-content" skills/migration/migrate-page/SKILL.md skills/migration/migrate-header/SKILL.md`
Expected: at least one match in each file (Phase 4 rules here; transformation rules from Task 6).

- [ ] **Step 3: Commit**

```bash
git add skills/migration/migrate-page/SKILL.md
git commit -m "docs(migrate-page): warn that /drafts image paths do not survive DA"
```

---

### Task 8: CLAUDE.md runtime gotcha update

**Files:**

- Modify: `CLAUDE.md` (repo root, CLI gotchas + Skill Authoring Rules sections)

- [ ] **Step 1: Replace the stale node gotcha.** Replace:

```markdown
- **`node -e "<inline>"` has no VFS `fs` globals or `require()`.** The
  Slicc `node -e` shim doesn't expose VFS globals. Use `node <file.js>`
  instead — the file form gets VFS `fs` globals and top-level `await`.
  Never use `node -e` for VFS file I/O.
```

with:

```markdown
- **Slicc's `node` bridges standard Node FS APIs (since ~2026-07-20).**
  `require('fs')`, `require('node:fs')`, and `require('fs/promises')`
  return a unified bridge: async methods are RPC-backed to the VFS, sync
  methods hit a coherent local cache flushed back after the script
  exits. Skill scripts run with `node <file.js>` must use standard
  `require('node:fs')`-style APIs — never the legacy VFS globals
  (`fs.readDir`, bare `fs`), which don't exist under real node (PLG
  labs) and are no longer needed under Slicc.
```

- [ ] **Step 2: Disambiguate the `fs.fetchToFile` authoring rule.** In the "Skill Authoring Rules" section, replace:

```markdown
- Use `fs.fetchToFile(url, path)` for binary downloads, never `fs.writeFile()` with binary data
```

with:

```markdown
- Use `fs.fetchToFile(url, path)` for binary downloads (JS tool context,
  not node scripts), never `fs.writeFile()` with binary data
```

- [ ] **Step 3: Verify**

Run: `rg -n "VFS" CLAUDE.md`
Expected: no remaining claim that `node <file.js>` provides VFS `fs` globals; the new bridge bullet is present.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update Slicc node fs gotcha for the unified fs bridge"
```

---

### Task 9: Final verification sweep + PR

**Files:** none (verification only).

- [ ] **Step 1: Run the full definition-of-done checks**

```bash
bash tests/migrate-page-scripts/smoke.sh
shellcheck tests/migrate-page-scripts/smoke.sh && shfmt -d tests/migrate-page-scripts/smoke.sh
rg "fs\.readDir|Slicc's JavaScript tool context|in slicc JavaScript tool" \
  skills/migration/migrate-page/scripts/block-inventory.js \
  skills/migration/migrate-page/scripts/generate-scoop-prompts.js || true
rg -n "resize --tab" skills/migration/migrate-page/SKILL.md
rg -n "verify-images" skills/migration/migrate-block/SKILL.md skills/migration/migrate-header/SKILL.md
rg -n "eds-da-content" skills/migration/*/SKILL.md
node skills/migration/migrate-page/scripts/generate-scoop-prompts.js; echo "exit=$?"
```

Expected: `SMOKE OK`; lint clean; the `fs.readDir` rg prints nothing; resize/verify-images/eds-da-content matches present; the last command prints a usage message to stderr and `exit=1`.

- [ ] **Step 2: Re-read the full diff for quality**

Run: `git diff main...HEAD --stat && git diff main...HEAD`
Check: no commented-out code (the two annotated raster-logo example lines in migrate-header are intentional documentation, not dead code), no unnecessary complexity, SKILL.md step numbering intact (`### 6d` inserted, nothing renumbered).

- [ ] **Step 3: Push branch and open PR**

```bash
git push -u origin fix-skills-liftoff-retrospective-01
gh pr create --title "Harden migration skills from PLG labs retrospective #1" \
  --body "$(cat <<'EOF'
Fixes from the 2026-07-23 basecamp migration retrospective (in-scope items 2.2, 2.3, 2.6a, 2.8, 2.9).

- migrate-page: mandate 1440x900 viewport before extraction; hard guard on degenerate visual trees (visual-tree.js now reports viewport + nodeCount)
- migrate-page scripts: block-inventory.js and generate-scoop-prompts.js now run under plain node (standard require('node:fs/promises')), with a smoke-test harness in tests/
- migrate-block: new shared verify-images.js gate — checks all imgs including hidden ones, resolves SVG naturalWidth ambiguity via in-page fetch
- migrate-header: brand logos must use shape-only icon + HTML wordmark when the source logo is SVG (DA rasterization drops <text>); icon sizing CSS guidance
- Cross-references to eds-da-content for DA image path semantics
- CLAUDE.md: updated Slicc node fs gotcha for the unified fs bridge

Spec: docs/specs/2026-07-24-migration-skills-retrospective-fixes-design.md
Out-of-scope retrospective items (liftoff-demo, Slicc runtime) are listed in the spec's Appendix A.
EOF
)"
```

Expected: PR created against `main`.
