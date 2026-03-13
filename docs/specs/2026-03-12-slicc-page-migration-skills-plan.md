# Slicc Page Migration Skills — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a self-contained Slicc skills package for EDS page migration, installable via `upskill aemcoder/skills --path migration --all`.

**Architecture:** Four skills under `migration/`, each a directory with `SKILL.md` + `manifest.yaml`. The `migrate-page` skill also ships 7 extraction/helper scripts. Skills are ported from the `feat/migrate-page-design` branch of `ai-ecoverse/slicc` with path updates and Phase 1 refactored to remove the `migrate_page` tool dependency.

**Tech Stack:** Plain JavaScript (extraction scripts), Markdown (SKILL.md), YAML (manifests). No build step.

**Spec:** `docs/specs/2026-03-12-slicc-page-migration-skills-design.md`

**Source worktree:** `/Users/catalan/repos/ai/ai-ecoverse/slicc/.claude/worktrees/feat-vibemigration-flavor`

---

## File Map

### Files to Create

| File | Responsibility |
|------|---------------|
| `migration/migrate-page/SKILL.md` | Cone orchestration skill — 4-phase migration flow |
| `migration/migrate-page/manifest.yaml` | Skill metadata with dependencies |
| `migration/migrate-page/scripts/visual-tree.js` | Browser evaluate: DOM spatial hierarchy |
| `migration/migrate-page/scripts/brand-extract.js` | Browser evaluate: fonts/colors/spacing |
| `migration/migrate-page/scripts/metadata-extract.js` | Browser evaluate: title/OG/JSON-LD |
| `migration/migrate-page/scripts/page-prep.js` | Browser evaluate: fix fixed-pos, lazy-load |
| `migration/migrate-page/scripts/overlay-dismiss.js` | Browser evaluate: cookie/consent banners |
| `migration/migrate-page/scripts/block-inventory.js` | JS tool: scan blocks/ directory |
| `migration/migrate-page/scripts/generate-scoop-prompts.js` | JS tool: build scoop configs |
| `migration/migrate-block/SKILL.md` | Per-block scoop skill |
| `migration/migrate-block/manifest.yaml` | Skill metadata |
| `migration/migrate-header/SKILL.md` | Header/nav scoop skill |
| `migration/migrate-header/manifest.yaml` | Skill metadata |
| `migration/dismiss-overlays/SKILL.md` | Overlay detection reference |
| `migration/dismiss-overlays/manifest.yaml` | Skill metadata |
| `README.md` | Repo overview, installation, skill descriptions |

### Source → Output Mapping

| Source (slicc worktree) | Output | Adaptation |
|------------------------|--------|------------|
| `src/defaults/workspace/skills/migrate-page/SKILL.md` | `migration/migrate-page/SKILL.md` | Rewrite Phase 1, update script paths, remove Phase 5 |
| `src/defaults/workspace/skills/migrate-block/SKILL.md` | `migration/migrate-block/SKILL.md` | Copy as-is |
| `src/defaults/workspace/skills/migrate-header/SKILL.md` | `migration/migrate-header/SKILL.md` | Copy as-is |
| `src/defaults/workspace/skills/dismiss-overlays/SKILL.md` | `migration/dismiss-overlays/SKILL.md` | Copy as-is |
| `src/migration/scripts/visual-tree-script.ts` | `migration/migrate-page/scripts/visual-tree.js` | Unwrap IIFE from TS string constant |
| `src/migration/scripts/brand-script.ts` | `migration/migrate-page/scripts/brand-extract.js` | Unwrap IIFE from TS string constant |
| `src/migration/scripts/metadata-script.ts` | `migration/migrate-page/scripts/metadata-extract.js` | Unwrap IIFE from TS string constant |
| `src/migration/scripts/page-prep-script.ts` | `migration/migrate-page/scripts/page-prep.js` | Unwrap IIFE from TS string constant |
| `src/migration/scripts/overlay-dismiss-script.ts` | `migration/migrate-page/scripts/overlay-dismiss.js` | Unwrap IIFE from TS string constant |
| `src/migration/block-inventory.ts` | `migration/migrate-page/scripts/block-inventory.js` | Rewrite to use `fs` globals |
| `src/defaults/workspace/scripts/generate-scoop-prompts.js` | `migration/migrate-page/scripts/generate-scoop-prompts.js` | Update script paths in prompt text |

