# DA (Document Authoring) Upload API — Findings

## Overview

These findings document the correct way to upload content (HTML pages and images) to Adobe's Document Authoring (DA) platform via its API, and have EDS (Edge Delivery Services) render them correctly. Discovered during migration of https://www.astrazeneca.com/ to `aemcoder/vibemigrated`.

---

## 1. Authentication

```bash
TOKEN=$(oauth-token adobe)
```

All DA admin API calls require:
```
-H "Authorization: Bearer $TOKEN"
```

---

## 2. Uploading Images

### Endpoint
```
PUT https://admin.da.live/source/{org}/{repo}/{path}/{filename}
```

### Method: Multipart Form Data (REQUIRED)

Binary PUT does NOT persist. You MUST use multipart form upload:

```bash
# ✅ CORRECT — multipart form
curl -s -X PUT \
  "https://admin.da.live/source/aemcoder/vibemigrated/${BRANCH}/images/${FILENAME}" \
  -H "Authorization: Bearer $TOKEN" \
  -F "data=@${LOCAL_PATH};type=${CONTENT_TYPE}"

# ❌ WRONG — binary PUT (returns 201 but data does not persist)
curl -s -X PUT \
  "https://admin.da.live/source/aemcoder/vibemigrated/${BRANCH}/images/${FILENAME}" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: image/jpeg" \
  --data-binary "@${LOCAL_PATH}"
```

### Filename Rules

DA **lowercases all filenames** on upload. A file uploaded as `AZ2686_Photo.jpg` becomes `az2686_photo.jpg` in DA.

Additionally, some filenames cause the EDS preview API (`admin.hlx.page/preview/...`) to return 404 even though the file exists in DA. Filenames that consistently fail:

- Names starting with a digit followed by underscore: `1_t5lxc1fg.webp`
- Names with consecutive uppercase letters and underscores: `AZ2686_Therapeutic_Protein_RGB_Magenta_900x500.jpg`
- Names with double hyphens: `AZ3146--Female-Adult-11_900x500.jpg`

**Recommendation:** Rename images to simple lowercase kebab-case before uploading:
```
1_t5lxc1fg.webp → trending-story.webp
AZ2686_Therapeutic_Protein_RGB_Magenta_900x500.jpg → therapeutic-protein.jpg
AZ3146--Female-Adult-11_900x500.jpg → female-adult.jpg
```

### Image Preview

After uploading images, you MUST trigger a preview for each image before they become accessible on the EDS CDN:

```bash
curl -s -X POST \
  "https://admin.hlx.page/preview/{org}/{repo}/main/{branch}/images/{filename}" \
  -H "Authorization: Bearer $TOKEN"
```

Without this step, the image returns 404 on `https://main--{repo}--{org}.aem.page/{branch}/images/{filename}`.

### Verifying Images

```bash
# Check DA has the file
curl -s "https://admin.da.live/list/{org}/{repo}/{branch}/images" \
  -H "Authorization: Bearer $TOKEN"

# Check it's accessible via EDS CDN (after preview)
curl -s -o /dev/null -w "%{http_code}" \
  "https://main--{repo}--{org}.aem.page/{branch}/images/{filename}"
```

---

## 3. Uploading HTML Content (Pages, Nav, Footer)

### Endpoint
```
PUT https://admin.da.live/source/{org}/{repo}/{path}/{docname}.html
```

### Method: Multipart Form Data (same as images)

```bash
curl -s -X PUT \
  "https://admin.da.live/source/aemcoder/vibemigrated/${BRANCH}/index.html" \
  -H "Authorization: Bearer $TOKEN" \
  -F "data=@${LOCAL_PATH};type=text/html"
```

### CRITICAL: Full HTML Document Required

DA's HTML-to-Markdown pipeline ONLY processes content inside `<main>`. If you upload a bare HTML fragment, the pipeline produces an empty `<div></div>` and the page renders blank.

