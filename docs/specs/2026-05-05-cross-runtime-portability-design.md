# Cross-Runtime Skill Portability — Design Notes

**Date:** 2026-05-05
**Status:** Draft, pending validation
**Scope:** Make the migration skills (`migrate-page`, `migrate-block`, `migrate-header`, `dismiss-overlays`) runnable both inside Slicc and on a vanilla Claude Code (host OS) harness, without forking.

## Context

These skills were built for Slicc and assume its runtime: VFS at `/shared/` and `/workspace/`, custom orchestration tools (`scoop_scoop`, `feed_scoop`, `drop_scoop`, `send_message`, `sprinkle send`), `serve` binary, `fs.fetchToFile()` global, and a patched `playwright-cli` with `eval-file`, `--tab=`, `--output=`, `--fullPage=true`, `--max-width=` options. None of these exist on a stock Claude Code install.

A 2026-05-05 test migration of `https://www.astrazeneca.com/` against `adobe/aem-boilerplate` was run end-to-end on host OS by a Claude Code session adapting the SLICC-flavored skills on the fly. The migration completed (9 blocks rendered in preview, content faithful, brand colors transferred) but ~30% of the skill's intended workflow had to be skipped or hand-adapted, and many divergences were re-discovered independently by each parallel scoop. This doc captures (a) the concrete divergences observed, (b) what the agent ecosystem has solved (very little), (c) a proposed structural fix, and (d) a phased validation path.

## The Problem in One Paragraph

The skills weave instructional prose with calls to runtime-specific tools and paths. Outside Slicc, almost every code-fenced bash example fails, and the agent has to constantly reverse-engineer "what's the equivalent here". Sophisticated cone-style sessions can adapt; focused scoops with bounded prompts cannot. Parameterization (`{projectPath}`, `{sourceTabId}`) covered the easy 80%; the divergent **tool surfaces** — different CLIs, different fs APIs, different orchestration model — are the remaining 20% that breaks.

---

## 1. Concrete Divergences Observed

### 1.1 Missing orchestration primitives

| SLICC primitive | Claude Code substitute | Notes |
|---|---|---|
| `scoop_scoop({name, model, prompt})` | `Agent` tool with `run_in_background: true` | Agents are one-shot; can't be `feed_scoop`'d mid-run |
| `feed_scoop` | N/A — params baked into initial prompt | |
| `send_message` | Only Agent's final result string | No mid-stream messages |
| `drop_scoop` | Auto on Agent completion | No "keep alive for review" |
| `sprinkle send <skill> <json>` | None | UI widget not portable |
| `slicc.readFile/writeFile/setState/on('update')` | None | No state machine; no resumability |
| `read_file({path})` / `write_file({path, content})` | `Read` / `Write` | Direct mapping |
| `edit_file({...})` | `Edit` | Direct mapping |
| `serve --entry --project` | `npx -y @adobe/aem-cli up --html-folder drafts --port <p>` | EDS dev server |

### 1.2 VFS path assumptions

The skills reference `/shared/{repo-name}/...` 33 times and `/workspace/skills/...` 5 times. None of those paths exist on host OS. `playwright-cli` on host OS additionally has its own path sandbox (`allowed roots = project root + .playwright-cli`) that rejects `/tmp/...` writes — observed error:

```
Error: File access denied: /tmp/aem-migration/wrapped/run-visual-tree.js
is outside allowed roots. Allowed roots: <project>/.playwright-cli, <project>
```

### 1.3 Filesystem API divergence

Two helper scripts crash on plain Node 22:

- **`scripts/block-inventory.js`** uses `fs.readDir`, `fs.readFile`, `fs.writeFile` as globals. Node has none of these as globals; `fs.readDir` doesn't exist at all (it's `fs.readdir`, lowercase). Error: `ReferenceError: fs is not defined`.
- **`scripts/generate-scoop-prompts.js`** has the same pattern in its CLI tail (`if (process.argv[2])` block).
- **`migrate-block/SKILL.md:184`** mandates `fs.fetchToFile(url, path)` for binary downloads. This function exists only in Slicc. On host OS, **4 of 5 parallel scoops independently re-discovered** the workaround (`curl` with full Chrome User-Agent + `Referer: https://...` to bypass CloudFront).

