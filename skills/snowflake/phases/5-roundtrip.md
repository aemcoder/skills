# Phase 5 — Round-trip

Goal: verify the converted page renders correctly end-to-end —
both locally (dev server) and on production preview
(branch host).

**Production round-trip is the default**, not an option to skip.
If a condition appears that suggests skipping (e.g. local-only
source assets, perceived blockers), surface it to the user as a
question — don't decide unilaterally.

## Knowledge to load

Round-trip failures often map to known gotchas. Before driving the
browser, skim (using the override-then-bundled resolution from
`SKILL.md`):
- `learnings.md` — the entries on Media Bus URL handling, CORS for
  fonts, scroll-animation screenshot quirks, asset hosting modes
- `eds-da-mechanics.md` — for the pipeline shape and admin API
  details if you need to dig into a failure

## 5.1 — Local round-trip

```bash
# Start the dev server. Hosts that support backgrounding can run
# this in the background; otherwise run in a separate terminal and
# proceed manually.
npx -y @adobe/aem-cli up --html-folder drafts --no-open --forward-browser-logs &
DEV_PID=$!

# Wait for the server (max ~15s)
for i in $(seq 1 15); do
  curl -sf http://localhost:3000/ -o /dev/null && break
  sleep 1
done
```

Load the page in `playwright-cli`:

```bash
PAGE="http://localhost:3000/drafts/${TEMPLATE_NAME}-${PAGE_SLUG}.html"
TAB=$(playwright-cli tab-new "$PAGE" | grep -oE 'tab [a-z0-9-]+' | awk '{print $2}')
sleep 2  # give Lenis/IntersectionObservers a moment
```

Verify with `playwright-cli evaluate`:

```bash
playwright-cli evaluate --tab "$TAB" '
  ({
    overlayApplied: document.querySelector("main")?.dataset?.overlay,
    sectionCount: document.querySelectorAll("main section[class]").length,
    sectionClasses: [...document.querySelectorAll("main section[class]")]
      .map(s => s.className.split(" ")[0]),
    consoleErrors: (window.__errors || []).length,
    bodyAppearClass: document.body.classList.contains("appear")
  })
'
```

Expect:
- `overlayApplied` === `<TEMPLATE_NAME>`
- `sectionCount` matches `state.sectionCount` from Generate
- `sectionClasses` matches the unique-first-class list from
  `decisions.json`
- `consoleErrors` === 0 (or only CORS-on-font errors if source is
  cross-origin and not vendored)
- `bodyAppearClass` === true

### Section-by-section screenshots

For scroll-animated pages (sticky hero, parallax, IntersectionObserver
fade-ins), a `fullPage:true` screenshot is misleading — captured in
initial-scroll state, sticky elements leave gaps, `.anim-enter`
elements are `opacity:0`. Capture per-section:

```bash
PROJ="${PROJECTS_DIR}/${NNN}-${SLUG}"
mkdir -p "$PROJ/diff"

for class in $SECTION_CLASSES; do
  playwright-cli evaluate --tab "$TAB" "
    document.querySelector('.$class')?.scrollIntoView({block:'start'});
  "
  sleep 1  # let animations settle
  playwright-cli screenshot --tab "$TAB" \
    --output "$PROJ/diff/local-$class.jpg" --type jpeg --quality 90
done
```

### Stop the dev server

```bash
kill $DEV_PID 2>/dev/null || true
```

## 5.1.1 — DOM-equality check (local)

After the structural checks and screenshots pass, run a deterministic
DOM comparison between the original source and the rendered overlay.
This is what makes the "1:1 with the source" claim auditable rather
than something we take on faith.

```bash
node "<SKILL_DIR>/scripts/dom-equality.mjs" \
  --source        "$SOURCE_URL" \
  --rendered      "http://localhost:3000/drafts/${TEMPLATE_NAME}-${PAGE_SLUG}.html" \
  --report        "$PROJ/diff/dom-equality-local.md" \
  --source-scope  body \
  --rendered-scope body
```

(Use `--scope body` shorthand if the source and rendered share the
same scope. Use separate flags when they don't — the source may
lack a `<main>` while the rendered template synthesizes one.)

The script captures four dimensions on each page (after waiting for
the overlay engine to apply on the rendered side):
- Element count
- Tag+class sequence (positional)
- Visible text (whitespace-normalised)
- Image src list (Media Bus rewrites are normalised — `./media_<sha>.<ext>`
  is expected, not a regression)

