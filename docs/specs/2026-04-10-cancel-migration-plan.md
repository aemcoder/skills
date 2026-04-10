# Cancel Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cancel button to the migrate-page sprinkle that stops the cone, cleans up scoops, and resets the UI.

**Architecture:** Two-phase cancel: `slicc.stopCone()` kills the migration cone, then a cleanup lick spawns a fresh cone to drop orphan scoops. A new `mp-cancelling` intermediate view prevents restart during cleanup, with a 10s timeout fallback.

**Tech Stack:** Vanilla JS/HTML/CSS in a Slicc sprinkle `.shtml` file. No build step, no dependencies.

**Spec:** `docs/specs/2026-04-10-cancel-migration-design.md`

---

## File Structure

Single file modified:

- **Modify:** `migration/migrate-page/migrate-page.shtml` — all HTML, CSS, and JS changes

---

### Task 1: Add the mp-cancelling HTML view

**Files:**
- Modify: `migration/migrate-page/migrate-page.shtml:72-84` (insert before `mp-error` view)

- [ ] **Step 1: Add the mp-cancelling view HTML**

Insert a new view block between `mp-done` (ends line 70) and `mp-error` (starts line 72). It follows the same pattern as the other views: hidden by default, has a `.mp-view-heading` for focus management, and uses existing sprinkle CSS classes.

```html
  <div id="mp-cancelling" class="mp-view" style="display:none;">
    <div class="sprinkle-heading mp-view-heading" tabindex="-1">Cancelling</div>
    <div class="sprinkle-body" style="text-align: center; padding: 24px 0;">
      <div class="mp-spinner"></div>
      <div class="sprinkle-detail" style="margin-top: 12px;">Stopping migration...</div>
    </div>
  </div>
```

- [ ] **Step 2: Add the cancel button to mp-migrating view**

In the `mp-migrating` view, add a button group after the progress label (`mp-progress-label`, line 51). The button is secondary style, always visible during migration.

```html
    <div class="sprinkle-btn-group" style="margin-top: 16px; text-align: center;">
      <button class="sprinkle-btn sprinkle-btn--secondary" onclick="cancelMigration()">Cancel</button>
    </div>
```

- [ ] **Step 3: Update the views array in showView()**

The `showView()` function (line 235) has a hardcoded array of view IDs. Add `mp-cancelling`:

```javascript
var views = ['mp-ready', 'mp-migrating', 'mp-done', 'mp-error', 'mp-cancelling'];
```

- [ ] **Step 4: Commit**

```bash
git add migration/migrate-page/migrate-page.shtml
git commit -m "feat(sprinkle): add cancel button and mp-cancelling view HTML"
```

---

### Task 2: Add CSS for the cancelling view

**Files:**
- Modify: `migration/migrate-page/migrate-page.shtml` (CSS section, after `.mp-error-card` block around line 126)

- [ ] **Step 1: Add spinner keyframes and cancelling styles**

Add after the `.mp-error-card` CSS block (line 127):

```css
@keyframes mp-spin {
  to { transform: rotate(360deg); }
}
.mp-spinner {
  display: inline-block;
  width: 24px;
  height: 24px;
  border: 3px solid var(--s2-gray-200, #e1e1e1);
  border-top-color: var(--s2-gray-600, #717171);
  border-radius: 50%;
  animation: mp-spin 0.8s linear infinite;
}
```

- [ ] **Step 2: Add margin for the cancel button group in mp-migrating**

Add after existing `#mp-error .sprinkle-btn-group` rule (line 141):

```css
#mp-migrating .sprinkle-btn-group { margin-top: 16px; }
```

- [ ] **Step 3: Commit**

```bash
git add migration/migrate-page/migrate-page.shtml
git commit -m "feat(sprinkle): add CSS for spinner and cancelling view"
```

---

### Task 3: Implement cancelMigration() and wire up handleUpdate

**Files:**
- Modify: `migration/migrate-page/migrate-page.shtml` (JS section)

- [ ] **Step 1: Add cancelTimeoutId variable**

Add after the `currentPreviewUrl` variable declaration (line 228):

```javascript
var cancelTimeoutId = null;
```

- [ ] **Step 2: Add the cancelMigration() function**

Add after the `newMigration()` function (after line 354):

```javascript
function cancelMigration() {
  showView('mp-cancelling');
  slicc.stopCone();
  setTimeout(function() {
    slicc.lick({
      action: 'cancel-migration',
      data: {
        instruction: 'List all scoops with list_scoops. '
          + 'For each non-cone scoop, call drop_scoop to remove it. '
          + 'Then send confirmation: '
          + 'sprinkle send migrate-page \'{"phase":"cancelled"}\''
      }
    });
  }, 500);
  cancelTimeoutId = setTimeout(function() {
    cancelTimeoutId = null;
    resetAfterCancel();
  }, 10000);
}
```

- [ ] **Step 3: Add the resetAfterCancel() function**

Add directly after `cancelMigration()`:

```javascript
function resetAfterCancel() {
  if (cancelTimeoutId) {
    clearTimeout(cancelTimeoutId);
    cancelTimeoutId = null;
  }
  currentPreviewUrl = null;
  slicc.setState(null);
  slicc.readFile('/workspace/skills/migrate-page/migrate-config.json')
    .then(function(raw) {
      var config;
      try { config = JSON.parse(raw); } catch (e) { return; }
      config.currentMigration = null;
      return slicc.writeFile(
        '/workspace/skills/migrate-page/migrate-config.json',
        JSON.stringify(config, null, 2)
      );
    })
    .catch(function() {});
  showView('mp-ready');
  loadConfig();
}
```

- [ ] **Step 4: Handle phase "cancelled" in handleUpdate()**

In the `handleUpdate()` function (line 356), add a branch for the `cancelled` phase. Insert after the `data.phase === 'error'` block (after line 372):

```javascript
  if (data.phase === 'cancelled') {
    resetAfterCancel();
    return;
  }
```

- [ ] **Step 5: Commit**

```bash
git add migration/migrate-page/migrate-page.shtml
git commit -m "feat(sprinkle): implement cancel migration with two-phase stop"
```

---

### Task 4: Manual verification

- [ ] **Step 1: Review the complete file**

Read `migration/migrate-page/migrate-page.shtml` end-to-end and verify:

1. The `showView()` views array includes all 5 views: `mp-ready`, `mp-migrating`, `mp-done`, `mp-error`, `mp-cancelling`
2. The `mp-cancelling` HTML is between `mp-done` and `mp-error`
3. The cancel button `onclick` calls `cancelMigration()`
4. `handleUpdate` handles `phase: "cancelled"` before falling through to the existing phase logic
5. `resetAfterCancel` clears the timeout, state, and preview URL
6. No `var` declarations shadow existing ones
7. CSS spinner animation and styles are present

- [ ] **Step 2: Check state transitions are complete**

Trace each path:

- **Happy cancel:** Cancel click → mp-cancelling → stopCone → 500ms → cleanup lick → cone sends `{"phase":"cancelled"}` → `handleUpdate` → `resetAfterCancel` → mp-ready
- **Timeout cancel:** Cancel click → mp-cancelling → stopCone → 500ms → cleanup lick → (no response) → 10s timeout → `resetAfterCancel` → mp-ready
- **Normal completion unaffected:** phase updates still flow through `handleUpdate` to `updatePhases`, `markAllDone`, `showView('mp-done')`

- [ ] **Step 3: Commit (if any fixes needed)**

```bash
git add migration/migrate-page/migrate-page.shtml
git commit -m "fix(sprinkle): address review findings in cancel implementation"
```