### 1.4 Script-level portability bug

`scripts/visual-tree.js:649` ends with `})();` while the four sibling scripts (`lazy-load-scroll.js`, `de-sticky.js`, `metadata-extract.js`, `brand-extract.js`) end with `})()` (no trailing semicolon). When `playwright-cli eval "$(cat visual-tree.js)"` substitutes the content on host OS, the trailing `;` makes Playwright's expression-only `evaluate()` throw:

```
SyntaxError: Unexpected token ';'
  at eval (eval at evaluate (:302:30), <anonymous>:2:38)
```

Slicc's `eval-file` evidently wraps the body differently and tolerates this. **Fix: drop the trailing `;`.** Pure win, zero design cost.

### 1.5 `playwright-cli` CLI divergence

| Skill invocation | Host CLI reality | Adaptation used |
|---|---|---|
| `eval-file <script>` | Doesn't exist | `eval "$(cat script.js)"` |
| `--output=<path>` | Doesn't exist | `eval --filename=<path>` (saves *result*, allowed-root only) |
| `--tab=SRC123` (named targetId) | Numeric index: `tab-select 2`, `tab-close 1` | Use index |
| `--fullPage=true` | `--full-page` | Hyphenated, boolean flag |
| `--max-width=1440` | Not supported | Default viewport (1280) |
| `screenshot ... <ref>` (snapshot ref) | Supported but ref-extraction is non-trivial | `scrollIntoView()` + viewport screenshot |

`run-code --filename=<file>` exists, but its function context has **no `require`** (sandbox-style ESM VM), so reading source files via `fs` from inside the wrapper fails. The fallback is `eval --filename=<output-path>` with shell-substituted script content.

### 1.6 Skipped steps and their cost

The visual-verification loop (3 iterations per block, comparing source/preview screenshots and applying CSS fixes) was skipped because it requires per-block preview setup, which requires `serve`, which doesn't exist on host OS. **This is the largest quality gap** — uniform card sizing, approximate button styling, and unfixed spacing all trace to here.

Other steps skipped on host OS:

- Step 6b: per-block preview HTML
- Step 6c: EDS framework verification per block (`hlx`, `codeBasePath`, `bodyAppear`, `data-block-status`)
- Step 8: report writing to `.migration/reports/`
- Phase 1.3: `dismiss-overlays` (the cards scoop subsequently noticed the cookie banner occluding the source screenshot)
- Phase progress updates via `sprinkle send`
- `currentMigration` resumability via `migrate-config.json`

### 1.7 Subagent re-discovery cost

Because each parallel scoop got a self-contained prompt (no `feed_scoop`-style structured params with environment context), each scoop independently hit and worked around:

| Scoop | What it re-discovered |
|---|---|
| trending | CloudFront blocks plain curl UA → Chrome UA + `Referer` |
| cards | Same curl-UA discovery. Also noted source screenshot was occluded by `#CookieReportsPanel` cookie dialog. |
| nav-bar | Same curl-UA discovery (logo download). Took the cone's "9-item nav" decomposition note literally → added a phantom "R&D" item. |
| footer | Same curl-UA discovery. Chose inline SVG for social icons instead of the project's `/icons/*.svg` system because EDS renders icon-system icons as `<img>` tags that can't inherit `currentColor` against a dark bg — correct workaround. |

`fs.fetchToFile` in Slicc would have handled the curl-block centrally. A shared `download-image` helper in `scripts/` would collapse this duplicated work to one discovery.

---

## 2. Research Findings

Two parallel literature scans (Anthropic docs + broader agent ecosystem) produced one consistent conclusion: **no public solution matches this exact problem**.

### 2.1 Nothing in Anthropic's official skills docs