Output is a markdown report. Exit 0 on PASS, 1 on FAIL.

**Interpreting the report:**
- **PASS** — overlay is 1:1 with the source. Move on.
- **FAIL** with small deltas — usually expected wrapper-element diffs
  (EDS injects `<header class="header-wrapper">` around the fetched
  header fragment; the substrate synthesizes `<main>` if the source
  lacks one; dev-tool markup gets stripped). Compare to a known-good
  prior run as a baseline.
- **FAIL** with large deltas, or a first-divergence inside a slot
  block — investigate. The first divergence in tagSequence and the
  first-divergent-character in visibleText are usually the smoking
  gun.

## 5.2 — Production round-trip

This produces a feature-branch preview URL that loads the deployed
artifacts from code-bus and the DA-stored content from content-bus.

### 5.2.1 — Create the run branch

The branch name is `${BRANCH_PREFIX}${NNN}` where `BRANCH_PREFIX`
comes from `.snowflake/config.json` (default: `snowflake-`):

```bash
BRANCH_PREFIX=$(jq -r '.branchPrefix // "snowflake-"' \
  .snowflake/config.json 2>/dev/null || echo "snowflake-")
BRANCH="${BRANCH_PREFIX}${NNN}"

git checkout -b "$BRANCH"
git add \
  templates/${TEMPLATE_NAME}.html \
  fragments/${TEMPLATE_NAME}/ \
  styles/${TEMPLATE_NAME}.css \
  styles/${TEMPLATE_NAME}-*.css \
  scripts/${TEMPLATE_NAME}-animations.js \
  scripts/${TEMPLATE_NAME}-*.js \
  drafts/${TEMPLATE_NAME}-${PAGE_SLUG}.html \
  ${PROJECTS_DIR}/${NNN}-${SLUG}/

# If asset strategy was vendor:
[ "$ASSET_STRATEGY" = "vendor" ] && git add assets/

git commit -m "snowflake #${NNN} — ${SLUG} overlay"
git push -u origin "$BRANCH"
```

The default `snowflake-` (hyphen) keeps the branch name identical
to the aem.page hostname segment and the admin.hlx.page URL
segment — no encoding gymnastics. If your repo uses a slash-style
convention (`snowflake/001`), set `branchPrefix` accordingly in
`.snowflake/config.json`; you'll then need to translate slashes
to dashes when constructing the aem.page hostname (AEM Code Sync
flattens slashes). See the note at 5.2.3.

### 5.2.2 — Push DA doc

```bash
TOKEN=$(jq -r .access_token .hlx/.da-token.json 2>/dev/null \
       || jq -r .access_token ~/.hlx/.da-token.json)

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "FAIL: DA token not found at .hlx/.da-token.json or ~/.hlx/.da-token.json"
  exit 1
fi

OWNER_REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
OWNER=${OWNER_REPO%/*}
REPO=${OWNER_REPO#*/}

curl -X PUT -H "Authorization: Bearer $TOKEN" \
  -F "data=@${PROJECTS_DIR}/${NNN}-${SLUG}/output/da/${PAGE_SLUG}.html;type=text/html" \
  "https://admin.da.live/source/${OWNER}/${REPO}/${DA_ROOT#/}/${PAGE_SLUG}.html" \
  | tee /tmp/da-put.json
```

Expected response: JSON with `previewUrl` field.

### 5.2.3 — Trigger preview

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  "https://admin.hlx.page/preview/${OWNER}/${REPO}/${BRANCH}/${DA_ROOT#/}/${PAGE_SLUG}"
```

Expected: HTTP 200 with JSON containing `preview.status: 200` and a
`preview.url` matching
`https://${BRANCH}--${REPO}--${OWNER}.aem.page/${DA_ROOT}/${PAGE_SLUG}`.

**Branch names with slashes.** AEM Code Sync flattens `/` to `-` in
the aem.page hostname (so a branch `feature/001` is served at
`feature-001--<repo>--<owner>.aem.page`) but expects the literal
branch in the admin.hlx.page URL. If you've configured a slash-style
`branchPrefix`, compute both forms:

```bash
BRANCH_HOST=$(echo "$BRANCH" | tr '/' '-')   # for aem.page hostname
# $BRANCH (literal) for admin.hlx.page URL
```

