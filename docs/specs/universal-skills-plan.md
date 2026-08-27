# Plan: Universal Migration Skills

## Goal

Rewrite the migration skills (`migrate-page`, `migrate-block`,
`migrate-header`, `dismiss-overlays`) so they describe **intent** —
not tooling. The executing harness (Slicc, Claude Code, Cursor,
generic shell, etc.) decides how to fulfill each intent with
whatever tools it has available.

No HOST-NOTES. No "if Slicc, do X; if Claude Code, do Y." The skill
says what it needs; the LLM figures out how.

## Design Principle

**Intent over invocation.** A modern LLM in any harness knows how to:

- take a screenshot of a web page
- execute JavaScript in a browser tab
- download a file from a URL
- spawn parallel sub-agents

It does NOT need us to spell out `playwright-cli screenshot --tab={id}
--fullPage=true --max-width=1440 --filename=X`. It needs us to say:
"Take a full-page screenshot at desktop width, save to
`{projectPath}/.migration/screenshot.png`."

The scripts themselves (visual-tree.js, brand-extract.js, etc.) are
already universal — pure DOM APIs or standard Node. They stay as-is.
Only the SKILL.md prose that describes _how to invoke them_ changes.

## What Changes

### 1. Browser interaction vocabulary

Replace every `playwright-cli` command with intent-based language.
The skill uses a small set of browser capabilities:

| Intent verb | Meaning | Replaces |
| --- | --- | --- |
| **Open URL** `{url}` in the browser | Navigate to a URL, get a handle | `playwright-cli tab-new` |
| **Set viewport** to `{w}×{h}` | Resize the browser viewport | `playwright-cli resize` |
| **Screenshot** the page (full-page, max-width {w}), save to `{path}` | Full-page capture | `playwright-cli screenshot --fullPage` |
| **Screenshot element** `{selector}`, save to `{path}` | Element-level capture | `playwright-cli screenshot {ref\|selector}` |
| **Execute JS** in the page: `{code}` | Run script, return result | `playwright-cli eval` |
| **Execute JS file** `{path}` in the page | Run a .js file in page context, return result | `playwright-cli eval-file` |
| **Execute JS file** `{path}` in the page, save result to `{outPath}` | Run .js, write output to disk | `playwright-cli eval-file --output` |
| **Get accessibility snapshot** of the page | DOM/a11y tree | `playwright-cli snapshot` |
| **Close** the browser tab | Free resources | `playwright-cli tab-close` |
| **Reload** the page | Pick up file changes | `playwright-cli goto` |

Skills use these verbs in prose. Example:

**Before (Slicc-specific):**

```
playwright-cli tab-new {sourceUrl}
# Capture the targetId from the output
playwright-cli resize --tab={sourceTabId} 1440 900
playwright-cli eval-file --tab={sourceTabId} /workspace/skills/migrate-page/scripts/visual-tree.js --output=/shared/{repo-name}/.migration/visual-tree.json
```

**After (universal):**

```
Open {sourceUrl} in the browser.
Set the viewport to 1440×900 — extraction requires desktop width.
Execute {skillDir}/scripts/visual-tree.js in the page and save the
result to {projectPath}/.migration/visual-tree.json.
```

No tab IDs, no `--tab=` flags, no tool-specific syntax. The LLM
tracks its own handles however the harness works (tab IDs,
page objects, CDP sessions, etc.).

### 2. Orchestration model — remove cones/scoops

Replace Slicc's cone/scoop model with generic parallelism language.

**Before:** "Create one scoop per block via `scoop_scoop()`."
**After:** "Spawn one parallel sub-agent per block."

**Before:** "The cone MUST handle this — scoops cannot create scoops."
**After:** "This skill must be run by the orchestrating agent (top-level),
because block generation spawns parallel sub-agents."

**Before:** "`send_message` to the cone with JSON."
**After:** "Report completion to the orchestrator with this JSON payload: …"

**Before:** "`feed_scoop` provides these parameters."
**After:** "The orchestrator provides these parameters in the agent's prompt."

