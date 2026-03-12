# Design: Slicc Page Migration Skills Package

## Context

**Slicc** is a browser-based AI coding agent that runs as a Chrome extension or
standalone CLI. Source: `ai-ecoverse/slicc` repo.

Key concepts:
- **Cone** — the main orchestrator agent. Has full filesystem access, all tools.
  Decomposes work and delegates to scoops.
- **Scoops** — isolated sub-agents. Each gets a sandboxed filesystem, own shell,
  own conversation. Created via `scoop_scoop`, fed prompts via `feed_scoop`.
- **VirtualFS** — POSIX-like async filesystem backed by IndexedDB. Skills live
  at `/workspace/skills/`. Not to be confused with Claude Code's `.claude/skills/`.
- **`upskill`** — Slicc shell command that installs skills from GitHub repos.
  Recursively scans for `SKILL.md` files via the GitHub Contents API, copies
  the containing directory to `/workspace/skills/<name>/`.
- **`manifest.yaml`** — Slicc's skill metadata format. Parsed by
  `src/skills/manifest.ts`. Supports `depends`, `conflicts`, `adds`, `modifies`.

Source material for this package lives on the `feat/migrate-page-design` branch
of `ai-ecoverse/slicc`, specifically:
- Skills: `src/defaults/workspace/skills/`
- Scripts: `src/defaults/workspace/scripts/`
- Extraction scripts: `src/migration/scripts/`
- Block inventory: `src/migration/block-inventory.ts`

## Summary

A self-contained skills package for Slicc that adds full AEM Edge Delivery
Services page migration. Ships as a GitHub repo installable via `upskill`.
No Slicc core changes required — the skills orchestrate extraction, decomposition,
block generation, and assembly using Slicc's existing tools (browser, bash,
read_file, write_file, JavaScript tool).

## Installation

```
upskill aemcoder/skills --path migration --all
```

Installs four skills into `/workspace/skills/` on Slicc's VirtualFS.

## Repo Structure

```
aemcoder/skills/
├── LICENSE
├── README.md
├── migration/
│   ├── migrate-page/
│   │   ├── SKILL.md
│   │   ├── manifest.yaml
│   │   └── scripts/
│   │       ├── visual-tree.js            # browser evaluate — DOM hierarchy
│   │       ├── brand-extract.js          # browser evaluate — fonts/colors/spacing
│   │       ├── metadata-extract.js       # browser evaluate — title/OG/JSON-LD
│   │       ├── page-prep.js              # browser evaluate — fix fixed-pos, lazy-load
│   │       ├── overlay-dismiss.js        # browser evaluate — cookie/consent banners
│   │       ├── block-inventory.js        # JS tool (fs global) — scan blocks/ dir
│   │       └── generate-scoop-prompts.js # JS tool (fs global) — build scoop configs
│   ├── migrate-block/
│   │   ├── SKILL.md
│   │   └── manifest.yaml
│   ├── migrate-header/
│   │   ├── SKILL.md
│   │   └── manifest.yaml
│   └── dismiss-overlays/
│       ├── SKILL.md
│       └── manifest.yaml
```

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| No `migrate_page` tool dependency | Skills orchestrate extraction directly | Tool is on a feature branch, not Slicc main. Skills must work OOTB on any Slicc instance. |
| Scripts inside skill directories | `/workspace/skills/migrate-page/scripts/` | Self-contained. No external path dependencies. `upskill` copies the whole directory. |
| Skills under `migration/` subfolder | `upskill --path migration` | Repo can grow to include non-migration skill categories later. |
| No DA upload (Phase 5) | Removed | Out of scope for first iteration. Flow ends at Phase 4 (assembly + commit). |
| Extraction scripts as plain JS | Unwrapped from TypeScript string constants | They're already self-contained IIFEs. No build step needed. |

## Skills

### migrate-page (cone orchestration)

The main skill. Teaches the cone the 4-phase migration flow:

- **Phase 1: Extraction** — Clone repo, navigate to URL, run extraction scripts
  via browser evaluate, scan block inventory via JavaScript tool
- **Phase 1.5: Overlay verification** — Check raw screenshot, dismiss remaining
  overlays via browser click
- **Phase 2: Decomposition** — Classify visual tree into fragments/sections/blocks
- **Phase 2.5: Brand setup** — Resolve fonts, generate brand.css, update styles.css
  and head.html
- **Phase 3: Block generation** — One scoop per block, parallel. Uses
  generate-scoop-prompts.js to build prompts mechanically
- **Phase 4: Assembly** — Collect scoop results, assemble page, create preview,
  git commit, report to user

**Depends on:** migrate-block, migrate-header, dismiss-overlays

**Allowed tools:** `browser, read_file, write_file, edit_file, bash, javascript`

### migrate-block (scoop skill)

Per-block generation skill used by scoops. Steps:
1. Extract content from source page via browser
2. Download images
3. Write .plain.html content
4. Write block CSS and JS
5. Create preview page, serve with EDS project mode
6. Visual verification loop (max 3 iterations)
7. Write report to `.migration/reports/`

**No dependencies.** Standalone.

**Allowed tools:** `browser, read_file, write_file, edit_file, bash, javascript`

### migrate-header (scoop skill)

Header/nav-specific skill. Handles:
- Single-row and multi-section header detection
- nav.plain.html generation with section-metadata
- Dropdown type detection (simple vs mega)
- Mobile style selection (accordion, slide-in, fullscreen)
- Header CSS customization (`.header.block` specificity)
- Visual verification loop (max 5 iterations)

