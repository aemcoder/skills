# Phase 5 — Round-trip

Goal: verify the converted page renders correctly end-to-end —
both locally (dev server) and on production preview
(branch host).

**Production round-trip is the default**, not an option to skip.
If a condition appears that suggests skipping, surface it to the
user as a question — don't decide unilaterally. (Run #005 lesson.)

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
PROJ="experiments/projects/${NNN}-${SLUG}"
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

## 5.2 — Production round-trip

This produces a feature-branch preview URL that loads the deployed
artifacts from code-bus and the DA-stored content from content-bus.

### 5.2.1 — Create the run branch

```bash
git checkout -b sf-overlay-exp-${NNN}
git add \
  templates/${TEMPLATE_NAME}.html \
  fragments/${TEMPLATE_NAME}/ \
  styles/${TEMPLATE_NAME}.css \
  styles/${TEMPLATE_NAME}-*.css \
  scripts/${TEMPLATE_NAME}-animations.js \
  scripts/${TEMPLATE_NAME}-*.js \
  drafts/${TEMPLATE_NAME}-${PAGE_SLUG}.html \
  experiments/projects/${NNN}-${SLUG}/

# If asset strategy was vendor:
[ "$ASSET_STRATEGY" = "vendor" ] && git add assets/

git commit -m "Run #${NNN} — ${SLUG} overlay"
git push -u origin sf-overlay-exp-${NNN}
```

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
  -F "data=@experiments/projects/${NNN}-${SLUG}/output/da/${PAGE_SLUG}.html;type=text/html" \
  "https://admin.da.live/source/${OWNER}/${REPO}/${DA_ROOT#/}/${PAGE_SLUG}.html" \
  | tee /tmp/da-put.json
```

Expected response: JSON with `previewUrl` field.

### 5.2.3 — Trigger preview

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  "https://admin.hlx.page/preview/${OWNER}/${REPO}/sf-overlay-exp-${NNN}/${DA_ROOT#/}/${PAGE_SLUG}"
```

Expected: HTTP 200 with JSON containing `preview.status: 200` and a
`preview.url` matching
`https://sf-overlay-exp-${NNN}--${REPO}--${OWNER}.aem.page/${DA_ROOT}/${PAGE_SLUG}`.

### 5.2.4 — Wait for code-bus to deploy

Code Sync usually takes a few seconds:

```bash
PROD_BASE="https://sf-overlay-exp-${NNN}--${REPO}--${OWNER}.aem.page"
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

Capture screenshots into `experiments/projects/${NNN}-${SLUG}/diff/`
with a `production-` prefix.

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