…and substitute accordingly below. The default `branchPrefix` uses
a hyphen so no translation is needed.

### 5.2.4 — Wait for code-bus to deploy

Code Sync usually takes a few seconds:

```bash
PROD_BASE="https://${BRANCH}--${REPO}--${OWNER}.aem.page"
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$PROD_BASE/templates/${TEMPLATE_NAME}.html")
  [ "$code" = "200" ] && break
  sleep 1
done

# Sanity-probe all deployed paths
for p in \
  "/templates/${TEMPLATE_NAME}.html" \
  "/styles/${TEMPLATE_NAME}.css" \
  "/fragments/${TEMPLATE_NAME}/header.html" \
  "/scripts/${TEMPLATE_NAME}-animations.js"; do
  echo "$p $(curl -s -o /dev/null -w '%{http_code}' "$PROD_BASE$p")"
done
```

Each should return 200. If any are 404, Code Sync may still be in
flight — wait a few more seconds and retry, or use the
`admin.hlx.page/code/...` force-refresh endpoint.

### 5.2.5 — Load production preview

```bash
PAGE="$PROD_BASE/${DA_ROOT}/${PAGE_SLUG}"
TAB=$(playwright-cli tab-new "$PAGE" | grep -oE 'tab [a-z0-9-]+' | awk '{print $2}')
sleep 3
```

Verify (same shape as local):

```bash
playwright-cli evaluate --tab "$TAB" '
  ({
    overlayApplied: document.querySelector("main")?.dataset?.overlay,
    sectionCount: document.querySelectorAll("main section[class]").length,
    storyBg: document.querySelector(".story-card__photo, [style*=\"background-image\"]")?.style?.backgroundImage,
    consoleErrors: (window.__errors || []).length,
  })
'
```

Expect:
- `overlayApplied` === `<TEMPLATE_NAME>`
- `sectionCount` matches
- Any background-image slot src has been rewritten by Media Bus to
  `./media_<sha>.png?width=...` form — confirms DA cells used absolute
  URLs (if they don't, you'll see `about:error` here; fix is in the
  Generate self-check 3.9).
- `consoleErrors` === 0

Capture screenshots into `${PROJECTS_DIR}/${NNN}-${SLUG}/diff/`
with a `production-` prefix.

### 5.2.5.1 — DOM-equality check (production)

Same comparison as 5.1.1, but against the production preview URL.
On production, Media Bus rewrites `<img>` URLs in DA-cell content;
the script normalises those (`./media_<sha>.<ext>` matches any
source path).

```bash
node "<SKILL_DIR>/scripts/dom-equality.mjs" \
  --source        "$SOURCE_URL" \
  --rendered      "$PAGE" \
  --report        "$PROJ/diff/dom-equality-production.md" \
  --source-scope  body \
  --rendered-scope body
```

Compare against the local report from 5.1.1 — the two should produce
the same shape of differences. Production-only differences usually
mean Code Sync timing (template/CSS not yet served), a Media Bus
URL that escaped normalisation, or font CORS on a cross-origin
source.

### 5.2.6 — If something is broken

Diagnose, not workaround. Common patterns:

- **`about:error` in background-image** → DA cells used root-relative
  URLs; Media Bus requires absolute. Fix the DA doc and re-PUT.
- **Half-empty cards** → wrapping `<a>` was slotted while its
  children were ALSO slotted; the slot writer wiped children. Drop
  the wrap slot in template + DA, keep child slots.
- **Wrong font** → template's head `<link>`s didn't land in
  `<head>`, or vendored fonts have spaces in path. Inspect the
  rendered `<head>` and the network requests.
- **`overlayApplied` is null** → metadata block isn't being picked
  up; check it's a `<div class="metadata">` INSIDE `<main>`, not a
  `<table>` in `<footer>`.

If the same issue exists locally, fix in Generate output + re-Wire +
re-Round-trip. If it's prod-only, suspect Code Sync caching, Media
Bus rules, or a template/DA URL mismatch.

## Update state and finish

Set `state.phase = "roundtrip"`, `state.phaseStatus = "complete"`,
`state.roundtripCompletedAt = "<timestamp>"`. Record:
- `state.localUrl`
- `state.productionUrl`
- `state.daEditorUrl` = `https://da.live/edit#/<owner>/<repo>/<da-root>/<page-slug>`

Continue to Phase 6 (Reflect).