**No dependencies.** Standalone.

**Allowed tools:** `browser, read_file, write_file, edit_file, bash, javascript`

### dismiss-overlays (reference skill)

Reference documentation for overlay detection and dismissal. Contains:
- Vendor-specific selectors (OneTrust, Cookiebot, etc.)
- Inline dismissal script
- Notes on cookie persistence across tabs

**No dependencies.** Standalone.

**Allowed tools:** `browser`

## Script Execution Contexts

Two distinct contexts in Slicc:

### Browser evaluate (in-page DOM context)

Scripts that run inside the target web page. No `fs` access. Returns
JSON-serializable data.

| Script | Source | Purpose |
|--------|--------|---------|
| `visual-tree.js` | `src/migration/scripts/visual-tree-script.ts` | DOM spatial hierarchy with bounds, backgrounds, selectors, layout detection |
| `brand-extract.js` | `src/migration/scripts/brand-script.ts` | Fonts (body/heading + Typekit/Google sources), colors, spacing, favicons |
| `metadata-extract.js` | `src/migration/scripts/metadata-script.ts` | Title, description, OG tags, Twitter tags, JSON-LD |
| `page-prep.js` | `src/migration/scripts/page-prep-script.ts` | Convert fixed-position to relative, scroll to trigger lazy-load |
| `overlay-dismiss.js` | `src/migration/scripts/overlay-dismiss-script.ts` | Heuristic vendor detection + high-z-index overlay removal |

**Adaptation:** Unwrap from `export const SCRIPT_NAME = \`...\`` — the output
file IS the IIFE, nothing else.

### JavaScript tool (Slicc agent context)

Scripts that run via `node -e` or JavaScript tool. Have access to `fs` global
(VirtualFS bridge: readFile, writeFile, readDir, mkdir, rm, stat, exists).

| Script | Source | Purpose |
|--------|--------|---------|
| `block-inventory.js` | `src/migration/block-inventory.ts` | Scan EDS project's `blocks/` directory for available blocks |
| `generate-scoop-prompts.js` | `src/defaults/workspace/scripts/generate-scoop-prompts.js` | Build scoop creation configs from decomposition.json |

**Adaptation for block-inventory.js:** Rewrite from TypeScript class method to
standalone function using `fs` globals. Export `scanBlockInventory(projectPath)`.

**Adaptation for generate-scoop-prompts.js:** Update skill read paths in generated
prompt text (scoops read skills from `/workspace/skills/`). Update script read
path references from `/workspace/scripts/` to
`/workspace/skills/migrate-page/scripts/`.

## Refactored Phase 1: Extraction

Original Phase 1 was a single `migrate_page` tool call. Refactored to use
existing Slicc tools:

```
1.  git clone https://github.com/{owner}/{repo}.git /shared/{repo-name} --depth 1
2.  cd /shared/{repo-name} && git checkout -b migrate/{page-slug}-{timestamp}
3.  mkdir -p /shared/{repo-name}/.migration
4.  browser: new_tab + navigate to {sourceUrl}
5.  browser: screenshot (fullPage) → .migration/screenshot-raw.png
6.  Read + browser evaluate: overlay-dismiss.js → save .migration/overlay-recipe.json
7.  Read + browser evaluate: page-prep.js
8.  browser: screenshot (fullPage) → .migration/screenshot.png
9.  Read + browser evaluate: visual-tree.js → save .migration/visual-tree.json
10. Read + browser evaluate: brand-extract.js → save .migration/brand.json
11. Read + browser evaluate: metadata-extract.js → save .migration/metadata.json
12. JavaScript tool: block-inventory.js → save .migration/block-inventory.json
```

## Manifests

### migrate-page/manifest.yaml

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

### migrate-block/manifest.yaml

```yaml
skill: migrate-block
version: 1.0.0
description: Migrate a single block to EDS (used by scoops)
author: aemcoder
```

### migrate-header/manifest.yaml

```yaml
skill: migrate-header
version: 1.0.0
description: Migrate header/navigation to EDS (used by scoops)
author: aemcoder
```

### dismiss-overlays/manifest.yaml

```yaml
skill: dismiss-overlays
version: 1.0.0
description: Dismiss cookie banners, GDPR consent, and overlays
author: aemcoder
```

## SKILL.md Changes From Source

### migrate-page/SKILL.md

- Phase 1 rewritten (12 explicit steps replacing single tool call)
- `allowed-tools` frontmatter: remove `migrate_page`
- Phase 3 script path: `/workspace/skills/migrate-page/scripts/generate-scoop-prompts.js`
- Phase 5 (DA Upload) removed entirely
- All references to "the `migrate_page` tool" replaced with explicit instructions

### migrate-block/SKILL.md

No changes from source.

### migrate-header/SKILL.md

No changes from source.

### dismiss-overlays/SKILL.md

No changes from source.

## What Is NOT Included

- `migrate_page` tool (`src/tools/migrate-page-tool.ts`) — Slicc core concern
- `da-upload.js` — Phase 5 removed
- `git-push-migration.js` — was documentation-only
- TypeScript types (`src/migration/types.ts`) — scripts are plain JS
- Test files — skills are natural language, scripts are portable JS IIFEs

## Runtime Requirements

- Slicc instance with browser tool, bash, read_file, write_file, JavaScript tool
- GitHub access for `git clone` (public repos or configured token)
- Scoop system for parallel block generation (Phase 3)