The completion protocol (JSON shape with `done`, `status`, `files`,
`issues`) stays — it's already generic. Just remove `send_message`
as the transport and say "report back to the orchestrator."

### 3. File paths — parameterize everything

Replace all hardcoded Slicc paths with two variables the skill
defines up front:

| Variable | Meaning | Replaces |
| --- | --- | --- |
| `{projectPath}` | Root of the cloned EDS repo | `/shared/{repo-name}` |
| `{skillDir}` | Root of this skill's directory | `/workspace/skills/migrate-page/` etc. |

These are already partially used. Finish the job:

- Replace every `/workspace/skills/migrate-page/scripts/` with `{skillDir}/scripts/`
- Replace every `/workspace/skills/migrate-block/scripts/` with the
  co-located skill's dir (or a relative reference, e.g. "the
  `verify-images.js` script shipped with `migrate-block`")
- Replace `/shared/{repo-name}` with `{projectPath}`

### 4. Remove Slicc VFS / node-bridge constraints

The entire "SLICC node-bridge constraints" block in migrate-page is
Slicc-specific. Remove it from the universal skill.

The scripts already work under standard Node (they're tested with
`smoke.sh` under real node). The constraints (no `withFileTypes`,
sync-only writes, no `child_process`, no `require.main`) only apply
to Slicc's bridge — a harness-level concern, not a skill concern.

If a harness has quirks, it should document them in its own adapter
layer — not in the skill.

### 5. Remove Slicc-specific features

| Feature | Action |
| --- | --- |
| Sprinkle trigger / lick handling section | Remove entirely |
| `sprinkle send` progress reporting | Replace with: "Update `{projectPath}/.migration/state.json` at each phase boundary" (already done partially) |
| `migrate-config.json` at `/workspace/skills/` | Move config to `{projectPath}/.migration/config.json` or drop entirely (the URL and repo are passed as parameters) |
| `open` vs `serve` distinction | Replace with: "Open the preview HTML in the browser" — one verb |
| `write: /.playwright/**` pre-authorization | Remove — harness manages its own permissions |
| Scoop sandbox / sudo / NOPASSWD discussion | Remove |

### 6. Image downloads — generic

**Before (Slicc VFS):**

```javascript
await fs.fetchToFile(url, path);
```

**After:**
"Download each image from its source URL to
`{projectPath}/drafts/images/`. Use binary-safe download (not
text-mode file write)."

The binary-safety warning is still useful — just frame it as a
general constraint, not a Slicc `fs.writeFile` quirk.

### 7. Script invocation — generic

The Node.js scripts (`block-inventory.js`, `generate-scoop-prompts.js`)
are invoked with `require(...)` calls tailored to Slicc's bridge.

**Before:**

```bash
node -e "require('/workspace/skills/migrate-page/scripts/block-inventory.js').writeBlockInventory('/shared/{repo-name}')"
```

**After:**

```
Run the block-inventory scanner:
  node {skillDir}/scripts/block-inventory.js {projectPath}
It writes {projectPath}/.migration/block-inventory.json.
```

The scripts already have CLI entry points (`process.argv` guards).
Under standard Node these work fine. Drop the `require(...)` form
and use the CLI form as primary.

### 8. Preview system — generic

The "EDS preview" step uses Slicc's `open` command which routes
through a service worker that resolves project-relative paths.

**Universal approach:** The skill already writes a self-contained
`-preview.html` file with all needed `<script>` and `<link>` tags.
The preview just needs to be served with root-relative path
resolution. Options (harness decides):

- A local dev server (`npx @adobe/aem-cli up`)
- A static file server from the project root
- Slicc's `open` with project mode
- Opening the file directly (if paths are absolute)

The skill says: "Serve the preview from `{projectPath}` and open
`drafts/{blockName}-preview.html` in the browser." The harness
picks the method.

## What Stays Unchanged

- **All `.js` scripts** — they're already universal DOM/Node code
- **EDS domain knowledge** — content models, decoration rules, CSS
  patterns, quality criteria — this is the skill's value, not
  harness-specific