```html
<!-- ❌ WRONG — fragment only, produces empty output -->
<div>
  <table>
    <tr><td>hero</td></tr>
    <tr><td><h1>Hello</h1></td></tr>
  </table>
</div>

<!-- ✅ CORRECT — full HTML document with <main> wrapper -->
<!DOCTYPE html>
<html>
<head><title></title></head>
<body>
<header></header>
<main>
<div>
  <table>
    <tr><td>hero</td></tr>
    <tr><td><h1>Hello</h1></td></tr>
  </table>
</div>
</main>
<footer></footer>
</body>
</html>
```

### Block Content: Table Format

EDS blocks in DA content use HTML tables where the first row/cell contains the block name:

```html
<div>
  <table>
    <tr><td colspan="2">block-name</td></tr>
    <tr>
      <td>Column 1 content</td>
      <td>Column 2 content</td>
    </tr>
  </table>
</div>
```

Each `<div>` wrapping a table is a section. Multiple sections = multiple top-level `<div>`s inside `<main>`.

### Default Content (no block)

Plain content (headings, paragraphs, lists) goes directly in a `<div>` without a table:

```html
<div>
  <h1>Hello World</h1>
  <p>This is default content.</p>
</div>
```

---

## 4. Image References in HTML Content

### CRITICAL: Use Absolute Preview URLs

DA's HTML-to-Markdown pipeline resolves `<img src="...">` by fetching the image URL, generating a content hash, and converting it to a `./media_XXXXX` blob path. If the URL is not publicly accessible (no auth), the pipeline sets `src="about:error"`.

```html
<!-- ❌ WRONG — relative path, DA can't resolve it -->
<img src="/home-866685/images/hero-bg.webp" alt="Hero">
<!-- Result in .plain.html: src="about:error" -->

<!-- ❌ WRONG — content.da.live requires auth, pipeline can't fetch -->
<img src="https://content.da.live/org/repo/branch/images/hero-bg.webp" alt="Hero">
<!-- Result in .plain.html: src="about:error" -->

<!-- ✅ CORRECT — public aem.page preview URL (no auth needed) -->
<img src="https://main--vibemigrated--aemcoder.aem.page/home-866685/images/hero-bg.webp" alt="Hero">
<!-- Result in .plain.html: src="./media_10ff2c35...webp?width=750&format=webp&optimize=medium" -->
```

**This means images must be uploaded AND previewed BEFORE uploading HTML content that references them.** The upload sequence is:

1. Upload all images via multipart form
2. Preview all images via admin API
3. Verify images are accessible at their public `aem.page` URL
4. Upload HTML content with absolute `aem.page` image URLs
5. Preview HTML content

### The `<picture>` Tag

You do NOT need to wrap images in `<picture>` tags in the DA source HTML. DA's pipeline automatically generates responsive `<picture><source>` wrappers with multiple srcsets in the `.plain.html` output:

```html
<!-- What you upload -->
<img src="https://main--repo--org.aem.page/branch/images/photo.jpg" alt="Photo">

<!-- What .plain.html outputs -->
<picture>
  <source type="image/webp" srcset="./media_XXXX.jpg?width=2000&format=webply&optimize=medium" media="(min-width: 600px)">
  <source type="image/webp" srcset="./media_XXXX.jpg?width=750&format=webply&optimize=medium">
  <img loading="lazy" alt="Photo" src="./media_XXXX.jpg?width=750&format=jpg&optimize=medium" width="..." height="...">
</picture>
```

---

## 5. Preview Triggering

After uploading content, you MUST trigger a preview for EDS to process it:

```bash
# For content on the code branch
curl -s -X POST \
  "https://admin.hlx.page/preview/{org}/{repo}/{branch}/{path}" \
  -H "Authorization: Bearer $TOKEN"

# For content visible on main (same DA content, different code)
curl -s -X POST \
  "https://admin.hlx.page/preview/{org}/{repo}/main/{path}" \
  -H "Authorization: Bearer $TOKEN"
```

