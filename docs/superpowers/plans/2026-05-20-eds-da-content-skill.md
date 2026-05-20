# `eds-da-content` Reference Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new reference skill `skills/eds-da-content/` consisting of one
`SKILL.md` and three reference files (`platform.md`, `media.md`,
`html-content.md`) that consolidate the rules for producing DA-compatible HTML,
uploading binaries to DA, and driving the DA admin API.

**Architecture:** Pure reference skill — no scripts, no tools, no workflow. Four
Markdown files only. References are split by domain (platform / media / HTML).
Cross-references between files follow the inline-minimum / pointer-deep pattern
defined in the spec. Every factual claim is tagged `[verified]` or `[assumed]`.
SKILL.md surfaces the 10 silent-failure rules so they're always loaded with the
skill.

**Source material:**
- `snowflake-4th-attempt/docs/DA-MEDIA-REFERENCE.md` — primary source for `media.md`
- `skills/snowflake/knowledge/eds-da-mechanics.md` — primary source for `platform.md` DA portions
- `/tmp/research_20260520_*.md` — research artifacts for `html-content.md` block/section/metadata rules
- `https://www.aem.live/developer/markup-sections-blocks` and adjacent aem.live pages — canonical EDS authoring rules

**Tech Stack:** Plain Markdown. No build tooling. Skill discovery via SKILL.md
frontmatter (Claude Skills convention) and Slicc's `upskill` install path.

**Spec:** `docs/specs/2026-05-20-eds-da-content-skill-design.md`

---

## File Map

```
skills/eds-da-content/
├── SKILL.md                          # Entrypoint: trigger description, 10 silent-failure rules, index, glossary
└── references/
    ├── platform.md                   # DA + EDS platform layer: API, auth, paths, lifecycle
    ├── media.md                      # Binaries: storage patterns, formats, limits, delivery
    └── html-content.md               # HTML rules: skeleton, blocks, sections, metadata, icons, links, images
```

