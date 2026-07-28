# CLAUDE.md

Instructions for developing and maintaining skills in this repository.

## Repository Structure

```
skills/migration/
  migrate-page/SKILL.md      Cone-only: orchestrates full page migration
  migrate-block/SKILL.md     Scoop: migrates a single block with visual verification
  migrate-header/SKILL.md    Scoop: migrates header/nav with EDS header block pattern
  dismiss-overlays/SKILL.md  Reference: overlay dismissal patterns
docs/specs/                  Design docs and implementation plans
```

Skills live under a top-level `skills/` directory (Anthropic skills convention),
with `migration/` as a category subdir. Install commands target
`--path skills/migration`. Slicc's `upskill` flattens the inner skill folders
into `/workspace/skills/<name>/` at runtime — so internal references like
`/workspace/skills/migrate-page/scripts/...` are unaffected by the source layout.

## Slicc Browser Automation Conventions

Skills run inside Slicc and use `playwright-cli` for browser automation.

### Stateless Tab Targeting (since slicc PR #188)

Every `playwright-cli` command that operates on a tab requires explicit
`--tab <targetId>`. There is no implicit "current tab".

**Capture targetId from output:**

```bash
# tab-new returns a targetId
playwright-cli tab-new https://example.com
# Output: "Created tab <targetId> at https://example.com"
# Capture <targetId> as {sourceTabId}

# open also returns a targetId (and does NOT broadcast/steal focus)
open /shared/my-site/drafts/hero-preview.html
# Output: "... (targetId: <targetId>)"
# Capture <targetId> as {previewTabId}
```

**Use --tab on every command:**

```bash
playwright-cli eval --tab={sourceTabId} "document.title"
playwright-cli screenshot --tab={previewTabId} --max-width=1440 --filename=out.png
playwright-cli snapshot --tab={previewTabId}
playwright-cli goto --tab={previewTabId} {url}
playwright-cli tab-close --tab={sourceTabId}
```

Commands without --tab: `tab-list` (lists all tabs), `tab-new` (creates a tab).

### Open + Reload Pattern (local EDS preview)

For EDS block/page preview testing:

1. Call `open` **once** to open the preview tab
2. Capture both the `targetId` and the `previewUrl` from output
3. After editing CSS/JS, reload with `goto --tab={previewTabId} {previewUrl}`
4. Do NOT re-run `open` for each iteration

If the preview tab is closed or `--tab` fails with an invalid target,
re-run `open` to get a new tab and targetId.

`serve` is only for *sharing* a preview with followers — it broadcasts and
force-opens a focused tab; use `open` for self-verification.

### EDS Preview Path Resolution

Under unified preview, root-absolute paths (`/styles/styles.css`,
`/scripts/...`, `/drafts/images/...`) resolve natively against the project in
VFS — no flag required. The old `serve --project <dir>` flag is **obsolete
and ignored** (kept as a no-op for backward compatibility), and the bare
`open <preview-file>` command auto-detects the projectRoot the same way and
appends the `?projectRoot=` query parameter itself. This parameter may still
appear in the preview URL; when reloading with `goto`, reuse the full preview
URL as returned by `open`.

### CLI gotchas

- **`serve --project` is obsolete and ignored.** Root-absolute paths resolve
  natively under unified preview; omit the flag. (Historically it was a
  boolean flag with the directory as a positional argument.)
- **`git clone --depth 1` breaks downstream git operations.** Shallow
  clones cause failures when creating branches or running git commands
  later in a migration. Always clone without `--depth`:
  `git clone https://github.com/owner/repo.git /path/to/target`.
- **Slicc's `node` bridges standard Node FS APIs (since ~2026-07-20).**
  `require('fs')`, `require('node:fs')`, and `require('fs/promises')`
  return a unified bridge: async methods are RPC-backed to the VFS, sync
  methods hit a coherent local cache flushed back after the script
  exits. Skill scripts run with `node <file.js>` must use standard
  `require('node:fs')`-style APIs — never the legacy VFS globals
  (`fs.readDir`, bare `fs`), which don't exist under real node (PLG
  labs) and are no longer needed under Slicc.
  Prefer the **synchronous** methods for writes you depend on — only the sync
  cache is guaranteed to flush on exit; async writes can race bridge teardown.
  Also avoid `readdirSync(..., { withFileTypes: true })` (no `Dirent` objects
  in the bridge) and `child_process`.

## Migration Skill Architecture

These architectural choices aren't obvious from reading the code — they
come from Slicc's execution model and explicit scope decisions:

- **No `migrate_page` custom tool.** Phase 1 uses explicit browser/bash
  steps instead of a Slicc tool. Keeps the skill self-contained and
  inspectable.
- **No DA upload (Phase 5 removed).** Skills stop at local preview + git
  commit; DA upload is a separate concern handled outside the skill.
- **Cone-only execution.** The cone (parent agent) orchestrates
  everything except Phase 3 block generation, which dispatches scoops in
  parallel. Scoops cannot create other scoops, so anything that needs to
  spawn sub-agents must live in the cone.
- **`dismiss-overlays` owns its `overlay-dismiss.js`.** The script is
  co-located with the skill that defines the behavior, not bundled into
  `migrate-page/scripts/`. Other skills delegate to `dismiss-overlays`
  rather than duplicating the script.

## Skill Authoring Rules

- Skills are SKILL.md files with YAML frontmatter (`name`, `description`, `allowed-tools`)
- Slicc discovers skills at `/workspace/skills/{name}/SKILL.md` (one level deep)
- Installation via `upskill aemcoder/skills --path skills/migration --all`
- Skills reference Slicc shell commands (`playwright-cli`, `open`, `serve`, `bash`) not raw APIs
- Wrap `eval` calls in IIFEs to avoid variable redeclaration across calls
- Use `fs.fetchToFile(url, path)` for binary downloads (JS tool context,
  not node scripts), never `fs.writeFile()` with binary data

## Testing Skills from a Branch

Once slicc PR #197 lands, install skills from a non-default branch:

```bash
upskill aemcoder/skills@fix/my-branch --path skills/migration --all
```