The first argument after the repo is the **code branch** (which branch's JS/CSS to use), not the content path. The content path follows.

### Preview Response

A successful preview returns JSON with URLs:
```json
{
  "webPath": "/home-866685/",
  "resourcePath": "/home-866685/index.md",
  "preview": {
    "url": "https://main--vibemigrated--aemcoder.aem.page/home-866685/",
    "status": 200,
    "sourceLocation": "markup:https://content.da.live/aemcoder/vibemigrated/home-866685/"
  }
}
```

### Verifying Content

```bash
# Check .plain.html output (what EDS framework receives)
curl -s "https://{branch}--{repo}--{org}.aem.page/{content-path}/index.plain.html"

# If this returns <div></div>, your HTML wasn't in full-document format
# If images show src="about:error", your image URLs weren't publicly accessible
```

---

## 6. Complete Upload Sequence (Correct Order)

```bash
TOKEN=$(oauth-token adobe)
BRANCH="my-branch"
ORG="myorg"
REPO="myrepo"

# Step 1: Upload images (multipart form)
for img in /path/to/images/*; do
  FILENAME=$(basename "$img" | tr '[:upper:]' '[:lower:]')
  curl -s -X PUT \
    "https://admin.da.live/source/${ORG}/${REPO}/${BRANCH}/images/${FILENAME}" \
    -H "Authorization: Bearer $TOKEN" \
    -F "data=@${img};type=image/jpeg"
done

# Step 2: Preview images
for img in /path/to/images/*; do
  FILENAME=$(basename "$img" | tr '[:upper:]' '[:lower:]')
  curl -s -X POST \
    "https://admin.hlx.page/preview/${ORG}/${REPO}/main/${BRANCH}/images/${FILENAME}" \
    -H "Authorization: Bearer $TOKEN"
done

# Step 3: Verify images accessible
for img in /path/to/images/*; do
  FILENAME=$(basename "$img" | tr '[:upper:]' '[:lower:]')
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    "https://main--${REPO}--${ORG}.aem.page/${BRANCH}/images/${FILENAME}")
  echo "$FILENAME: $STATUS"
done

# Step 4: Upload HTML content (with absolute aem.page image URLs)
# Content must be full HTML documents with <main> wrapper
curl -s -X PUT \
  "https://admin.da.live/source/${ORG}/${REPO}/${BRANCH}/index.html" \
  -H "Authorization: Bearer $TOKEN" \
  -F "data=@/path/to/index.html;type=text/html"

# Step 5: Preview content
curl -s -X POST \
  "https://admin.hlx.page/preview/${ORG}/${REPO}/${BRANCH}/${BRANCH}/index" \
  -H "Authorization: Bearer $TOKEN"

# Step 6: Verify
curl -s "https://${BRANCH}--${REPO}--${ORG}.aem.page/${BRANCH}/index.plain.html"
```

---

## 7. `fstab.yaml` Warning

Modern DA-based EDS repos do NOT require `fstab.yaml`. Adding one can BREAK content delivery by overriding the default DA content source mapping. Do not create this file.

---

## 8. URL Structure Summary

| Purpose | URL Pattern |
|---------|-------------|
| DA Admin API (upload/list) | `https://admin.da.live/source/{org}/{repo}/{path}` |
| DA Content API (read) | `https://content.da.live/{org}/{repo}/{path}` |
| DA Editor | `https://da.live/edit#/{org}/{repo}/{path}` |
| DA Listing | `https://admin.da.live/list/{org}/{repo}/{path}` |
| EDS Preview (branch code) | `https://{branch}--{repo}--{org}.aem.page/{content-path}/` |
| EDS Preview (main code) | `https://main--{repo}--{org}.aem.page/{content-path}/` |
| EDS Live | `https://main--{repo}--{org}.aem.live/{content-path}/` |
| Admin Preview Trigger | `POST https://admin.hlx.page/preview/{org}/{repo}/{code-branch}/{content-path}` |
| Image in HTML content | `https://main--{repo}--{org}.aem.page/{branch}/images/{filename}` |