---

## Chunk 1: Extraction Scripts (browser evaluate)

These 5 scripts are self-contained IIFEs extracted from TypeScript string
constants. Each file becomes the IIFE itself — no wrapper, no exports.

### Task 1: Extract visual-tree.js

**Files:**
- Read: `{source}/src/migration/scripts/visual-tree-script.ts`
- Create: `migration/migrate-page/scripts/visual-tree.js`

- [ ] **Step 1: Read the source file**

Read `/Users/catalan/repos/ai/ai-ecoverse/slicc/.claude/worktrees/feat-vibemigration-flavor/src/migration/scripts/visual-tree-script.ts`

The file exports `VISUAL_TREE_SCRIPT` — a template literal containing the IIFE.

- [ ] **Step 2: Extract the IIFE and write the output file**

Extract the content between the backticks in `export const VISUAL_TREE_SCRIPT = \`...\``.
The TS file uses escaped backslashes for the string template (e.g., `\\\\` in
the TS becomes `\\` in the actual JS). Since this is a template literal,
the content between backticks IS the runtime JavaScript — write it directly.

Write to `migration/migrate-page/scripts/visual-tree.js`.
The file should start with `(function() {` and end with `})();`.

- [ ] **Step 3: Verify the file is valid JS**

Run: `node --check migration/migrate-page/scripts/visual-tree.js`
Expected: No output (valid syntax).

### Task 2: Extract brand-extract.js

**Files:**
- Read: `{source}/src/migration/scripts/brand-script.ts`
- Create: `migration/migrate-page/scripts/brand-extract.js`

- [ ] **Step 1: Read source and extract IIFE**

Read the source. Extract content from `export const BRAND_EXTRACT_SCRIPT = \`...\``.

- [ ] **Step 2: Write output file**

Write to `migration/migrate-page/scripts/brand-extract.js`.
Starts with `(function() {`, ends with `})()`.

- [ ] **Step 3: Verify syntax**

Run: `node --check migration/migrate-page/scripts/brand-extract.js`

### Task 3: Extract metadata-extract.js

**Files:**
- Read: `{source}/src/migration/scripts/metadata-script.ts`
- Create: `migration/migrate-page/scripts/metadata-extract.js`

- [ ] **Step 1: Read source and extract IIFE**

Extract from `export const METADATA_EXTRACT_SCRIPT = \`...\``.

- [ ] **Step 2: Write output file**

Write to `migration/migrate-page/scripts/metadata-extract.js`.
Starts with `(function () {`, ends with `})()`.

- [ ] **Step 3: Verify syntax**

Run: `node --check migration/migrate-page/scripts/metadata-extract.js`

### Task 4: Extract page-prep.js

**Files:**
- Read: `{source}/src/migration/scripts/page-prep-script.ts`
- Create: `migration/migrate-page/scripts/page-prep.js`

- [ ] **Step 1: Read source and extract IIFE**

Extract from `export const PAGE_PREP_SCRIPT = \`...\``.
This one is an async IIFE: `(async () => { ... })()`.

- [ ] **Step 2: Write output file**

Write to `migration/migrate-page/scripts/page-prep.js`.

- [ ] **Step 3: Verify syntax**

Run: `node --check migration/migrate-page/scripts/page-prep.js`

### Task 5: Extract overlay-dismiss.js

**Files:**
- Read: `{source}/src/migration/scripts/overlay-dismiss-script.ts`
- Create: `migration/migrate-page/scripts/overlay-dismiss.js`

- [ ] **Step 1: Read source and extract IIFE**

Extract from `export const OVERLAY_DISMISS_SCRIPT = \`...\``.
Async IIFE: `(async () => { ... })()`.

- [ ] **Step 2: Write output file**

Write to `migration/migrate-page/scripts/overlay-dismiss.js`.

- [ ] **Step 3: Verify syntax**