Build order: `platform.md` → `media.md` → `html-content.md` → `SKILL.md`.
This satisfies the cross-reference dependency graph (each file only references
files that already exist by the time it's written).

---

## Task 1: Scaffold the skill directory

**Files:**
- Create: `skills/eds-da-content/` (directory)
- Create: `skills/eds-da-content/references/` (directory)

- [ ] **Step 1: Create directories**

Run:
```bash
mkdir -p skills/eds-da-content/references
```

- [ ] **Step 2: Verify**

Run:
```bash
ls -la skills/eds-da-content/ skills/eds-da-content/references/
```

Expected: both directories exist, both empty.

- [ ] **Step 3: Commit (empty directory placeholder)**

Skip — git doesn't track empty directories. The directories will be committed
when the first file lands in Task 2.

---

## Task 2A: `platform.md` — storage model, Source API, IMS auth

**Files:**
- Create: `skills/eds-da-content/references/platform.md`

**Source material:**
- `skills/snowflake/knowledge/eds-da-mechanics.md` sections "Storage model",
  "Admin API — source endpoints", "aem content CLI — git-style workflow",
  "Preview + publish — required step, separate from push"
- `snowflake-4th-attempt/docs/DA-MEDIA-REFERENCE.md` §1, §3.1, §3.4, §3.5, §3.6, §7, §11

- [ ] **Step 1: Write the file header and §1 (storage model)**

Content for the opening:

```markdown
# DA + EDS platform reference

The shared platform foundations: where content lives, how to read and write
it, and how it gets published. Everything in `media.md` and `html-content.md`
ultimately reads or writes through the surfaces described here.

Every factual claim is tagged `[verified]` (read from code or observed
empirically) or `[assumed]` (inferred from documentation without direct
verification).

---

## 1. Storage model

Adobe Document Authoring (DA) is the content management backend for Adobe
Edge Delivery Services (EDS). Both surfaces share the same `{org}/{repo}`
namespace, where `{repo}` corresponds to a GitHub repository and `{org}` to
a GitHub organization or user.

Four hostnames surface DA content:

| Host | Purpose | Auth |
|---|---|---|
| `https://admin.da.live/source/{org}/{repo}/<path>` | DA Source API — read/write content and binaries | Bearer IMS token |
| `https://content.da.live/{org}/{repo}/<path>` | Raw DA delivery — returns the binary or HTML exactly as uploaded | None for public types |
| `https://{branch}--{repo}--{owner}.aem.page/<path>` | Preview render via the EDS pipeline | None |
| `https://{branch}--{repo}--{owner}.aem.live/<path>` | Production render via the EDS pipeline | None |

[verified] from `da-admin` source (`src/routes/source.js`) and `aem.live` docs.

A separate Admin API at `https://admin.hlx.page/{action}/{org}/{repo}/{branch}/<path>`
controls document lifecycle (preview / publish). See §6.
```

- [ ] **Step 2: Write §2 (DA Source API contract)**

Content:

```markdown
## 2. DA Source API contract

The Source API at `https://admin.da.live/source/{org}/{repo}/<path>` is the
only mechanism that's scriptable for both HTML content and binaries.

### Endpoints

| Verb | Pattern | Notes |
|---|---|---|
| `GET` | `/source/{org}/{repo}/{path}.html` | Read source HTML. `[verified]` |
| `POST` / `PUT` | `/source/{org}/{repo}/{path}.html` | Create or update HTML. Both verbs route to the same handler. `[verified]` from `da-admin` `src/helpers/source.js`. |
| `DELETE` | `/source/{org}/{repo}/{path}.html` | Remove. `[verified]` |
| `PUT` | `/source/{org}/{repo}/<path-to-binary>` | Image / video / asset upload. `[verified]` |
| `GET` | `/list/{org}/{repo}/{path}` | List directory contents. `[verified]` |
| `POST` | `/versionsource/{org}/{repo}/{path}` | Create a named version. `[verified]` |

### Request format

**Required headers:**

| Header | Value |
|---|---|
| `Authorization` | `Bearer <IMS_TOKEN>` |
| `Content-Type` | `multipart/form-data; boundary=…` (set automatically by HTTP clients using `FormData`) |

**Body shape:** `multipart/form-data` with a single field named **`data`**
carrying the content blob. The field name is required — `file`, `image`, etc.
silently return 200 OK with no file written. `[verified]` 2026-05-18.

**Content-Type on the blob:** `text/html` for documents, `application/json`
for sheets, `image/*` / `video/*` / `application/pdf` for binaries. The admin
reads this from the blob's type, not from the outer multipart header.
`[verified]` from `da-admin` `src/storage/object/put.js`.

### Response shape (success)

`201 Created` (new object) or `200 OK` (update), JSON body:

```json
{
  "source": {
    "editUrl":    "https://da.live/edit#/{org}/{repo}/{path}",
    "contentUrl": "https://content.da.live/{org}/{repo}/{path}"
  },
  "aem": {
    "previewUrl": "https://main--{repo}--{owner}.aem.page/{path}",
    "liveUrl":    "https://main--{repo}--{owner}.aem.live/{path}"
  }
}
```

`[verified]` 2026-05-18 via curl PUT.

### Response shape (auth failure)

`401 Unauthorized` with an empty body. No helpful error message. `[verified]`.
Always pre-flight token expiry — see §3.

### Minimal Node example

(Single source of truth for the upload pattern; cross-referenced by `media.md`
and `html-content.md`.)

\`\`\`javascript
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

async function putToDA({ absPath, daPath, mime, token, org, repo }) {
  const buf  = readFileSync(absPath);
  const blob = new Blob([buf], { type: mime });
  const form = new FormData();
  form.append('data', blob, basename(absPath));        // field name MUST be "data"
  const url = \`https://admin.da.live/source/\${org}/\${repo}/\${daPath}\`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: \`Bearer \${token}\` },
    body: form,
  });
  if (!res.ok) throw new Error(\`PUT \${url} → \${res.status}\`);
  return res.json();
}
\`\`\`

### curl equivalent

\`\`\`bash
curl -X PUT \\
  -H "Authorization: Bearer $DA_TOKEN" \\
  -F "data=@./hero.png" \\
  "https://admin.da.live/source/$ORG/$REPO/media/hero.png"
\`\`\`

With curl's `-F` shorthand, the multipart boundary and field name are set
correctly. Use the literal field name `data`.
```

- [ ] **Step 3: Write §3 (IMS auth and token handling)**

Content:

```markdown
## 3. IMS authentication and token handling

All DA Source API and Admin API calls use the same Adobe IMS access token.

### Acquisition

The first-time / interactive path:

\`\`\`bash
npx -y @adobe/aem-cli content clone --path /<subpath>
\`\`\`

Opens a browser for IMS sign-in. The resulting token is cached at
`.hlx/.da-token.json` (per project, must be gitignored). `[verified]`

### Token file shape

\`\`\`json
{
  "access_token": "eyJ...",
  "expires_at": 1778494729459
}
\`\`\`

`expires_at` is Unix milliseconds. `[verified]`

### Pre-flight expiry check

The token expires silently — subsequent requests return 401 with an empty
body. Always check before a long-running upload run:

\`\`\`javascript
const tok = JSON.parse(readFileSync('.hlx/.da-token.json', 'utf8'));
const expMs = typeof tok.expires_at === 'number'
  ? tok.expires_at
  : JSON.parse(Buffer.from(tok.access_token.split('.')[1], 'base64').toString()).exp * 1000;

if (expMs <= Date.now()) {
  throw new Error(\`DA token expired at \${new Date(expMs).toISOString()}. Re-auth required.\`);
}
if (expMs - Date.now() < 5 * 60 * 1000) {
  console.warn(\`DA token expires in \${Math.floor((expMs - Date.now()) / 60_000)} minutes\`);
}
\`\`\`

### Permission scope

The token is bearer-scoped to the IMS user. There is no per-asset ACL — a
bearer can read/write everything in the `{org}/{repo}` it has access to.
`[verified]`
```

- [ ] **Step 4: Verify the file so far**

Run:
```bash
wc -l skills/eds-da-content/references/platform.md
grep -c '\[verified\]\|\[assumed\]' skills/eds-da-content/references/platform.md
```

Expected: file has 100+ lines, every section has at least one provenance tag.

- [ ] **Step 5: Commit**

```bash
git add skills/eds-da-content/references/platform.md
git commit -m "docs(eds-da-content): platform.md sections 1-3 (storage, source API, auth)"
```

---

## Task 2B: `platform.md` — retry, paths, lifecycle

**Files:**
- Modify: `skills/eds-da-content/references/platform.md` (append §4-§6)

**Source material:**
- `snowflake-4th-attempt/docs/DA-MEDIA-REFERENCE.md` §3.4, §3.6, §7
- `skills/snowflake/knowledge/eds-da-mechanics.md` "Preview + publish — required step"

- [ ] **Step 1: Write §4 (retry policy)**

Append to `platform.md`:

```markdown
## 4. Retry policy for transient failures

Production scripts should retry on `429` and `5xx` responses. DA's Source
endpoint is generally robust, but the upstream `admin.hlx.page` endpoints
occasionally return transient errors under load.

| Behavior | Value |
|---|---|
| Max attempts | 3 |
| Backoff | Exponential (1s / 2s / 4s) |
| Honor `Retry-After` header | Yes |
| Retry on status | `429`, `500`, `502`, `503`, `504`, network errors (`ECONNRESET`, `ETIMEDOUT`) |
| Do NOT retry on | All other 4xx — they represent semantic failures the caller needs to see (`401` token, `413` payload, `415` unsupported media, `400` malformed) |

`[assumed]` from the policy in `aem-import-helper` and community practice.
`[verified]` for DA-specific 401-empty-body behavior on token expiry.
```

- [ ] **Step 2: Write §5 (path constraints)**

Append:

```markdown
## 5. Path constraints

| Rule | Value |
|---|---|
| Character set | Lowercase `a–z`, digits `0–9`, dash `-` |
| Max path length | 900 characters |
| Extension on documents | `.html` in DA storage; delivered without extension |
| Extension on binaries | Required at upload (drives MIME sniffing) |
| Traversal | `..` not allowed; relative paths don't resolve against an authoritative root |

`[verified]` from `aem.live/docs/limits`.

DA's Source API will accept a PUT to `/Media/Hero Image.PNG`, but the resulting
path may not be canonically reachable. Validate paths against the rules
before uploading.

### Path normalizer

\`\`\`javascript
function normalizeDAPath(name) {
  return name
    .toLowerCase()
    .replace(/[_\s]+/g, '-')                   // spaces, underscores → dash
    .replace(/[^a-z0-9\-./]/g, '')             // strip everything else
    .replace(/-+/g, '-')                        // collapse multiple dashes
    .replace(/-(\.)/g, '$1')                    // dash before . (extension) → strip
    .replace(/^-|-$/g, '');                     // trim leading/trailing dashes
}
\`\`\`
```

- [ ] **Step 3: Write §6 (preview / publish lifecycle)**

Append:

```markdown
## 6. Preview and publish — required step, separate from upload

Uploading via the Source API only stages drafts. The page does **not** appear
at `aem.page` or `aem.live` URLs until preview (makes `aem.page` work) and
publish (makes `aem.live` work) are explicitly triggered.

\`\`\`bash
TOKEN=$(jq -r .access_token .hlx/.da-token.json)

curl -X POST -H "Authorization: Bearer $TOKEN" \\
  "https://admin.hlx.page/preview/{org}/{repo}/{branch}/{path}"

curl -X POST -H "Authorization: Bearer $TOKEN" \\
  "https://admin.hlx.page/live/{org}/{repo}/{branch}/{path}"
\`\`\`

`[verified]` 2026-05-18.

**Important:**
- `{path}` matches the DA-stored content path **without** the `.html`
  extension. Index pages can use a trailing `/`.
- `{branch}` matches the GitHub branch the EDS deploy is tied to. The
  previewed page is reachable at
  `https://{branch}--{repo}--{owner}.aem.page/{path}`.
- Binaries do **not** need preview/publish — they're delivered directly from
  `content.da.live` once uploaded. Only documents that reference them need
  the lifecycle calls.
```

- [ ] **Step 4: Verify**

Run:
```bash
grep -n '^## ' skills/eds-da-content/references/platform.md
```

Expected: sections 1-6 all present in order.

- [ ] **Step 5: Commit**

```bash
git add skills/eds-da-content/references/platform.md
git commit -m "docs(eds-da-content): platform.md sections 4-6 (retry, paths, lifecycle)"
```

---

## Task 2C: `platform.md` — CLI, rate limits, URL card

**Files:**
- Modify: `skills/eds-da-content/references/platform.md` (append §7-§9)

**Source material:**
- `skills/snowflake/knowledge/eds-da-mechanics.md` "aem content CLI"
- `snowflake-4th-attempt/docs/DA-MEDIA-REFERENCE.md` §3.3, §5.3, §11

- [ ] **Step 1: Write §7 (`aem content` CLI workflow)**

Append:

```markdown
## 7. `aem content` CLI — git-style workflow

\`\`\`bash
aem content clone --path /        # auth via browser, pulls into ./content/
aem content add <files>           # stage
aem content commit -m "..."       # local commit
aem content push [--force]        # upload to DA
aem content status                # show added/modified/deleted
aem content diff                  # diff local vs remote
aem content merge                 # sync
\`\`\`

Auth token cached at `.hlx/.da-token.json` (gitignored). The CLI can be read
directly to authorize PUTs:

\`\`\`bash
TOKEN=$(jq -r .access_token .hlx/.da-token.json)
\`\`\`

### Known limitation: binaries

`aem content push` does **not** reliably upload binary files. The command was
designed for HTML; it reports success but the binary often doesn't land.
`[verified]` empirically.

Verify with `curl -sI <expected-url>`; if the upload didn't happen, fall back
to the Source API (§2) directly. Treat the CLI as HTML-only and use the
Source API for binaries until this is fixed upstream.
```

- [ ] **Step 2: Write §8 (rate limits)**

Append:

```markdown
## 8. Rate limits

| Limit | Value | Source |
|---|---|---|
| Rate limit | 200 req/sec per IP per hostname | `aem.live/docs/limits` `[verified]` |
| Concurrent uploads (recommended) | ≤ 50 | `aem-import-helper` default `[verified]` |
| Pages per site | 1,000,000 | `aem.live/docs/limits` `[verified]` |
| Files per Code Bus reference | 500 | `aem.live/docs/limits` `[verified]` |
| Response payload (compressed) | 6 MB | `aem.live/docs/limits` `[verified]` |

For DA Source uploads, the per-IP rate limit applies — high-concurrency
upload scripts (>200 concurrent PUTs from a single IP) will see 429s and need
backoff per §4.
```

- [ ] **Step 3: Write §9 (URL reference card)**

Append:

```markdown
## 9. URL reference card

| Pattern | Purpose | Auth |
|---|---|---|
| `https://admin.da.live/source/{org}/{repo}/<path>` | DA Source API — PUT/GET/DELETE content and binaries | Bearer IMS token |
| `https://admin.da.live/list/{org}/{repo}/<path>` | List directory | Bearer IMS token |
| `https://admin.da.live/versionsource/{org}/{repo}/<path>` | Create a named version | Bearer IMS token |
| `https://admin.hlx.page/preview/{org}/{repo}/{branch}/<path>` | Trigger preview for a document | Bearer IMS token |
| `https://admin.hlx.page/live/{org}/{repo}/{branch}/<path>` | Trigger publish for a document | Bearer IMS token |
| `https://content.da.live/{org}/{repo}/<path>` | Raw DA delivery — returns bytes as uploaded | None for image / public types |
| `https://da.live/edit#/{org}/{repo}/<path>` | DA web editor for a document | Sign-in required |
| `https://{branch}--{repo}--{owner}.aem.page/<path>` | Preview deploy from a branch (post-`preview`) | None |
| `https://{branch}--{repo}--{owner}.aem.live/<path>` | Live deploy from a branch (post-`live`) | None |

For media-specific patterns (`/media`, dot-folders, AEM Assets) see
[media.md](./media.md).
```

- [ ] **Step 4: Verify §1-§9 all present**

Run:
```bash
grep -c '^## ' skills/eds-da-content/references/platform.md
```

Expected: exactly 9.

- [ ] **Step 5: Verify cross-reference**

Run:
```bash
grep -n '\[media\.md\]\|\[html-content\.md\]' skills/eds-da-content/references/platform.md
```

Expected: at least one reference to `media.md` (from the URL card).

- [ ] **Step 6: Commit**

```bash
git add skills/eds-da-content/references/platform.md
git commit -m "docs(eds-da-content): platform.md sections 7-9 (CLI, limits, URL card)"
```

---

## Task 3A: `media.md` — storage model, patterns, upload paths

**Files:**
- Create: `skills/eds-da-content/references/media.md`

**Source material:** `snowflake-4th-attempt/docs/DA-MEDIA-REFERENCE.md`
§1, §2, §3 (adapt — the original §3 covers upload paths in depth; we
shorten §3.1 (Source API) and §3.5 (auth) to a pointer to `platform.md`).

- [ ] **Step 1: Copy DA-MEDIA-REFERENCE.md as the starting point**

Run:
```bash
cp /Users/catalan/repos/ai/aemcoder/snowflake-4th-attempt/docs/DA-MEDIA-REFERENCE.md \
   skills/eds-da-content/references/media.md
```

- [ ] **Step 2: Update the header**

Edit `skills/eds-da-content/references/media.md` lines 1-6 from:

\`\`\`markdown
# Document Authoring (DA) — media & assets reference

Self-contained reference for how Adobe Document Authoring (`da.live`) handles binary assets — images, SVGs, video, PDF, fonts, and other static files. Covers the storage model, the upload paths (API, editor, CLI), supported formats and limits, naming and path constraints, the delivery model, and how authored documents reference uploaded media.

This document describes DA itself. It does not assume any particular project type built on top of DA.

---
\`\`\`

To:

\`\`\`markdown
# DA media — binaries reference

How DA handles images, SVGs, video, PDF, fonts, and other binary assets:
storage patterns, upload paths, supported formats, size limits, the
delivery model, and how authored HTML references uploaded media.

For the Source API contract, IMS auth, retry policy, and URL reference
card, see [platform.md](./platform.md). For how HTML documents reference
the media described here, see [html-content.md](./html-content.md).

Every factual claim is tagged `[verified]` (read from code or observed
empirically) or `[assumed]` (inferred from documentation without direct
verification).

---
\`\`\`

- [ ] **Step 3: Trim §1 to a pointer**

The original §1 duplicates `platform.md` §1. Replace `media.md` §1 entirely with:

\`\`\`markdown
## 1. Storage model (recap)

DA stores both content (HTML) and binaries under
`{org}/{repo}/<path>`. The four hostnames and the Source API are documented
in [platform.md §1](./platform.md). What's relevant here: every binary is
addressed by a path under that namespace, served at `content.da.live`, and
optionally rendered through the EDS pipeline at `aem.page` / `aem.live`.
\`\`\`

- [ ] **Step 4: Verify §2 (three media patterns) is intact**

The original §2 should remain as-is — it's media-specific.

Run:
```bash
grep -n '^## 2\.\|^### 2\.' skills/eds-da-content/references/media.md
```

Expected: §2, §2.1, §2.2, §2.3 all present.

- [ ] **Step 5: Trim §3 (upload paths) to keep media-specific bits, defer API to platform.md**

In §3, replace §3.1 (DA Source API) entirely with:

\`\`\`markdown
### 3.1 The DA Source API (HTTP PUT)

The canonical write endpoint for binaries. Same multipart `data`-field
contract as for HTML documents — see [platform.md §2](./platform.md) for
the full request/response shape, headers, and the minimal Node example.

For binaries specifically: the path determines the storage pattern (§2),
the file extension determines the MIME type sniffed at delivery (§4.2),
and the file size must fit the per-type cap (§5.1).
\`\`\`

Keep §3.2 (editor), §3.3 (CLI — the binary limitation is media-relevant),
§3.4 (Admin API for preview/publish — relevant because binaries don't need
it, documents that reference them do).

Replace §3.5 (auth) with a pointer:

\`\`\`markdown
### 3.5 Auth token handling

All upload paths use the same IMS bearer token. Acquisition, expiry
handling, and the pre-flight check are documented in
[platform.md §3](./platform.md).
\`\`\`

Replace §3.6 (retry policy) with a pointer:

\`\`\`markdown
### 3.6 Retry policy

See [platform.md §4](./platform.md). DA Source endpoints are generally
robust; media-specific failures (413 payload too large, 415 unsupported
media) follow the same non-retry rule as other semantic 4xx.
\`\`\`

- [ ] **Step 6: Verify**

Run:
```bash
grep -c '\[verified\]\|\[assumed\]' skills/eds-da-content/references/media.md
grep -n '^## \|^### ' skills/eds-da-content/references/media.md | head -30
```

Expected: provenance tags present throughout, §1-§3 structure intact with
the platform.md cross-references in place.

- [ ] **Step 7: Commit**

```bash
git add skills/eds-da-content/references/media.md
git commit -m "docs(eds-da-content): media.md sections 1-3 (adopted from DA-MEDIA-REFERENCE)"
```

---

## Task 3B: `media.md` — formats, limits, delivery model

**Files:**
- Modify: `skills/eds-da-content/references/media.md` (no structural changes
  to §4-§8 yet; verify content and add cross-reference touches)

**Source material:** the existing §4-§8 from the copied DA-MEDIA-REFERENCE.md.

- [ ] **Step 1: Verify §4 (supported formats) is intact and well-tagged**

Run:
```bash
sed -n '/^## 4\./,/^## 5\./p' skills/eds-da-content/references/media.md | grep -c '\[verified\]\|\[assumed\]'
```

Expected: at least 3 provenance tags within §4.

If fewer, edit §4 to add `[verified]` to the format table and the WEBP
empirical note (which is empirically verified).

- [ ] **Step 2: Verify §5 (size limits) cites primary source**

Run:
```bash
sed -n '/^## 5\./,/^## 6\./p' skills/eds-da-content/references/media.md | grep 'aem.live/docs/limits'
```

Expected: at least one citation.

If missing, edit §5.1 (per-file caps) table to add a footnote:
`Source: [aem.live/docs/limits](https://www.aem.live/docs/limits). [verified]`

- [ ] **Step 3: Verify §6 (folder conventions) doesn't duplicate platform.md §5**

Read the section and confirm it covers only media-relevant folder
conventions (the `/media` pattern, dot-folders) — not the general path
constraints (those are in `platform.md` §5).

If duplicated, replace the duplicated subsection with a pointer:
`For the general path character set and length limits, see [platform.md §5](./platform.md).`

- [ ] **Step 4: Verify §7 (path constraints) is a pointer to platform.md**

Replace §7 entirely with:

\`\`\`markdown
## 7. Path constraints

See [platform.md §5](./platform.md). The constraints apply equally to
content and binary paths.
\`\`\`

- [ ] **Step 5: Verify §8 (delivery model) is media-specific and intact**

This is the most media-specific section (Media Bus vs Content Bus, `<picture>`
transformation, repo-relative→`about:error`, cache invalidation). It must
stay as-is.

Run:
```bash
sed -n '/^## 8\./,/^## 9\./p' skills/eds-da-content/references/media.md | wc -l
```

Expected: 100+ lines (this is a dense section).

- [ ] **Step 6: Add cross-reference touch in §8.3 (repo-relative paths)**

§8.3 already states that repo-relative paths render as `about:error`. Add at
the end of the section:

\`\`\`markdown
This is the single most common silent failure when generating HTML
programmatically. See [html-content.md §9 (Images in HTML)](./html-content.md)
for the HTML-side rule that prevents it.
\`\`\`

- [ ] **Step 7: Commit**

```bash
git add skills/eds-da-content/references/media.md
git commit -m "docs(eds-da-content): media.md sections 4-8 (formats, limits, delivery model)"
```

---

## Task 3C: `media.md` — authoring patterns, gotchas, decision tree, glossary

**Files:**
- Modify: `skills/eds-da-content/references/media.md` (§9-§13, then prune §13 glossary)

**Source material:** existing §9-§13 from the copied file.

- [ ] **Step 1: Verify §9 (authoring) cross-references html-content.md**

§9 currently describes how HTML documents reference media. Edit the section
intro to point at `html-content.md`:

\`\`\`markdown
## 9. Authoring — how HTML documents reference media

A DA document references uploaded media via standard HTML `<img>`,
`<source>`, `<video>`, `<a>`, and `<link>` tags. The `src=` / `href=`
attributes hold full URLs (per §8.3 — never repo-relative or
document-relative).

The HTML-side rules — exactly which tags to use, where they go in the doc
skeleton, and how they interact with sections and blocks — are documented
in [html-content.md §9 (Images in HTML)](./html-content.md). This section
covers the media-side: which URL host to point at, and what the pipeline
does with the reference at delivery.
\`\`\`

- [ ] **Step 2: Verify §10 (gotchas) is intact**

§10 has 10 operational gotchas. Each should have `[verified]` or
`[assumed]`. Verify:

```bash
sed -n '/^## 10\./,/^## 11\./p' skills/eds-da-content/references/media.md | grep -c '^### 10\.'
```

Expected: 10 subsection headers (10.1 through 10.10).

- [ ] **Step 3: Verify §11 (URL reference card)**

The URL card in §11 partially overlaps with `platform.md` §9. Replace §11
with a pointer:

\`\`\`markdown
## 11. URL reference card

See [platform.md §9](./platform.md) for the canonical URL reference. The
patterns relevant to media are the `content.da.live` delivery URLs (§2),
`admin.da.live/source` for upload (§3.1), and `aem.page`/`aem.live` for
rendered output.
\`\`\`

- [ ] **Step 4: Verify §12 (decision tree) is intact**

The decision tree ("where should I upload this?") is media-specific. It
should remain as-is.

- [ ] **Step 5: Move glossary to SKILL.md**

§13 is a glossary. Glossary moves to SKILL.md per the spec (shared across
references). Delete §13 from `media.md` entirely.

After deletion, the file should end at §12.

- [ ] **Step 6: Verify final structure**

Run:
```bash
grep -c '^## ' skills/eds-da-content/references/media.md
grep -n '^## ' skills/eds-da-content/references/media.md
```

Expected: exactly 12 top-level sections (`## 1.` through `## 12.`). No
`## 13. Glossary` remaining.

- [ ] **Step 7: Verify cross-references resolve**

Run:
```bash
grep -oE '\[([^]]+)\]\(\./[^)]+\)' skills/eds-da-content/references/media.md
```

Expected: all references point to `./platform.md` or `./html-content.md`.

- [ ] **Step 8: Commit**

```bash
git add skills/eds-da-content/references/media.md
git commit -m "docs(eds-da-content): media.md sections 9-12 (authoring, gotchas, decision tree)"
```

---

## Task 4A: `html-content.md` — skeleton, sections, block tables

**Files:**
- Create: `skills/eds-da-content/references/html-content.md`

**Source material:**
- `/tmp/research_20260520_eds_blocks.md` (block authoring conventions)
- `/tmp/research_20260520_adobe_eds_docs.md` (skeleton, sections)
- `skills/snowflake/knowledge/eds-da-mechanics.md` "Document shape — a body fragment"

- [ ] **Step 1: Write the file header**

Create `skills/eds-da-content/references/html-content.md` with:

\`\`\`markdown
# DA HTML content reference

How to generate HTML that DA will accept and EDS will render correctly.
Covers the document skeleton, block table format, section structure,
page and section metadata blocks, default content, icons, links, image
references, and the encoding / forbidden constructs.

For media binaries (the files HTML references), see [media.md](./media.md).
For the DA Source API call that uploads the HTML, see
[platform.md](./platform.md).

Every factual claim is tagged `[verified]` (read from code or observed
empirically) or `[assumed]` (inferred from documentation without direct
verification).

---
\`\`\`

- [ ] **Step 2: Write §1 (document skeleton)**

Append:

\`\`\`markdown
## 1. Document skeleton

A DA document is a **body fragment**, not a full HTML page. `[verified]`
from `da-admin` source and team docs.

\`\`\`html
<body>
  <header></header>
  <main>
    <div>...</div>      <!-- one div per section -->
    <div>...</div>
  </main>
  <footer></footer>
</body>
\`\`\`

### What to include

- `<body>` wrapper (mandatory)
- `<header>` and `<footer>` (mandatory tags, typically empty)
- `<main>` containing one `<div>` per section

### What to NOT include

| Tag / attr | Why |
|---|---|
| `<!DOCTYPE>` | Server-side pipeline emits this. `[verified]` |
| `<html>`, `<head>` | Server-side pipeline emits these from `head.html`. `[verified]` |
| `<script>`, inline `onclick=` | Stripped by the pipeline. `[verified]` |
| `<style>`, `style=` attrs | Stripped by the pipeline. `[verified]` |
| `class=` on default-content tags (paragraphs, headings, lists) | Added by `decorateBlocks` / `decorateSections` at delivery. `[verified]` |
| `id=` on headings | Auto-generated from heading text. `[verified]` |
| Inline `data-*` attrs outside Section Metadata output | Stripped. `[verified]` |

### Pipeline injection

At delivery, the EDS pipeline injects `head.html` from the project's
Code Bus (typically containing the CSP meta, viewport, `aem.js`,
`scripts.js`, `styles.css`). The DA document supplies only the
in-`<body>` content. `[verified]` from EDS docs.
\`\`\`

- [ ] **Step 3: Write §2 (sections)**

Append:

\`\`\`markdown
## 2. Sections

Each section is a single `<div>` directly inside `<main>`. `[verified]` from
EDS markup docs.

\`\`\`html
<main>
  <div>
    <!-- section 1 contents -->
  </div>
  <div>
    <!-- section 2 contents -->
  </div>
</main>
\`\`\`

### Rules

- No `<hr>` between sections — the section boundary is the `<div>` itself.
- Sections may contain default content (headings, paragraphs, lists) and
  blocks (see §3) in any order.
- One level of nesting only: blocks cannot contain other blocks. `[verified]`
  from EDS markup docs.
- Each section becomes `<div class="section">` after decoration at
  delivery; section metadata (§4) adds further CSS classes.

### When to use multiple sections

Use a new section whenever the visual layout shifts — different background,
different content density, a layout break. Sections are the natural unit
of CSS theming.

### Single-section pages

A page with no logical section break still wraps its content in one `<div>`
inside `<main>`. The pipeline always wraps everything in at least one
section. `[verified]`.
\`\`\`

- [ ] **Step 4: Write §3 (block tables)**

Append:

\`\`\`markdown
## 3. Block tables

A block is an HTML `<table>` where the first row is a single merged cell
containing the block name. `[verified]` from EDS markup docs.

\`\`\`html
<table>
  <tr><td>Block Name</td></tr>        <!-- merged header = block identifier -->
  <tr>
    <td>cell 1</td>
    <td>cell 2</td>
  </tr>
  <tr>
    <td>cell 3</td>
    <td>cell 4</td>
  </tr>
</table>
\`\`\`

### Block name normalization

The header cell text is normalized via `toClassName()` (`aem.js`):

1. Convert to lowercase
2. Replace spaces with hyphens
3. Replace non-alphanumeric characters with hyphens
4. Collapse multiple consecutive hyphens to one
5. Trim leading/trailing hyphens

| Header text | Normalized name | File path |
|---|---|---|
| `Columns` | `columns` | `blocks/columns/columns.{js,css}` |
| `Hero Banner` | `hero-banner` | `blocks/hero-banner/hero-banner.{js,css}` |
| `My  Block!` | `my-block` | `blocks/my-block/my-block.{js,css}` |

`[verified]` from `aem.js` source.

### Block name constraints

- Alphanumeric and single hyphens only.
- No underscores. `[verified]`
- No double dashes. `[verified]`
- Cannot start with a digit. `[verified]`

Valid: `hero`, `columns`, `super-hero`
Invalid: `hero_wide`, `hero--wide`, `2col`

### Block variants / options

Options in parentheses after the block name become additional CSS classes:

| Header text | Resulting classes |
|---|---|
| `Columns` | `columns block` |
| `Columns (wide)` | `columns wide block` |
| `Columns (super wide)` | `columns super-wide block` (multi-word: hyphenated) |
| `Columns (dark, wide)` | `columns dark wide block` (comma-separated: separate classes) |

`[verified]` from EDS markup docs.

### DOM output after decoration

\`\`\`html
<!-- Authored in DA (table form) -->
<table>
  <tr><td>Hero</td></tr>
  <tr><td><h1>Title</h1><p>Subtitle</p></td></tr>
</table>

<!-- Rendered by aem.page (decorated div form) -->
<div class="hero-wrapper">
  <div class="hero block" data-block-name="hero" data-block-status="loaded">
    <div>
      <div>
        <h1>Title</h1>
        <p>Subtitle</p>
      </div>
    </div>
  </div>
</div>
\`\`\`

Each row becomes an inner `<div>`. Each cell within a row becomes a nested
`<div>`. `[verified]` from `aem.js` `decorateBlock`.

### Forbidden patterns

These render as plain HTML tables (silent failure — the block JS never
loads):

| Pattern | Why it breaks |
|---|---|
| First row NOT merged into a single cell | EDS treats the table as plain HTML. `[verified]` |
| Empty header cell | No block name → not recognized as a block. `[verified]` |
| Nested `<table>` inside a block cell | EDS doesn't support nested blocks; the inner table renders as plain HTML. `[verified]` |
| Missing `<tbody>` | Some HTML generators omit `<tbody>`; DA's ProseMirror schema is strict. Use `<table><tr>...</tr></table>` consistently or always wrap in `<tbody>`. `[verified]` from `da-live` source. |
| Stray text nodes between `<tr>` / `<td>` | ProseMirror parse failure. Output clean HTML with no whitespace text nodes. `[verified]` |

### Max cells per row

Four cells per row maximum. `[verified]` from Adobe's Experience
Modernization Agent prompting guide. Exceeding this is not a hard
parse failure but breaks the common block JS patterns that assume
≤4 columns.
\`\`\`

- [ ] **Step 5: Verify §1-§3**

Run:
```bash
grep -c '^## ' skills/eds-da-content/references/html-content.md
grep -c '\[verified\]\|\[assumed\]' skills/eds-da-content/references/html-content.md
```

Expected: 3 sections, at least 15 provenance tags.

- [ ] **Step 6: Commit**

```bash
git add skills/eds-da-content/references/html-content.md
git commit -m "docs(eds-da-content): html-content.md sections 1-3 (skeleton, sections, blocks)"
```

---

## Task 4B: `html-content.md` — metadata, default content, icons

**Files:**
- Modify: `skills/eds-da-content/references/html-content.md` (append §4-§7)

**Source material:** `/tmp/research_20260520_eds_blocks.md`,
`/tmp/research_20260520_adobe_eds_docs.md`

- [ ] **Step 1: Write §4 (Section Metadata block)**

Append:

\`\`\`markdown
## 4. Section Metadata block

Section Metadata is a special block placed **inside** the section it
targets. It adds CSS classes and data attributes to the enclosing section
`<div>`. It has **no SEO effect** — that's the Page Metadata block (§5).

\`\`\`html
<table>
  <tr><td>Section Metadata</td></tr>
  <tr><td>Style</td><td>dark, center</td></tr>
  <tr><td>Background</td><td>/media/bg.jpg</td></tr>
</table>
\`\`\`

### Processing rules

- The `Style` property's value becomes additional CSS classes on the
  section `<div>` (comma-separated → separate classes). `[verified]`
- All other key/value rows become `data-*` attributes on the section.
  Key lowercased. `[verified]`
- No project code required — handled by the boilerplate's
  `decorateSections()`. `[verified]`

### Placement

Section Metadata must be inside the section it targets. The section is
determined by which `<div>` (inside `<main>`) the table sits inside.
Placing a Section Metadata table in the wrong section silently applies
the styles to the wrong section. `[verified]`

### HTML output example

For the table above inside a section, the section `<div>` becomes:

\`\`\`html
<div class="section dark center" data-background="/media/bg.jpg">
  <!-- section contents -->
</div>
\`\`\`
\`\`\`

- [ ] **Step 2: Write §5 (Page Metadata block)**

Append:

\`\`\`markdown
## 5. Page Metadata block

A single block at the **end of the document** (last element in `<footer>` or
the last `<main>` section, depending on convention). Maps to `<head>` meta
tags at delivery.

\`\`\`html
<table>
  <tr><td>Metadata</td></tr>
  <tr><td>title</td><td>My Page Title</td></tr>
  <tr><td>description</td><td>Page summary</td></tr>
  <tr><td>image</td><td><img src="https://content.da.live/{org}/{repo}/media/og.png"></td></tr>
  <tr><td>template</td><td>article</td></tr>
  <tr><td>theme</td><td>dark</td></tr>
  <tr><td>og:title</td><td>OG Title</td></tr>
  <tr><td>robots</td><td>noindex</td></tr>
  <tr><td>canonical</td><td>https://example.com/canonical-url</td></tr>
</table>
\`\`\`

### Recognized keys

| Key | Output |
|---|---|
| `title` | `<title>` + `<meta name="title">` + `og:title` + `twitter:title` |
| `description` | `<meta name="description">` + `og:description` + `twitter:description` |
| `image` | `og:image` + `og:image:secure_url` + `twitter:image` |
| `author` | `<meta name="author">` |
| `keywords` | `<meta name="keywords">` |
| `robots` | `<meta name="robots">` (values: `noindex`, `nofollow`, `all`) |
| `canonical` | `<link rel="canonical">` |
| `template` | CSS class on `<body>` (triggers auto-blocking) |
| `theme` | CSS class on `<body>` |
| `og:*`, `twitter:*` | `<meta property="...">` |
| any other | `<meta name="<lowercased-key>" content="...">` |

`[verified]` from EDS docs.

### Rules

- Only one Metadata block per page. `[verified]`
- Block header must be exactly `Metadata` (case-insensitive). Misspellings
  (`Meta Data`, `Metadata:`, `Metadat`) are silently ignored — no `<meta>`
  tags emitted. `[verified]`
- Page-level metadata overrides bulk metadata. `[verified]`
- Empty right column removes the corresponding tag (useful for clearing
  canonical on specific pages). `[verified]`

### Placement

Conventionally last in the document. `[verified]` from EDS docs. Some
projects place it at the top — both work, but consistency matters for
authoring tooling.
\`\`\`

- [ ] **Step 3: Write §6 (default content)**

Append:

\`\`\`markdown
## 6. Default content

Default content is anything outside a block table — standard document
elements that render as themselves: headings, paragraphs, lists, links,
images, inline formatting.

Use default content as much as possible. Blocks are heavier (table syntax,
block JS, dedicated CSS). Prefer default content for any content that
doesn't need a custom layout or behavior. `[verified]` from EDS authoring
docs.

### Allowed elements

| Tag | Notes |
|---|---|
| `<h1>` through `<h6>` | IDs auto-generated from text. `[verified]` |
| `<p>` | Standard paragraph. |
| `<ul>`, `<ol>`, `<li>` | Standard lists. |
| `<a href="...">` | Full URLs (§8). |
| `<img src="...">` | Full URLs (§9). |
| `<strong>`, `<em>` | Bold / italic. Trigger button promotion on standalone links (§8). |
| `<code>` | Inline code. |
| `<sub>`, `<sup>` | Subscript / superscript. |
| `<u>`, `<s>` | Underline / strikethrough. |
| `<br>` | Line break. |

### Heading anchor IDs

Heading IDs are auto-generated by `decorateMain`. The algorithm:

1. Lowercase the heading text
2. Replace spaces with hyphens
3. Strip non-alphanumeric (except hyphens)

"Our History" → `id="our-history"` → linkable as `/page#our-history`.
`[verified]` from `aem.js`.

Authors should NOT manually add `id=` attributes — they are stripped and
regenerated. `[verified]`
\`\`\`

- [ ] **Step 4: Write §7 (icons)**

Append:

\`\`\`markdown
## 7. Icons

In **DA HTML uploads**, icons are represented as:

\`\`\`html
<span class="icon icon-<name>"></span>
\`\`\`

`[verified]` from EDS `decorateIcons` source.

The colon-notation `:iconname:` form is what authors type in the DA editor
(or in Google Docs / Word) — the editor converts it to the `<span>` form
on save. When generating HTML programmatically, emit the `<span>` form
directly. `[verified]`

### SVG resolution

At delivery, `decorateIcons(element)` finds every `<span class="icon icon-X">`
and:

1. Fetches `/icons/<name>.svg` from the project's Code Bus.
2. Inlines the SVG content into the span (or sets `<img>` with the SVG as
   src, depending on the boilerplate variant).

`[verified]` from `aem.js`.

### Icon location options

Icons can live in two places:

- **Code Bus** (`/icons/<name>.svg` in the GitHub repo) — managed by
  developers, deployed via git. The default.
- **DA `/media`** (any path) — referenced via a full
  `https://content.da.live/...` URL in CSS or via `<img>` inside the icon
  span. See [media.md §2.3](./media.md) for the `/media` storage pattern
  and [media.md §5.1](./media.md) for the 40 KB SVG cap.

For static SVG icons under 40 KB, Code Bus is simpler. For authored icons
that need to change without code deploys, DA `/media` is the right choice.
\`\`\`

- [ ] **Step 5: Verify**

Run:
```bash
grep -c '^## ' skills/eds-da-content/references/html-content.md
grep -n '\[media\.md' skills/eds-da-content/references/html-content.md
```

Expected: 7 sections; at least one cross-reference to `media.md` in §7.

- [ ] **Step 6: Commit**

```bash
git add skills/eds-da-content/references/html-content.md
git commit -m "docs(eds-da-content): html-content.md sections 4-7 (metadata, content, icons)"
```

---

## Task 4C: `html-content.md` — links, images, encoding, upload handoff

**Files:**
- Modify: `skills/eds-da-content/references/html-content.md` (append §8-§11)

**Source material:** `/tmp/research_20260520_eds_blocks.md` (link rewriting,
images), `snowflake-4th-attempt/docs/DA-MEDIA-REFERENCE.md` §8 (delivery
model context for HTML images).

- [ ] **Step 1: Write §8 (links)**

Append:

\`\`\`markdown
## 8. Links

### URL form

`<a href>` accepts:

- Full external URLs (`https://other-host.com/path`) — preserved as-is.
- Full preview/live URLs (`https://main--repo--owner.aem.page/path`,
  `.aem.live/path`) — auto-rewritten to relative paths at render time.
  `[verified]`
- Full DA content URLs (`https://content.da.live/{org}/{repo}/path`) —
  serve directly. Use sparingly for in-page navigation; prefer the
  `aem.page` / `aem.live` form for branch independence at delivery.

### Forbidden forms

- Repo-relative paths without a host (`/path/to/page`) — these do work
  in DA HTML for same-site links, but the pipeline rewrites
  `aem.page`-form URLs to relative anyway, so it's simpler and more
  copy-paste-friendly to use the full form.
- Document-relative paths (`./page`, `../page`) — resolve against the
  editor URL (`da.live/edit#/...`), break in production. `[verified]`

### Heading anchors

Link to a heading via `#<auto-generated-id>` (see §6 for the algorithm).

\`\`\`html
<a href="https://main--repo--owner.aem.page/about-us#our-history">Our history</a>
\`\`\`

The pipeline rewrites this to `/about-us#our-history` at delivery.
`[verified]`

### Button promotion

A link becomes a styled button when it's the **only content of its
paragraph** (a "standalone" link). `[verified]` from `decorateButtons` source.

\`\`\`html
<!-- Plain link inside text — stays a regular <a>: -->
<p>Read more in <a href="...">our blog</a> today.</p>

<!-- Standalone link — becomes a button: -->
<p><a href="...">Read the blog</a></p>

<!-- With <strong> — becomes a primary button: -->
<p><strong><a href="...">Get started</a></strong></p>

<!-- With <em> — becomes a secondary button: -->
<p><em><a href="...">Learn more</a></em></p>
\`\`\`

The wrapping `<p>` becomes `class="button-container"`; the `<a>` becomes
`class="button"` (with `primary` or `secondary` modifier classes). All
applied by `decorateButtons` at delivery. `[verified]`

### External link `target="_blank"`

The boilerplate's `decorateExternalLinks()` adds `target="_blank"` to
links pointing to domains other than the current host. `[verified]`
Authors should NOT manually add `target="_blank"` — let decoration handle it.
\`\`\`

- [ ] **Step 2: Write §9 (images in HTML — the critical cross-reference)**

Append:

\`\`\`markdown
## 9. Images in HTML

The single most common silent failure in programmatic HTML generation:
incorrect image URLs.

### Required URL form

Every `<img src>`, `<source src>`, and `<video><source src>` in a DA-uploaded
document MUST be a full URL. `[verified]`

Acceptable hosts:

| Host | Use case | Notes |
|---|---|---|
| `https://content.da.live/{org}/{repo}/<path>` | Preferred — branch-independent | Always the latest uploaded version |
| `https://{branch}--{repo}--{owner}.aem.page/<path>` | Works — branch-locked | Avoid except for cross-branch references |
| `https://other-host.com/<path>` | External image | Preserved as-is; EDS will not copy it locally |

### Forbidden URL forms

These render as `<img src="about:error">` and produce broken images on
delivery:

| Form | Why |
|---|---|
| Repo-relative paths (`/path/foo.png`) | The pipeline cannot resolve them against an authoritative root. `[verified]` from EDS docs. |
| Document-relative paths (`./foo.png`, `../foo.png`) | Resolve against the editor URL, which doesn't host content. `[verified]` |
| Editor-relative paths | Same problem. `[verified]` |

### Image must exist before HTML references it

The referenced binary must already be uploaded to DA when the HTML
document is uploaded. Upload binaries first, then the HTML.

For storage patterns (DAM, dot-folder, `/media`), supported formats, size
limits, and the Source API call to upload binaries, see
[media.md](./media.md).

### Author a simple `<img>` — pipeline auto-generates `<picture>`

EDS auto-transforms `<img>` into a responsive `<picture>` element at
delivery:

\`\`\`html
<!-- Authored in DA -->
<img src="https://content.da.live/{org}/{repo}/media/hero.png" alt="Hero">

<!-- Rendered by aem.page -->
<picture>
  <source type="image/webp" srcset="./media_<hash>.png?width=2000&format=webply&optimize=medium"
          media="(min-width: 600px)">
  <source type="image/webp" srcset="./media_<hash>.png?width=750&format=webply&optimize=medium">
  <source type="image/png" srcset="./media_<hash>.png?width=2000&format=png&optimize=medium"
          media="(min-width: 600px)">
  <img loading="lazy"
       src="./media_<hash>.png?width=750&format=png&optimize=medium"
       width="..." height="..." alt="Hero">
</picture>
\`\`\`

The transformation:

- Generates 750px (mobile) + 2000px (desktop) variants.
- Generates WebP variants alongside the source format.
- Adds `loading="lazy"`, `decoding="async"`, computed `width`/`height`.
- Strips authored `width`/`height` (the pipeline computes them from
  delivered variant dimensions).

`[verified]` from EDS pipeline docs.

### Author `<picture>` only to override defaults

Author a `<picture>` element directly only when you need to override the
pipeline defaults (e.g., explicit art direction). The pipeline preserves
authored `<source>` elements and adds its own as fallbacks.

\`\`\`html
<picture>
  <source media="(min-width: 1000px)"
          srcset="https://content.da.live/{org}/{repo}/media/hero-desktop.png">
  <img src="https://content.da.live/{org}/{repo}/media/hero-mobile.png" alt="Hero">
</picture>
\`\`\`

### Required `alt` attribute

Always include `alt`. Empty `alt=""` is acceptable only for decorative
images. The pipeline preserves authored `alt` on the fallback `<img>`.
`[verified]`
\`\`\`

- [ ] **Step 3: Write §10 (encoding and forbidden constructs)**

Append:

\`\`\`markdown
## 10. Encoding and forbidden constructs

### Character encoding

- Source must be UTF-8 clean. `[verified]` from `da-admin`
  `normalizeCharset()`.
- The DA Source API strips `charset=` parameters from `Content-Type`
  headers (e.g., `text/html; charset=utf-8` becomes `text/html`). Don't
  rely on the charset parameter — ensure the bytes are UTF-8 before upload.
  `[verified]`

### Forbidden tags

| Tag | Why |
|---|---|
| `<script>` | Stripped by pipeline. `[verified]` |
| `<style>` | Stripped by pipeline. `[verified]` |
| `<iframe>` | Allowed for specific block use cases (e.g., embed blocks) but generally stripped from default content. |
| `<form>`, `<input>`, `<button>` | Forms work via specific block patterns, not as default content. |
| `<link>`, `<meta>` outside the Page Metadata block | Stripped; use Page Metadata (§5). |

### Forbidden attributes

| Attribute | Why |
|---|---|
| `style="..."` | Stripped on ingestion. `[verified]` |
| `class="..."` on default content | Set by decoration. `[verified]` |
| `id="..."` on headings | Auto-generated. `[verified]` |
| `on*` event handlers | Stripped. `[verified]` |

### Whitespace handling

ProseMirror (DA's editor schema) is strict about whitespace:

- No stray text nodes between `<tr>` and `<td>`.
- No mixed whitespace inside `<table>` elements.
- Consistent `<tbody>` use (either always wrap rows in `<tbody>` or never;
  don't mix). `[verified]` from `da-live` source.

When generating HTML programmatically, emit a clean DOM with no whitespace
between structural elements inside tables.

### Restore-point threshold

A document body under 83 bytes triggers DA's automatic restore-point
capture before overwriting. `[verified]` from `da-admin` source. This is
protective behavior — empty / near-empty writes preserve the previous
content as a recoverable version. Means a "delete content" write is
distinguishable from a "small page" write.
\`\`\`

- [ ] **Step 4: Write §11 (upload handoff)**

Append:

\`\`\`markdown
## 11. Upload handoff

The HTML you've generated per §1-§10 is uploaded via the DA Source API.
See [platform.md §2](./platform.md) for the full contract: endpoint, headers,
the `multipart/form-data` requirement, the field name (`data`), the response
envelope, and IMS auth.

The minimal call shape:

\`\`\`javascript
const blob = new Blob([htmlString], { type: 'text/html' });
const form = new FormData();
form.append('data', blob, 'document.html');

const url = \`https://admin.da.live/source/\${org}/\${repo}/\${path}.html\`;
const res = await fetch(url, {
  method: 'PUT',
  headers: { Authorization: \`Bearer \${token}\` },
  body: form,
});
\`\`\`

After upload, the document is staged but not visible at `aem.page`/`aem.live`.
Trigger preview/publish per [platform.md §6](./platform.md):

\`\`\`bash
curl -X POST -H "Authorization: Bearer $TOKEN" \\
  "https://admin.hlx.page/preview/{org}/{repo}/{branch}/{path-no-extension}"
\`\`\`

### Ordering: binaries first, HTML second

If the HTML references images, videos, or other media via
`https://content.da.live/...` URLs, those binaries must already exist at
the referenced paths when the HTML is uploaded. Otherwise the document
will render but the references will resolve to 404s.

Upload order:

1. Upload all referenced binaries via the DA Source API (per
   [media.md](./media.md)).
2. Upload the HTML document via the DA Source API (§11 above).
3. Trigger preview for the document (binaries don't need preview).
4. Trigger publish for the document if going to production.
\`\`\`

- [ ] **Step 5: Verify §1-§11 all present and cross-references resolve**

Run:
```bash
grep -c '^## ' skills/eds-da-content/references/html-content.md
grep -oE '\[([^]]+)\]\(\./[^)]+\)' skills/eds-da-content/references/html-content.md | sort -u
```

Expected: 11 sections; references to both `media.md` and `platform.md`.

- [ ] **Step 6: Verify all cross-referenced files exist**

Run:
```bash
test -f skills/eds-da-content/references/platform.md && echo "platform.md OK"
test -f skills/eds-da-content/references/media.md && echo "media.md OK"
```

Expected: both lines printed.

- [ ] **Step 7: Commit**

```bash
git add skills/eds-da-content/references/html-content.md
git commit -m "docs(eds-da-content): html-content.md sections 8-11 (links, images, encoding, handoff)"
```

---

## Task 5: `SKILL.md` — entrypoint, rules, index, glossary

**Files:**
- Create: `skills/eds-da-content/SKILL.md`

**Source material:** the three references (now complete), the spec.

- [ ] **Step 1: Write the frontmatter and intro**

Create `skills/eds-da-content/SKILL.md` with:

\`\`\`markdown
---
name: eds-da-content
description: Reference for producing Adobe Document Authoring (DA) and Edge Delivery Services (EDS) compatible content. Use whenever generating HTML for DA upload, uploading media binaries to DA, or driving the DA admin API (auth, source PUT, preview/publish). Covers block table HTML format, section structure, page/section metadata blocks, icons, links, images, default content, document skeleton constraints, the DA Source API contract, IMS auth, media storage patterns, supported formats and size limits, Media Bus vs Content Bus delivery, and the silent-failure rules that corrupt content.
---

# DA + EDS content reference

A reference skill — not a workflow. Use it whenever you need to know **what
the rules are** for generating, uploading, or delivering content through
Adobe Document Authoring (DA) and Edge Delivery Services (EDS).

This skill consolidates rules from three primary surfaces. Load the
reference for the task at hand:

| Doing | Read |
|---|---|
| Generating HTML for DA upload | [references/html-content.md](./references/html-content.md) |
| Uploading images, video, PDFs, fonts | [references/media.md](./references/media.md) |
| Hitting the DA admin API, auth, preview/publish | [references/platform.md](./references/platform.md) |

Every factual claim in the references is tagged `[verified]` (read from
code or observed empirically) or `[assumed]` (inferred from documentation
without direct verification).
\`\`\`

- [ ] **Step 2: Write the "When to use this skill" section**

Append:

\`\`\`markdown
## When to use this skill

Invoke this skill whenever you are:

- Generating HTML that will be uploaded to DA (`admin.da.live/source/...`).
- Uploading any binary (PNG, JPG, SVG, MP4, PDF, WOFF2) to DA.
- Calling `admin.da.live` (Source API) or `admin.hlx.page` (preview /
  publish API) directly.
- Reading a DA-stored HTML document and modifying it before re-upload.
- Diagnosing why a generated page renders incorrectly on `aem.page` /
  `aem.live` (silent failures: `about:error` images, missing meta tags,
  blocks rendering as plain tables).

### When NOT to use this skill

- Writing block JS or CSS for a project — that's covered by Adobe's
  `adobe/skills` repo and `aem-boilerplate/AGENTS.md`. This skill covers
  the *content* side, not the *code* side.
- Universal Editor, structured-content authoring, or AEM Cloud Service
  (Java / OSGi / JCR). Out of scope.
\`\`\`

- [ ] **Step 3: Write the 10 silent-failure rules**

Append:

\`\`\`markdown
## The 10 silent-failure rules

These rules, if violated, produce broken content without any error from DA,
the pipeline, or the renderer. Memorize them; verify them in generated
output before upload.

1. **DA HTML is a body fragment.** No `<!DOCTYPE>`, no `<html>`, no `<head>`,
   no `<script>`, no `<style>`, no inline `style=` attributes. The pipeline
   injects head/scripts/styles from Code Bus at delivery.
   → [html-content.md §1](./references/html-content.md)

2. **Block tables need a merged first cell.** First row must be a single
   `<td>` containing the block name. Multi-cell first rows or empty first
   cells render as plain HTML tables (no JS, no CSS).
   → [html-content.md §3](./references/html-content.md)

3. **Block names use alphanumeric + single hyphens only.** No underscores,
   no double dashes, no digit-first names. Variants in parentheses: `Block
   (option-a, option-b)`.
   → [html-content.md §3](./references/html-content.md)

4. **Page Metadata block header is exactly `Metadata`.** Case-insensitive.
   Misspellings (`Meta Data`, `Metadata:`) are silently ignored — no
   `<meta>` tags emitted.
   → [html-content.md §5](./references/html-content.md)

5. **Image URLs must be full URLs.** Repo-relative (`/path/foo.png`) and
   document-relative (`./foo.png`) paths render as `<img src="about:error">`.
   Use `https://content.da.live/{org}/{repo}/<path>` or external URLs.
   → [html-content.md §9](./references/html-content.md)

6. **Referenced binaries must exist before the HTML is uploaded.** Upload
   binaries first, then the HTML. Otherwise the document loads but media
   references 404.
   → [media.md §3.1](./references/media.md), [html-content.md §11](./references/html-content.md)

7. **DA Source API requires `multipart/form-data` with field name `data`.**
   Other field names (`file`, `image`) return 200 OK with no file written.
   → [platform.md §2](./references/platform.md)

8. **SVG hard cap is 40 KB.** PNG/JPG/AVIF/WEBP cap is 20 MB. MP4 cap is
   36 MB. Exceeding fails delivery silently.
   → [media.md §5.1](./references/media.md)

9. **Preview / publish is a required separate step.** Uploading to DA does
   NOT make the document visible at `aem.page` / `aem.live`. POST to
   `admin.hlx.page/preview/...` then `/live/...` after upload.
   → [platform.md §6](./references/platform.md)

10. **IMS tokens expire silently with 401 + empty body.** Dev tokens last
    24 hours. Always pre-flight expiry against `expires_at` in
    `.hlx/.da-token.json` before a long upload run.
    → [platform.md §3](./references/platform.md)
\`\`\`

- [ ] **Step 4: Write the glossary**

Append:

\`\`\`markdown
## Glossary

Terms used across all three references.

- **Admin API** — `https://admin.hlx.page/<action>/...` endpoint family.
  Controls document lifecycle (preview, publish, status). Distinct from
  the DA Source API.
- **Code Bus** — files delivered from the git-tracked GitHub branch
  (typically `/fonts/`, `/icons/`, `/blocks/`, `/scripts/`, `/styles/`,
  `/head.html`). Updated by code deploy.
- **Content Bus** — files delivered from DA at their original path
  (SVG, PDF, HTML, JSON, ICO, WOFF2). Updated by preview/publish.
- **DA editor** — the web UI at `https://da.live/edit#/...` for human
  authoring of documents.
- **DA Source API** — `https://admin.da.live/source/...` endpoint for
  read/write of DA-tracked files (HTML and binaries).
- **Default content** — anything in an EDS page outside a block table:
  headings, paragraphs, lists, links, images. Renders as standard HTML.
- **Dot-folder** — `/<parent>/.<docname>/` folder created automatically
  by the DA editor for per-document author uploads of images.
- **EDS** — Edge Delivery Services. The rendering pipeline that serves
  `aem.page` (preview) and `aem.live` (production), consuming DA content
  + Code Bus + Media Bus.
- **IMS token** — Adobe Identity Management access token. Cached at
  `.hlx/.da-token.json`. Used for auth against the DA Source API and the
  Admin API.
- **Media Bus** — content-addressed backend for image and video binaries
  (PNG, JPG, AVIF, WEBP, MP4). Dedup by SHA hash; permanent cache.
- **`/media` folder** — top-level DA folder convention for shared
  binaries referenced across documents/branches/iterations. Auto-creates
  on first PUT.
- **Preview / Publish** — Admin API operations that promote a document
  from "stored in DA" to "available at `aem.page`" (preview) or
  "available at `aem.live`" (publish).
- **Section** — a `<div>` directly inside `<main>` in a DA HTML document.
  Becomes `<div class="section">` after decoration.
- **Section Metadata** — block whose `Style` key adds CSS classes to the
  enclosing section. NOT for SEO metadata (that's Page Metadata).
- **Page Metadata** — block whose key/value rows become `<head>` `<meta>`
  tags at delivery. One per page; conventionally last in document.
\`\`\`

- [ ] **Step 5: Verify SKILL.md structure**

Run:
```bash
grep -n '^## ' skills/eds-da-content/SKILL.md
```

Expected: "When to use this skill", "The 10 silent-failure rules",
"Glossary".

- [ ] **Step 6: Verify the 10 rules are exactly 10**

Run:
```bash
grep -cE '^[0-9]+\. ' skills/eds-da-content/SKILL.md
```

Expected: at least 10 (the numbered list).

- [ ] **Step 7: Verify all SKILL.md cross-references point to existing files**

Run:
```bash
grep -oE '\(\./references/[^)]+\)' skills/eds-da-content/SKILL.md | sort -u | sed 's#[()]##g' | while read p; do
  test -f "skills/eds-da-content/$p" && echo "OK: $p" || echo "MISSING: $p"
done
```

Expected: all OK, no MISSING.

- [ ] **Step 8: Commit**

```bash
git add skills/eds-da-content/SKILL.md
git commit -m "docs(eds-da-content): add SKILL.md entrypoint with 10 silent-failure rules"
```

---

## Task 6: Cross-reference verification across all files

**Files:**
- Verify: all four files in `skills/eds-da-content/`

- [ ] **Step 1: List every cross-reference in the skill**

Run:
```bash
grep -rnE '\(\.\/[^)]+\.md[^)]*\)' skills/eds-da-content/
```

Records the source line and target path of every Markdown link to a
sibling file in the skill.

- [ ] **Step 2: Verify every target file exists**

Run:
```bash
grep -rohE '\(\.\/[^)]+\.md\)' skills/eds-da-content/ | sed 's#[()]##g' | sort -u | while read p; do
  # Resolve relative to skill root (paths are relative to file location;
  # both SKILL.md and references/ files refer to references/*.md or ./platform.md etc.)
  found=0
  for base in "skills/eds-da-content" "skills/eds-da-content/references"; do
    test -f "$base/$p" 2>/dev/null && { echo "OK: $base/$p"; found=1; break; }
  done
  [ "$found" = "0" ] && echo "MISSING: $p"
done
```

Expected: every line OK, no MISSING.

- [ ] **Step 3: Verify the cross-reference graph matches the design**

The design specifies:
- SKILL.md → references/{platform,media,html-content}.md
- html-content.md → media.md, platform.md
- media.md → platform.md, html-content.md
- platform.md → media.md (only the URL card footer)

Run:
```bash
echo "== SKILL.md references =="
grep -oE '\(\./references/[^)]+\)' skills/eds-da-content/SKILL.md | sort -u
echo "== html-content.md references =="
grep -oE '\(\./[^)]+\.md[^)]*\)' skills/eds-da-content/references/html-content.md | sort -u
echo "== media.md references =="
grep -oE '\(\./[^)]+\.md[^)]*\)' skills/eds-da-content/references/media.md | sort -u
echo "== platform.md references =="
grep -oE '\(\./[^)]+\.md[^)]*\)' skills/eds-da-content/references/platform.md | sort -u
```

Verify the output matches the expected pattern. If a reference is missing
or a forbidden one is present, edit the relevant file and re-run.

- [ ] **Step 4: Verify [verified] / [assumed] tag density**

Run:
```bash
for f in skills/eds-da-content/SKILL.md skills/eds-da-content/references/*.md; do
  lines=$(wc -l < "$f")
  tags=$(grep -c '\[verified\]\|\[assumed\]' "$f")
  echo "$f: $tags tags / $lines lines"
done
```

Expected: each reference file has at least 1 tag per 15 lines of content.
SKILL.md does not need tags (it summarizes from references).

- [ ] **Step 5: If tag density is low, add tags inline**

For any reference file with fewer than the expected tags, read it and add
`[verified]` or `[assumed]` to factual claims that lack provenance. Use
`[assumed]` if the claim is documentation-derived without direct
verification; use `[verified]` if the claim is from primary source code
or empirically tested.

- [ ] **Step 6: Commit any tag additions**

```bash
git add skills/eds-da-content/
git commit -m "docs(eds-da-content): tighten provenance tags across references" || echo "No changes."
```

---

## Task 7: Slicc compatibility check

**Files:** verify only

- [ ] **Step 1: Confirm SKILL.md frontmatter is well-formed YAML**

Run:
```bash
head -5 skills/eds-da-content/SKILL.md
```

Expected: starts with `---`, has `name:` and `description:` keys, ends
frontmatter with `---`.

- [ ] **Step 2: Confirm Slicc directory shape**

Slicc discovers skills at `/workspace/skills/<name>/SKILL.md` (one level
deep — references/ subdirectory is fine).

Run:
```bash
find skills/eds-da-content -type f
```

Expected output:
```
skills/eds-da-content/SKILL.md
skills/eds-da-content/references/platform.md
skills/eds-da-content/references/media.md
skills/eds-da-content/references/html-content.md
```

- [ ] **Step 3: Verify install command works for the new skill**

Per CLAUDE.md, installation uses:
```bash
upskill aemcoder/skills --path skills/migration --all
```

The new skill is at `skills/eds-da-content`, NOT under `skills/migration`.
A separate install command targets it:

```bash
upskill aemcoder/skills --path skills --all
```

This installs all skills under `skills/` (snowflake, migration/*, eds-da-content).
Alternatively, a targeted install:

```bash
upskill aemcoder/skills --path skills/eds-da-content
```

No code change needed — Slicc resolves the path on install. Verify by
reading CLAUDE.md.

Run:
```bash
grep -n 'upskill\|--path' CLAUDE.md
```

Expected: confirm the existing install pattern accommodates `skills/<name>`
as a top-level path. If not, this is the moment to flag a CLAUDE.md
update — but **don't modify CLAUDE.md as part of this plan**; just confirm.

- [ ] **Step 4: No commit needed**

Nothing changed in this task — verification only.

---

## Task 8: Final review and push

- [ ] **Step 1: Re-read all four files end-to-end**

Read each file once, looking for:

- Broken sentence flow / typos
- Sections that reference content not actually in the file
- Cross-references whose anchor (`#section-id`) doesn't exist in the
  target
- Code blocks with syntax errors

For each issue found, fix it inline. Common issues:

- Forgotten escaping in code blocks containing backticks
- Tables with mismatched column counts
- Numbered list items that restart at 1

- [ ] **Step 2: Commit any review fixes**

```bash
git status
git diff
git add skills/eds-da-content/
git commit -m "docs(eds-da-content): final review pass — fixes" || echo "No changes."
```

- [ ] **Step 3: Verify the final shape one more time**

Run:
```bash
find skills/eds-da-content -type f -exec wc -l {} \;
```

Expected approximate sizes:
- SKILL.md: 130-180 lines
- references/platform.md: 250-350 lines
- references/media.md: 550-700 lines (adopted from 700-line source with
  trims for cross-references)
- references/html-content.md: 600-800 lines

- [ ] **Step 4: Show recent commits for the branch**

Run:
```bash
git log --oneline -20
```

Expected: 8-12 commits with `docs(eds-da-content):` prefix.

- [ ] **Step 5: Hand off to user for review**

The skill is complete. The user can:
1. Review the skill files in `skills/eds-da-content/`.
2. Test discovery by invoking the skill from another agent / skill.
3. Open a PR if satisfied.

---

## Self-Review Notes

**Spec coverage check:**

| Spec section | Tasks that implement it |
|---|---|
| SKILL.md (entrypoint, frontmatter, 10 rules, index, glossary) | Task 5 |
| references/html-content.md (11 topical sections) | Tasks 4A, 4B, 4C |
| references/media.md (adopted from DA-MEDIA-REFERENCE.md) | Tasks 3A, 3B, 3C |
| references/platform.md (9 sections) | Tasks 2A, 2B, 2C |
| Cross-reference graph (inline-minimum / pointer-deep) | Tasks 3A, 3B, 3C (pointers to platform.md), Task 4C (§9 cross-ref to media.md, §11 to platform.md), Task 6 (verification) |
| `[verified]` / `[assumed]` tagging | Every reference task; Task 6 step 4-5 (density check) |
| Existing snowflake/eds-da-mechanics.md untouched | (not touched by any task) |
| DA-MEDIA-REFERENCE.md adopted but original kept | Task 3A step 1 (copy, not move) |

**Placeholder scan:**

- All task steps contain concrete content (file paths, commands, prose).
- No "TBD" / "TODO" / "fill in details" markers.
- Code blocks shown where needed (Markdown content, shell commands).
- Per-section content provided for the prose-writing steps; no
  "implement as described" pointers.

**Type/name consistency:**

- File paths consistently use `skills/eds-da-content/` (skill root) and
  `references/<name>.md` (reference files).
- Cross-reference paths consistently use `./<file>.md` (Markdown link
  relative path).
- Provenance tags consistently `[verified]` and `[assumed]`.
- Block name normalizer function name `toClassName` matches across
  references.

---

## Execution Note

After plan approval, dispatch via `superpowers:subagent-driven-development`
(recommended for review checkpoints between tasks) or
`superpowers:executing-plans` (inline batch execution).