- **The visual iteration loop** — conceptually the same everywhere:
  screenshot → compare → fix CSS → reload → repeat
- **Git operations** — standard git CLI
- **The report JSON schemas** — already generic
- **The completion message format** — already generic JSON
- **The decomposition logic** — pure reasoning over JSON

## Execution Order

Work bottom-up (leaf skills first, then the orchestrator):

### Phase 1: Leaf skills (no dependencies on other skills)

1. **dismiss-overlays** — smallest skill, good warmup.
   Remove `playwright-cli` commands, use intent verbs.

2. **migrate-block** — the workhorse.
   - Replace all `playwright-cli` with intent verbs
   - Replace `fs.fetchToFile` with generic download
   - Replace `/workspace/skills/` paths with `{skillDir}/`
   - Remove Slicc VFS/bridge warnings
   - Replace `send_message` with generic "report to orchestrator"
   - Replace `feed_scoop` parameters with "orchestrator provides"
   - Replace `read_file`/`write_file`/`edit_file` tool calls with
     generic "read/write/edit file" language
   - Keep all EDS domain knowledge intact

3. **migrate-header** — similar shape to migrate-block.
   Same changes, plus header-specific patterns stay.

### Phase 2: Orchestrator skill

1. **migrate-page** — the cone/orchestrator.
   - Remove the entire "Cone-Only Skill" / scoop model language
   - Remove the entire "Sprinkle Trigger" section
   - Remove sprinkle progress reporting
   - Replace scoop creation with generic "spawn parallel sub-agents"
   - Replace scoop monitoring with generic "wait for all agents"
   - Replace `/workspace/` and `/shared/` paths
   - Remove SLICC node-bridge constraints section
   - Replace `open` preview with generic "serve and open preview"
   - Keep Phase 1-4 structure (it's logical, not harness-specific)
   - Switch script invocation to CLI form

### Phase 3: Verification

1. **Smoke-test** that the rewritten skills still make sense when
   read by an LLM — the intent verbs should be unambiguous and the
   steps should flow logically without any harness-specific context.

2. **Cross-reference check** — migrate-page references
   migrate-block and migrate-header in the prompts it generates
   (`generate-scoop-prompts.js`). Verify the generated prompts
   still reference the right skill paths (now `{skillDir}/`-relative
   rather than `/workspace/skills/`-absolute).

3. **Update `generate-scoop-prompts.js`** — this script hardcodes
   `/workspace/skills/migrate-block/SKILL.md` and
   `/workspace/skills/migrate-header/SKILL.md` in the generated
   prompts. Change to relative references that work in any harness.

## Estimated Scope

| File | Change size | Notes |
| --- | --- | --- |
| `dismiss-overlays/SKILL.md` | Small | ~15 `playwright-cli` refs |
| `migrate-block/SKILL.md` | Large | ~40 `playwright-cli` refs + VFS + scoop comms |
| `migrate-header/SKILL.md` | Large | ~35 `playwright-cli` refs + scoop comms |
| `migrate-page/SKILL.md` | Large | ~20 `playwright-cli` refs + entire orchestration model |
| `generate-scoop-prompts.js` | Small | Path references in generated prompts |
| All `.js` browser scripts | None | Already universal |
| `block-inventory.js` | None | Already has CLI entry point |
| `manifest.yaml` files | None | Already generic |

## Resolved Decisions

1. **Capabilities frontmatter: YES.** Each skill declares a
   `requires` list in YAML frontmatter — e.g.
   `requires: [browser, parallel-agents, git, node]`. This lets a
   harness pre-check whether it can run the skill before starting.

2. **Sibling skill references: by name only.** migrate-page tells
   sub-agents "Read the `migrate-block` skill" — no paths. Trust the
   harness to resolve the skill name to its location.

3. **Preview serving: intent-only.** The skill says "Serve the
   project root as a static site and open
   `drafts/{blockName}-preview.html` in the browser." The harness
   picks the method (aem-cli, Slicc `open`, python http.server, etc.).