Run: `node --check migration/migrate-page/scripts/overlay-dismiss.js`

### Task 6: Commit extraction scripts

- [ ] **Step 1: Commit**

```bash
git add migration/migrate-page/scripts/visual-tree.js \
       migration/migrate-page/scripts/brand-extract.js \
       migration/migrate-page/scripts/metadata-extract.js \
       migration/migrate-page/scripts/page-prep.js \
       migration/migrate-page/scripts/overlay-dismiss.js
git commit -m "feat: add browser extraction scripts for page migration"
```

---

## Chunk 2: Agent-Context Scripts (JS tool)

These scripts run in Slicc's JavaScript tool context with `fs` globals available.

### Task 7: Create block-inventory.js

**Files:**
- Read: `{source}/src/migration/block-inventory.ts`
- Create: `migration/migrate-page/scripts/block-inventory.js`

- [ ] **Step 1: Read the TypeScript source**

Read `/Users/catalan/repos/ai/ai-ecoverse/slicc/.claude/worktrees/feat-vibemigration-flavor/src/migration/block-inventory.ts`

This is a TypeScript function `scanBlockInventory(fs, projectPath)` that takes
a VirtualFS instance. We need to rewrite it to use `fs` globals directly
(Slicc's JavaScript tool provides `fs.readDir`, `fs.readFile`, `fs.stat`).

- [ ] **Step 2: Write the adapted script**

Write to `migration/migrate-page/scripts/block-inventory.js`:

```javascript
/**
 * Scan an EDS project's blocks/ directory for available blocks.
 *
 * Runs in Slicc's JavaScript tool context (fs globals available).
 *
 * Usage:
 *   const blocks = await scanBlockInventory('/shared/repo-name');
 *   return JSON.stringify(blocks);
 */
async function scanBlockInventory(projectPath) {
  var blocksDir = projectPath + '/blocks';
  var entries = [];

  var dirEntries;
  try {
    dirEntries = await fs.readDir(blocksDir);
  } catch (e) {
    return entries;
  }

  for (var i = 0; i < dirEntries.length; i++) {
    var entry = dirEntries[i];
    if (entry.type !== 'directory') continue;

    var name = entry.name;
    var blockDir = blocksDir + '/' + name;

    var files;
    try {
      files = await fs.readDir(blockDir);
    } catch (e) {
      continue;
    }

    var hasJs = files.some(function(f) { return f.name === name + '.js'; });
    var hasCss = files.some(function(f) { return f.name === name + '.css'; });

    if (!hasJs && !hasCss) continue;

    var jsSize;
    var cssSize;

    if (hasJs) {
      var jsContent = await fs.readFile(blockDir + '/' + name + '.js', { encoding: 'utf-8' });
      jsSize = jsContent.length;
    }

    if (hasCss) {
      var cssContent = await fs.readFile(blockDir + '/' + name + '.css', { encoding: 'utf-8' });
      cssSize = cssContent.length;
    }

    entries.push({ name: name, hasJs: hasJs, hasCss: hasCss, jsSize: jsSize, cssSize: cssSize });
  }

  return entries;
}

if (typeof module !== 'undefined') module.exports = { scanBlockInventory };
```

- [ ] **Step 3: Verify syntax**

Run: `node --check migration/migrate-page/scripts/block-inventory.js`

### Task 8: Adapt generate-scoop-prompts.js

**Files:**
- Read: `{source}/src/defaults/workspace/scripts/generate-scoop-prompts.js`
- Create: `migration/migrate-page/scripts/generate-scoop-prompts.js`

- [ ] **Step 1: Read the source**

Read `/Users/catalan/repos/ai/ai-ecoverse/slicc/.claude/worktrees/feat-vibemigration-flavor/src/defaults/workspace/scripts/generate-scoop-prompts.js`

- [ ] **Step 2: Write the adapted script**

Copy the source with these changes to the generated prompt text:
- In `buildBlockPrompt()`: change "Read and execute the migrate-block skill at your workspace"
  to include explicit path: "Read /workspace/skills/migrate-block/SKILL.md and follow every step."
- In `buildHeaderPrompt()`: same pattern for migrate-header:
  "Read /workspace/skills/migrate-header/SKILL.md and follow it exactly."
- In `buildFooterPrompt()`: same pattern for migrate-block:
  "Read /workspace/skills/migrate-block/SKILL.md and follow every step."

Write to `migration/migrate-page/scripts/generate-scoop-prompts.js`.

- [ ] **Step 3: Verify syntax**

Run: `node --check migration/migrate-page/scripts/generate-scoop-prompts.js`

### Task 9: Commit agent-context scripts

- [ ] **Step 1: Commit**

```bash
git add migration/migrate-page/scripts/block-inventory.js \
       migration/migrate-page/scripts/generate-scoop-prompts.js
git commit -m "feat: add agent-context scripts (block inventory, scoop prompts)"
```

---

## Chunk 3: Standalone Skills (no changes from source)

Three skills that are copied as-is from the source.

### Task 10: Create migrate-block skill

**Files:**
- Read: `{source}/src/defaults/workspace/skills/migrate-block/SKILL.md`
- Create: `migration/migrate-block/SKILL.md`
- Create: `migration/migrate-block/manifest.yaml`

- [ ] **Step 1: Copy SKILL.md**

Read the source and write to `migration/migrate-block/SKILL.md`. No changes.

- [ ] **Step 2: Create manifest.yaml**

Write to `migration/migrate-block/manifest.yaml`:

```yaml
skill: migrate-block
version: 1.0.0
description: Migrate a single block to EDS (used by scoops)
author: aemcoder
```

### Task 11: Create migrate-header skill

**Files:**
- Read: `{source}/src/defaults/workspace/skills/migrate-header/SKILL.md`
- Create: `migration/migrate-header/SKILL.md`
- Create: `migration/migrate-header/manifest.yaml`

- [ ] **Step 1: Copy SKILL.md**

Read the source and write to `migration/migrate-header/SKILL.md`. No changes.

- [ ] **Step 2: Create manifest.yaml**

Write to `migration/migrate-header/manifest.yaml`:

```yaml
skill: migrate-header
version: 1.0.0
description: Migrate header/navigation to EDS (used by scoops)
author: aemcoder
```

### Task 12: Create dismiss-overlays skill

**Files:**
- Read: `{source}/src/defaults/workspace/skills/dismiss-overlays/SKILL.md`
- Create: `migration/dismiss-overlays/SKILL.md`
- Create: `migration/dismiss-overlays/manifest.yaml`

- [ ] **Step 1: Copy SKILL.md**

Read the source and write to `migration/dismiss-overlays/SKILL.md`. No changes.

- [ ] **Step 2: Create manifest.yaml**

Write to `migration/dismiss-overlays/manifest.yaml`:

```yaml
skill: dismiss-overlays
version: 1.0.0
description: Dismiss cookie banners, GDPR consent, and overlays
author: aemcoder
```

### Task 13: Commit standalone skills

- [ ] **Step 1: Commit**

```bash
git add migration/migrate-block/ migration/migrate-header/ migration/dismiss-overlays/
git commit -m "feat: add migrate-block, migrate-header, dismiss-overlays skills"
```

---

## Chunk 4: migrate-page Skill (refactored)

The main skill with the most changes: Phase 1 rewrite, path updates, Phase 5 removal.

### Task 14: Create migrate-page SKILL.md

**Files:**
- Read: `{source}/src/defaults/workspace/skills/migrate-page/SKILL.md`
- Create: `migration/migrate-page/SKILL.md`

- [ ] **Step 1: Read the source SKILL.md**

Read `/Users/catalan/repos/ai/ai-ecoverse/slicc/.claude/worktrees/feat-vibemigration-flavor/src/defaults/workspace/skills/migrate-page/SKILL.md`

- [ ] **Step 2: Write the adapted SKILL.md**

Apply these changes:

**Frontmatter:** Change `allowed-tools` from `migrate_page,browser,read_file,write_file,edit_file,bash` to `browser,read_file,write_file,edit_file,bash,javascript`

**Phase 1: Extraction** — Replace entirely. The original says "call `migrate_page` tool".
Replace with 12 explicit steps using existing Slicc tools:

```markdown
## Phase 1: Extraction

User provides a URL and a GitHub repo (owner/repo).

### Step 1.1: Clone and Branch

Clone the repo and create a migration branch:

```
bash: git clone https://github.com/{owner}/{repo}.git /shared/{repo-name} --depth 1
bash: cd /shared/{repo-name} && git checkout -b migrate/{page-slug}-{timestamp}
bash: mkdir -p /shared/{repo-name}/.migration
```

Where `{page-slug}` is derived from the URL path (e.g., `/products/widget` → `products-widget`)
and `{timestamp}` is a short identifier (e.g., `Date.now().toString(36)`).

### Step 1.2: Navigate to Source Page

Open the source URL in a new browser tab:

```json
{ "action": "new_tab", "url": "{sourceUrl}" }
```

### Step 1.3: Raw Screenshot

Capture the page BEFORE any modifications — this shows overlays as visitors see them:

```json
{ "action": "screenshot", "fullPage": true,
  "path": "/shared/{repo-name}/.migration/screenshot-raw.png" }
```

### Step 1.4: Dismiss Overlays

Read the overlay dismissal script and run it in the page:

```json
{ "action": "evaluate", "expression": "<content of /workspace/skills/migrate-page/scripts/overlay-dismiss.js>" }
```

Save the result to `/shared/{repo-name}/.migration/overlay-recipe.json`.

### Step 1.5: Page Preparation

Read and run the page prep script (fixes fixed-position elements, scrolls for lazy-load):

```json
{ "action": "evaluate", "expression": "<content of /workspace/skills/migrate-page/scripts/page-prep.js>" }
```

### Step 1.6: Clean Screenshot

Capture the page after preparation:

```json
{ "action": "screenshot", "fullPage": true,
  "path": "/shared/{repo-name}/.migration/screenshot.png" }
```

### Step 1.7: Extract Visual Tree

Read and run the visual tree extraction script:

```json
{ "action": "evaluate", "expression": "<content of /workspace/skills/migrate-page/scripts/visual-tree.js>" }
```

Save the result to `/shared/{repo-name}/.migration/visual-tree.json`.

### Step 1.8: Extract Brand Data

Read and run the brand extraction script:

```json
{ "action": "evaluate", "expression": "<content of /workspace/skills/migrate-page/scripts/brand-extract.js>" }
```

Save the result to `/shared/{repo-name}/.migration/brand.json`.

### Step 1.9: Extract Metadata

Read and run the metadata extraction script:

```json
{ "action": "evaluate", "expression": "<content of /workspace/skills/migrate-page/scripts/metadata-extract.js>" }
```

Save the result to `/shared/{repo-name}/.migration/metadata.json`.

### Step 1.10: Scan Block Inventory

Read the block inventory script and run it via the JavaScript tool:

```javascript
const script = await fs.readFile('/workspace/skills/migrate-page/scripts/block-inventory.js', { encoding: 'utf-8' });
eval(script);
const blocks = await scanBlockInventory('/shared/{repo-name}');
await fs.writeFile('/shared/{repo-name}/.migration/block-inventory.json', JSON.stringify(blocks, null, 2));
return JSON.stringify({ blockCount: blocks.length, blocks: blocks.map(b => b.name) });
```

### Extraction Artifacts

After Phase 1, these files exist in `/shared/{repo-name}/.migration/`:

| Artifact | Purpose |
|----------|---------|
| `screenshot-raw.png` | Full-page screenshot before modifications (for overlay check) |
| `screenshot.png` | Full-page screenshot after prep (for decomposition) |
| `visual-tree.json` | Spatial hierarchy (bounds, backgrounds, selectors) |
| `brand.json` | Fonts, colors, spacing |
| `metadata.json` | Title, description, OG tags |
| `block-inventory.json` | Existing blocks in the EDS project |
| `overlay-recipe.json` | Overlay dismiss actions from heuristic detection |
```

**Phase 3:** Update the script read path in the JavaScript code block:
- Change `/workspace/scripts/generate-scoop-prompts.js`
  to `/workspace/skills/migrate-page/scripts/generate-scoop-prompts.js`

**Phase 5:** Remove the entire "Phase 5: DA Upload (Optional)" section
and all references to DA upload in Phase 4.7 (change "Ask: Would you like
me to upload to DA?" to just end the summary).

**"Four Phases" overview** (near top of file, before Phase 1): Update
`1. **Extraction** — call \`migrate_page\` tool` to
`1. **Extraction** — clone repo, navigate to URL, run extraction scripts`.

**Phase 1.5:** Update the sentence "The `migrate_page` tool runs heuristic
overlay detection, but it may miss custom overlays" to "Phase 1 runs heuristic
overlay detection, but it may miss custom overlays".

**All other phases** (2, 2.5, 3 rest, 4): Keep as-is from source.

- [ ] **Step 3: Create manifest.yaml**

Write to `migration/migrate-page/manifest.yaml`:

```yaml
skill: migrate-page
version: 1.0.0
description: Migrate a web page to AEM Edge Delivery Services
author: aemcoder
depends:
  - migrate-block
  - migrate-header
  - dismiss-overlays
```

### Task 15: Commit migrate-page skill

- [ ] **Step 1: Commit**

```bash
git add migration/migrate-page/SKILL.md migration/migrate-page/manifest.yaml
git commit -m "feat: add migrate-page cone orchestration skill"
```

---

## Chunk 5: README and Final Verification

### Task 16: Create README.md

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

Write `README.md` with:
- Package name and one-line description
- Installation command (`upskill aemcoder/skills --path migration --all`)
- Skill list with brief descriptions
- Usage: what prompt triggers migration (e.g., "migrate https://example.com to owner/repo")
- Requirements (Slicc with browser tool, GitHub access, scoop system)
- License reference

### Task 17: Verify complete structure

- [ ] **Step 1: Verify all files exist**

Run: `find migration/ -type f | sort`

Expected output:
```
migration/dismiss-overlays/SKILL.md
migration/dismiss-overlays/manifest.yaml
migration/migrate-block/SKILL.md
migration/migrate-block/manifest.yaml
migration/migrate-header/SKILL.md
migration/migrate-header/manifest.yaml
migration/migrate-page/SKILL.md
migration/migrate-page/manifest.yaml
migration/migrate-page/scripts/block-inventory.js
migration/migrate-page/scripts/brand-extract.js
migration/migrate-page/scripts/generate-scoop-prompts.js
migration/migrate-page/scripts/metadata-extract.js
migration/migrate-page/scripts/overlay-dismiss.js
migration/migrate-page/scripts/page-prep.js
migration/migrate-page/scripts/visual-tree.js
```

- [ ] **Step 2: Verify all JS files have valid syntax**

Run: `find migration/ -name "*.js" -exec node --check {} \;`
Expected: No output (all valid).

- [ ] **Step 3: Verify manifest.yaml files parse correctly**

Run for each: `node -e "const fs=require('fs'); console.log(fs.readFileSync('migration/migrate-page/manifest.yaml','utf8'))"`
Verify: each has `skill:` and `version:` fields.

- [ ] **Step 4: Verify SKILL.md files have frontmatter**

Run: `head -5 migration/*/SKILL.md`
Verify: each starts with `---` and has `name:` and `description:`.

- [ ] **Step 5: Verify no references to removed items**

Run: `grep -r "migrate_page\|da-upload\|da_upload\|Phase 5\|DA Upload" migration/`
Expected: No matches (or only in historical context, not as active instructions).

- [ ] **Step 6: Verify script paths are correct**

Run: `grep -r "/workspace/scripts/" migration/`
Expected: No matches. All script paths should use `/workspace/skills/migrate-page/scripts/`.

### Task 18: Final commit

- [ ] **Step 1: Commit README**

```bash
git add README.md
git commit -m "docs: add README with installation and usage instructions"
```

- [ ] **Step 2: Verify clean state**

Run: `git status`
Expected: nothing to commit, working tree clean.

Run: `git log --oneline`
Expected: 5-6 commits (spec + 4 feature commits + README).