- [Agent Skills overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) and [best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices): describe SKILL.md as cross-platform but offer **no guidance on environment detection or conditional dispatch**.
- [Extend Claude with skills (Claude Code)](https://code.claude.com/docs/en/skills): mentions runtime varies based on user/admin settings and tool availability, but provides **no guidance on adapting**.
- [Equipping agents for the real world](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills): focuses on skill authoring, not portability.

### 2.2 Progressive disclosure ≠ conditional loading

Anthropic's "progressive disclosure" pattern (SKILL.md + `references/` folder) is purely a **token-efficiency** mechanism: reference files load only when Claude reads them by name. There's no built-in syntax for "load this file only if tool X is available." Useful as a structural foundation; not a dispatch mechanism on its own.

### 2.3 Closest existing project: Agentic Stack

[codejunkie99/agentic-stack](https://github.com/codejunkie99/agentic-stack) ("one brain, many harnesses") tackles knowledge portability across Claude Code, Cursor, Windsurf, OpenCode, Hermes, and others via a shared `.agent/` folder with a four-layer memory architecture and review-gated learning. **It does not solve tool-divergence** — it assumes broadly equivalent tool surfaces and focuses on shared memory.

### 2.4 MCP is orthogonal (but the right long-term mental model)

MCP's `initialize` handshake solves capability negotiation between hosts and tool servers, at the wire-protocol level ([MCP architecture](https://modelcontextprotocol.io/docs/learn/architecture)). A skill's prose can't query MCP. The right long-term mental model: a future where Slicc exposes itself as an MCP server, and a single skill talks to whichever MCP endpoint answers. That's a multi-quarter migration, not a near-term fix.

### 2.5 Framework-level prior art exists, none reusable from markdown

- **LangChain middleware** ([docs](https://docs.langchain.com/oss/python/langchain/middleware/built-in)) and **MCP adapters** ([reference](https://reference.langchain.com/python/langchain-mcp-adapters/tools)) support tool fallback at the Python orchestration layer. Not invokable from a SKILL.md body.
- **CrewAI** explicitly lacks native capability detection.
- **AutoGen / LlamaIndex**: same story — orchestration-layer adapters, not skill-level branching.

### 2.6 Unix precedent is 35 years old; nobody has imported it

The "probe a feature, not a version" idea is well-established:

- **Autoconf `try_compile`** ([Autoconf](https://en.wikipedia.org/wiki/Autoconf))
- **CMake System Inspection** ([Mastering CMake](https://cmake.org/cmake/help/book/mastering-cmake/chapter/System%20Inspection.html))
- **shell `command -v`**, **Python `importlib.util.find_spec`**, **npm `optionalDependencies`**

The bridge from these patterns into agent skills is obvious; nobody has built it.

### 2.7 Strongest design analog: Ansible

Ansible's `gather_facts` → `when: ansible_os_family == "Debian"` → `include_vars: with_first_found` is structurally identical to what we want ([Ansible conditionals](https://docs.ansible.com/projects/ansible/latest/playbook_guide/playbooks_conditionals.html), [OS-dependent tasks](https://ansible-tips-and-tricks.readthedocs.io/en/latest/os-dependent-tasks/variables/)):

```yaml
- name: detect host
  setup:
- name: load runtime-specific vars
  include_vars: "{{ item }}"
  with_first_found:
    - "vars/{{ ansible_os_family }}.yml"
    - "vars/default.yml"
- name: do the thing
  shell: ...
  when: ansible_pkg_mgr == "apt"
```

This is the design template.

### 2.8 One useful Anthropic-native primitive

Claude Code SKILL.md supports `` !`<shell-command>` `` inline ([Extend Claude with skills](https://code.claude.com/docs/en/skills)) — the command runs at skill-load time and its stdout is substituted into the prompt before the model sees it. This is the **only Claude-native execution mechanism that runs before the model reads the prompt**. It's the closest analog to Ansible's `gather_facts`.

```yaml
---
name: my-skill
description: ...
---

Available tools: !`command -v scoop_scoop && echo slicc || echo claude-code`

If `slicc`, follow path A. If `claude-code`, follow path B.
```

**Open question**: is `!`cmd`` supported in the Agent SDK / Claude API too, or only in Claude Code? If only Claude Code, the probe has to live as plain "run this command first" instructions in the body, with weaker execution guarantees (model might skip).

### 2.9 Capability-gated prompts: untested

Zero published evidence that LLMs reliably:

1. Run a probe and read its output
2. Keep the probe's conclusion consistent across a 50-step task
3. Avoid silently switching branches mid-task when reference files overlap in wording

This is the **largest unknown** in the proposed design. Failure modes are uncharacterized.

### 2.10 No prior community discussion

No HN/Reddit/GitHub-issues discussion of this exact problem. The [SKILL.md HN thread](https://news.ycombinator.com/item?id=46723183) and [SpecWeave's 39-agent compatibility analysis](https://spec-weave.com/docs/guides/agent-skills-extensibility-analysis/) discuss ecosystem governance and frontmatter portability across agents, not intra-skill conditional execution. **You are paving new ground.** Worth upstreaming once validated.

---

## 3. Proposed Design

Three-layer structure modeled on Ansible's `gather_facts + include_vars + when`.

### 3.1 File layout

```
migration/migrate-page/
├── SKILL.md                          # thin router: probe + dispatch
├── manifest.yaml
├── migrate-page.shtml                # Slicc sprinkle (gated; harmless on host OS)
├── scripts/
│   ├── detect-runtime.sh             # emits: slicc | claude-code | unknown
│   ├── visual-tree.js                # FIX: drop trailing semicolon
│   ├── lazy-load-scroll.js           # browser-context, env-agnostic
│   ├── de-sticky.js                  # browser-context, env-agnostic
│   ├── brand-extract.js              # browser-context, env-agnostic
│   ├── metadata-extract.js           # browser-context, env-agnostic
│   ├── block-inventory.slicc.js      # uses fs.readDir/etc globals
│   ├── block-inventory.node.js       # uses node:fs/promises
│   ├── generate-scoop-prompts.slicc.js
│   ├── generate-scoop-prompts.node.js
│   └── download-image.sh             # NEW: wraps curl with browser UA + Referer
└── references/
    ├── shared-concepts.md            # Typing Test, content models, visual-tree grammar, .plain.html rules, fragments
    ├── runtime-slicc.md              # /shared/ paths, scoop_scoop, sprinkle, fs.fetchToFile, eval-file
    ├── runtime-claude-code.md        # local paths, Agent tool, npx aem-cli, eval "$(cat ...)"
    ├── adapter-playwright.md         # per-runtime command mapping table
    └── forbidden-patterns.md         # drift defense — patterns that should never appear in the wrong runtime
```

Apply the same pattern to `migrate-block`, `migrate-header`, `dismiss-overlays`.

### 3.2 The probe script

```bash
#!/usr/bin/env bash
# scripts/detect-runtime.sh — emit one of: slicc | claude-code | unknown
set -euo pipefail

# Slicc indicators: SLICC_HOME env, scoop_scoop binary, /shared/ root
if [[ -n "${SLICC_HOME:-}" ]] || command -v scoop_scoop >/dev/null 2>&1 || [[ -d /shared ]]; then
  echo slicc; exit 0
fi

# Claude Code indicators: CLAUDE_PROJECT_DIR, host playwright-cli (no --tab support)
if [[ -n "${CLAUDE_PROJECT_DIR:-}" ]] || command -v playwright-cli >/dev/null 2>&1; then
  echo claude-code; exit 0
fi

echo unknown
```

### 3.3 SKILL.md head (becomes ~50 lines instead of 600)

```markdown
---
name: migrate-page
description: Migrate a web page to AEM Edge Delivery Services...
---

Detected runtime: !`bash $SKILL_DIR/scripts/detect-runtime.sh`

## Required reading (in order, before doing anything)

1. references/shared-concepts.md — universal patterns (Typing Test, content models, .plain.html format)
2. references/runtime-{detected}.md — tool-specific commands and paths
3. references/adapter-playwright.md — playwright-cli command mapping
4. references/forbidden-patterns.md — drift detection (halt if you find these in your output)

If `runtime=unknown`, halt and report. Do not proceed with assumptions.

## Phases

[high-level phase descriptions; tool-specific commands live in runtime-*.md]
```

### 3.4 Drift defense

`references/forbidden-patterns.md` ends each runtime section with patterns the model should *never* emit when in that runtime:

- **In claude-code**: `/shared/`, `/workspace/`, `scoop_scoop`, `feed_scoop`, `drop_scoop`, `sprinkle send`, `eval-file`, `fs.fetchToFile`, `--tab=<targetId>` (named), `--fullPage=true`, `serve --entry`
- **In slicc**: `/tmp/`, `npx`, `Agent` tool, `node:fs/promises`, host paths

The thin SKILL.md instructs: "Anytime your output is about to use a forbidden pattern for the current runtime, halt and re-read references/runtime-{detected}.md."

This is a **belt-and-braces** defense for the (untested) capability-gated-prompt risk in §2.9.

---

## 4. Path Forward

### Phase 0 — Free wins (this week, no design risk)

1. Drop trailing `;` in `scripts/visual-tree.js:649`. (§1.4)
2. Rewrite `scripts/block-inventory.js` to use `import { readdir, readFile, writeFile } from 'fs/promises'` and wrap in `async function main()`. Verify it still runs from a Slicc scoop — Slicc's Node likely has `node:fs/promises`, but verify against `slicc.readFile` shim if any. If Slicc's `fs` global is required, ship two files (`.slicc.js` and `.node.js`) immediately and have the runtime reference point to the right one.
3. Same fix for `scripts/generate-scoop-prompts.js`.

These three changes are pure portability bugs with zero design implication. **Do them first regardless of the larger design.**

### Phase 1 — Extract shared concepts (no behavior change)

1. Create `migration/migrate-page/references/shared-concepts.md`. Move all environment-agnostic content out of SKILL.md: Typing Test, content models, visual-tree grammar, `.plain.html` rules, three-fragment structure, decomposition output schema, brand cascade, hard rules.
2. SKILL.md becomes "read references/shared-concepts.md, then proceed with [current Slicc-flavored steps]".
3. Apply to migrate-block, migrate-header, dismiss-overlays.
4. **Validate inside Slicc that nothing regresses.** Run a baseline migration before and after. Diff the `.migration/` outputs.

### Phase 2 — Add the runtime split (the experiment)

1. Create `references/runtime-slicc.md` by extracting Slicc-specific commands from current SKILL.md (paths, tool names, `eval-file` usage, `serve`, `scoop_scoop`).
2. Create `references/runtime-claude-code.md` from the 2026-05-05 migration adaptation notes (local paths, `Agent` tool, `npx aem-cli`, `eval "$(cat ...)"`, etc.).
3. Create `references/adapter-playwright.md` with the side-by-side command table from §1.5.
4. Create `references/forbidden-patterns.md` (§3.4).
5. Add `scripts/detect-runtime.sh` and the probe call to SKILL.md head.
6. **Run the same migration twice** (Slicc and Claude Code, same source URL, same target repo). `diff` the resulting `.migration/` directories. Iterate until both runtimes produce equivalent outputs.

### Phase 3 — Validate dispatch holds under real LLM use

The capability-gated-prompt risk (§2.9) is the live one. Concrete tests:

1. **Drift-rate measurement** — run 10 migrations under each runtime, count how often the model invokes a forbidden pattern (e.g., uses `/shared/` while running in Claude Code). Target <5% drift; if higher, the pattern needs harder guard rails or runtime-fork after all.
2. **Probe consistency** — verify the probe runs and is read at session start, not silently dropped under context pressure later. Likely needs a "current runtime: {detected}" reminder injected via TodoWrite or a session memory entry.
3. **`!`cmd`` portability** — confirm whether Agent SDK and Claude API support frontmatter shell injection. If only Claude Code, fall back to a plain "run this command first" instruction at the top of SKILL.md (weaker guarantee).

### Phase 4 — Upstream

1. File an issue at [anthropics/skills](https://github.com/anthropics/skills) describing the gap and the proposed pattern. As of 2026-05-05 this would be the first published concrete instance — useful contribution.
2. If the dispatch pattern proves reliable in Phase 3, propose a SKILL.md-spec extension: a structured frontmatter field (`environment-detector: scripts/detect-runtime.sh`) with documented protocol (output one token from a registered list).

---

## 5. Fallback if Capability-Gated Dispatch Doesn't Hold

If Phase 3 reveals unacceptable drift (>5% forbidden-pattern emissions, or probe inconsistency), the credible fallback is **harness-specific forks**:

```
migration/
  migrate-page/SKILL.md              # Slicc version
  migrate-page-cc/SKILL.md           # Claude Code version
  shared/concepts.md                 # Symlinked (or duplicated) into both
```

This is the explicit-fork approach and matches every Ansible-alternative project that ended up in `roles/{os}/tasks/main.yml`. Less elegant; survives drift completely. Tradeoff: doubled maintenance for the orchestration steps, single-source for shared concepts.

---

## 6. Open Questions

- Does Slicc's Node runtime expose `node:fs/promises`? Phase 0 step 2 depends on it. If not, ship `.slicc.js` / `.node.js` pairs immediately.
- Does `!`cmd`` work in Agent SDK / Claude API? Phase 2 dispatch reliability depends on it. **Highest priority validation.**
- How does Slicc's `upskill` installer handle `references/` subdirectories? (Probably fine — they're plain markdown — but verify.)
- Should runtime detection cache itself per session, or re-probe each time SKILL.md loads? Re-probing is simpler; caching avoids wasted work.
- What's the right behavior on `runtime=unknown`? Halt with a clear message vs. fall back to the most-restrictive runtime?
- Should the `migrate-page.shtml` sprinkle be conditionally loaded too, or is it OK to ship as harmless dead code on host OS?
- For the Claude Code runtime, do we use the host `Agent` tool to spawn block-building "scoops", or just make `migrate-page` a synchronous-cone-only skill on that runtime (no parallelism)? Parallel Agents work but lose the "keep-alive for review" property.

---

## 7. References

- 2026-05-05 host-OS migration test — AstraZeneca → adobe/aem-boilerplate (run by a Claude Code session adapting these skills on the fly; see also `docs/specs/2026-04-23-page-migration-cost-analysis.md` for SLICC-baseline economics)
- [Anthropic Agent Skills overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)
- [Agent Skills best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- [Extend Claude with skills (Claude Code)](https://code.claude.com/docs/en/skills) — `!`cmd`` frontmatter injection
- [Equipping agents for the real world (Anthropic engineering blog)](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)
- [Agentic Stack — one brain, many harnesses](https://github.com/codejunkie99/agentic-stack)
- [SpecWeave 39-agent skills compat analysis](https://spec-weave.com/docs/guides/agent-skills-extensibility-analysis/)
- [SKILL.md open standard HN thread](https://news.ycombinator.com/item?id=46723183)
- [Ansible conditionals](https://docs.ansible.com/projects/ansible/latest/playbook_guide/playbooks_conditionals.html)
- [Ansible OS-dependent tasks](https://ansible-tips-and-tricks.readthedocs.io/en/latest/os-dependent-tasks/variables/)
- [MCP architecture](https://modelcontextprotocol.io/docs/learn/architecture) — for the eventual MCP-server mental model
- [LangChain middleware](https://docs.langchain.com/oss/python/langchain/middleware/built-in)
- [LangChain MCP adapters reference](https://reference.langchain.com/python/langchain-mcp-adapters/tools)
- [CMake System Inspection](https://cmake.org/cmake/help/book/mastering-cmake/chapter/System%20Inspection.html)
- [Autoconf — Wikipedia](https://en.wikipedia.org/wiki/Autoconf)
- [agentskills.io specification](https://agentskills.io/specification)
