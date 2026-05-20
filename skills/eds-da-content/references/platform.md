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

```javascript
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

async function putToDA({ absPath, daPath, mime, token, org, repo }) {
  const buf  = readFileSync(absPath);
  const blob = new Blob([buf], { type: mime });
  const form = new FormData();
  form.append('data', blob, basename(absPath));        // field name MUST be "data"
  const url = `https://admin.da.live/source/${org}/${repo}/${daPath}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error(`PUT ${url} → ${res.status}`);
  return res.json();
}
```

### curl equivalent

```bash
curl -X PUT \
  -H "Authorization: Bearer $DA_TOKEN" \
  -F "data=@./hero.png" \
  "https://admin.da.live/source/$ORG/$REPO/media/hero.png"
```

With curl's `-F` shorthand, the multipart boundary and field name are set
correctly. Use the literal field name `data`.

## 3. IMS authentication and token handling

All DA Source API and Admin API calls use the same Adobe IMS access token.

### Acquisition

The first-time / interactive path:

```bash
npx -y @adobe/aem-cli content clone --path /<subpath>
```

Opens a browser for IMS sign-in. The resulting token is cached at
`.hlx/.da-token.json` (per project, must be gitignored). `[verified]`

### Token file shape

```json
{
  "access_token": "eyJ...",
  "expires_at": 1778494729459
}
```

`expires_at` is Unix milliseconds. `[verified]`

### Pre-flight expiry check

The token expires silently — subsequent requests return 401 with an empty
body. Always check before a long-running upload run:

```javascript
const tok = JSON.parse(readFileSync('.hlx/.da-token.json', 'utf8'));
const expMs = typeof tok.expires_at === 'number'
  ? tok.expires_at
  : JSON.parse(Buffer.from(tok.access_token.split('.')[1], 'base64').toString()).exp * 1000;

if (expMs <= Date.now()) {
  throw new Error(`DA token expired at ${new Date(expMs).toISOString()}. Re-auth required.`);
}
if (expMs - Date.now() < 5 * 60 * 1000) {
  console.warn(`DA token expires in ${Math.floor((expMs - Date.now()) / 60_000)} minutes`);
}
```

### Permission scope

The token is bearer-scoped to the IMS user. There is no per-asset ACL — a
bearer can read/write everything in the `{org}/{repo}` it has access to.
`[verified]`
