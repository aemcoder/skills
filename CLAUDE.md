# CLAUDE.md

Instructions for developing and maintaining skills in this repository.

## Repository Structure

```
migration/
  migrate-page/SKILL.md      Cone-only: orchestrates full page migration
  migrate-block/SKILL.md     Scoop: migrates a single block with visual verification
  migrate-header/SKILL.md    Scoop: migrates header/nav with EDS header block pattern
  dismiss-overlays/SKILL.md  Reference: overlay dismissal patterns
docs/specs/                  Design docs and implementation plans
```

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

# serve also returns a targetId
serve --entry drafts/hero-preview.html --project /shared/my-site
# Output: "serving ... (targetId: <targetId>)"
# Capture <targetId> as {previewTabId}
```

**Use --tab on every command:**

```bash
playwright-cli eval --tab={sourceTabId} "document.title"
playwright-cli screenshot --tab={previewTabId} --max-width=1440 --filename out.png
playwright-cli snapshot --tab={previewTabId}
playwright-cli goto --tab={previewTabId} {url}
playwright-cli tab-close --tab={sourceTabId}
```

Commands without --tab: `tab-list` (lists all tabs), `tab-new` (creates a tab).

### Serve-Once + Reload Pattern

For EDS block/page preview testing:

1. Call `serve --project` **once** to open the preview tab
2. Capture both the `targetId` and the `previewUrl` from output
3. After editing CSS/JS, reload with `goto --tab={previewTabId} {previewUrl}`
4. Do NOT re-run `serve` for each iteration

If the preview tab is closed or `--tab` fails with an invalid target,
re-run `serve` to get a new tab and targetId.

### EDS Project Serve Mode

`serve --project <dir>` enables root-relative path resolution in the
preview service worker. Paths like `/styles/styles.css` resolve against
the project directory in VFS, emulating a local dev server.

The `?projectRoot=` query parameter is appended automatically by `serve`.
When reloading with `goto`, reuse the full preview URL (which includes
the query parameter) so project mode stays active.

## Skill Authoring Rules

- Skills are SKILL.md files with YAML frontmatter (`name`, `description`, `allowed-tools`)
- Slicc discovers skills at `/workspace/skills/{name}/SKILL.md` (one level deep)
- Installation via `upskill aemcoder/skills --path migration --all`
- Skills reference Slicc shell commands (`playwright-cli`, `serve`, `bash`) not raw APIs
- Wrap `eval` calls in IIFEs to avoid variable redeclaration across calls
- Use `fs.fetchToFile(url, path)` for binary downloads, never `fs.writeFile()` with binary data

## Testing Skills from a Branch

Once slicc PR #197 lands, install skills from a non-default branch:

```bash
upskill aemcoder/skills@fix/my-branch --path migration --all
```
