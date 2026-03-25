# Sprinkle UI Uplift Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the migrate-page sprinkle with S2 icons, accessibility, semantic error treatment, transitions, and code cleanup.

**Architecture:** Single-file rewrite of `migration/migrate-page/migrate-page.shtml`. The file has three sections — HTML structure, `<style>` block (new), `<script>` block — each modified in order. All code is provided in the spec; no design decisions needed during implementation.

**Tech Stack:** Plain HTML, CSS, vanilla JS. S2 SVG icon paths from `@react-spectrum/s2@1.2.0`. Slicc sprinkle platform classes.

**Spec:** `docs/specs/2026-03-25-sprinkle-ui-uplift-design.md`

---

### Task 1: Rewrite HTML Structure

**Files:**
- Modify: `migration/migrate-page/migrate-page.shtml:1-70`

Rewrite all four view divs in the HTML section. Reference the spec for exact markup.

- [ ] **Step 1: Rewrite `#mp-ready` view**

Add `class="mp-view"` to the view div. Add `mp-view-heading` class and `tabindex="-1"` to the heading. Remove the inline `style="font-size: 18px;"` from the heading. Remove the `<div class="sprinkle-divider">` between kv-list and body text. Remove `style="margin-bottom: 12px;"` from the body div (spacing handled by CSS in Task 2). Add `#mp-config-hint` div after the btn-group:

```html
<div class="sprinkle-detail" id="mp-config-hint" style="display:none; margin-top: 8px;">
  Configure a target repository to get started.
</div>
```

- [ ] **Step 2: Rewrite `#mp-migrating` view**

Add `class="mp-view"` to the view div. Add `mp-view-heading` class and `tabindex="-1"` to the heading. Remove inline `style="font-size: 18px;"` from the heading. Remove the `<div class="sprinkle-divider" style="margin: 8px 0;">`.

On `#mp-phases`: add `aria-live="polite"` and `aria-relevant="text"`. Remove inline `style="gap: 10px;"` (handled by CSS in Task 2).

On each phase row: remove all inline `style` attributes (`gap`, `justify-content`, `flex`, `font-size`, `width`, `text-align`). Replace the `<span class="mp-icon" style="...">` with `<span class="mp-icon mp-icon--pending">`. Remove inline `style="flex:1;"` from `.sprinkle-body` spans.

On `#mp-progress`: add ARIA attributes:

```html
<div class="sprinkle-progress-bar" id="mp-progress"
     role="progressbar"
     aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"
     aria-label="Migration progress"
     style="--progress: 0%; margin-top: 12px;"></div>
```

Add progress label after the progress bar:

```html
<div class="sprinkle-detail" id="mp-progress-label"
     style="text-align: center; margin-top: 6px;"></div>
```

- [ ] **Step 3: Rewrite `#mp-done` view**

Replace the entire `#mp-done` div with spec Section 7 HTML. Key changes: add `class="mp-view"`, inline CheckmarkCircle SVG in heading, `mp-view-heading` + `tabindex="-1"`, optional blocks row (hidden by default), remove divider, use `<div style="height: 16px;">` spacer.

```html
<div id="mp-done" class="mp-view" style="display:none;">
  <div class="sprinkle-heading mp-view-heading" tabindex="-1">
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="currentColor" role="img" aria-label="Complete" style="vertical-align: middle; margin-right: 6px; color: #079355;"><path d="M10 18.75c-4.825 0-8.75-3.925-8.75-8.75S5.175 1.25 10 1.25s8.75 3.925 8.75 8.75-3.925 8.75-8.75 8.75m0-16c-3.998 0-7.25 3.252-7.25 7.25s3.252 7.25 7.25 7.25 7.25-3.252 7.25-7.25S13.998 2.75 10 2.75"/><path d="M9.223 13.5c-.212 0-.415-.09-.558-.248l-2.51-2.792c-.278-.309-.253-.782.055-1.06s.781-.252 1.06.056l1.893 2.107 3.487-4.756c.244-.334.711-.41 1.048-.161.334.244.406.713.161 1.047l-4.032 5.5c-.133.183-.342.295-.567.306z"/></svg>
    Migration Complete
  </div>
  <dl class="sprinkle-kv-list">
    <dt>Source</dt>
    <dd id="mp-done-url"></dd>
    <dt id="mp-done-blocks-label" style="display:none;">Blocks</dt>
    <dd id="mp-done-blocks" style="display:none;"></dd>
  </dl>
  <div style="height: 16px;"></div>
  <div class="sprinkle-btn-group">
    <button class="sprinkle-btn sprinkle-btn--primary" onclick="previewResult()">Preview</button>
    <button class="sprinkle-btn sprinkle-btn--secondary" onclick="newMigration()">New Migration</button>
  </div>
</div>
```

- [ ] **Step 4: Rewrite `#mp-error` view**

Replace the entire `#mp-error` div with spec Section 3 HTML. Key changes: add `class="mp-view"` and `role="alert"`, inline CloseCircle SVG in heading, `mp-view-heading` + `tabindex="-1"`, replace `sprinkle-card` with `mp-error-card`.

```html
<div id="mp-error" class="mp-view" style="display:none;" role="alert">
  <div class="sprinkle-heading mp-view-heading" tabindex="-1">
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="currentColor" role="img" aria-label="Failed" style="vertical-align: middle; margin-right: 6px; color: #d73220;"><path d="m11.06 10 2.22-2.22c.293-.293.293-.767 0-1.06s-.767-.293-1.06 0L10 8.94 7.78 6.72c-.293-.293-.767-.293-1.06 0s-.293.767 0 1.06L8.94 10l-2.22 2.22c-.293.293-.293.767 0 1.06.146.147.338.22.53.22s.384-.073.53-.22L10 11.06l2.22 2.22c.146.147.338.22.53.22s.384-.073.53-.22c.293-.293.293-.767 0-1.06z"/><path d="M10 18.75c-4.825 0-8.75-3.925-8.75-8.75S5.175 1.25 10 1.25s8.75 3.925 8.75 8.75-3.925 8.75-8.75 8.75m0-16c-3.998 0-7.25 3.252-7.25 7.25s3.252 7.25 7.25 7.25 7.25-3.252 7.25-7.25S13.998 2.75 10 2.75"/></svg>
    Migration Failed
  </div>
  <div class="mp-error-card">
    <div class="sprinkle-body" id="mp-error-msg"></div>
  </div>
  <div class="sprinkle-btn-group">
    <button class="sprinkle-btn sprinkle-btn--primary" onclick="newMigration()">Try Again</button>
  </div>
</div>
```

- [ ] **Step 5: Commit HTML changes**

```bash
git add migration/migrate-page/migrate-page.shtml
git commit -m "feat(sprinkle): rewrite HTML with S2 icons, ARIA, semantic error

- Add mp-view class and fade transition hooks to all views
- Replace unicode icons with inline S2 SVG icons in done/error headings
- Add ARIA progressbar, live region, focus management attributes
- Replace sprinkle-card with mp-error-card + role=alert
- Add progress label, config hint, optional block count row
- Remove dividers and inline font-size overrides"
```

---

### Task 2: Add Style Block

**Files:**
- Modify: `migration/migrate-page/migrate-page.shtml` (insert `<style>` between closing `</div>` and `<script>`)

- [ ] **Step 1: Insert the complete style block**

Between the closing `</div>` of the root sprinkle container and the `<script>` tag, insert:

```css
<style>
.mp-view {
  opacity: 0;
  transition: opacity 150ms ease-in;
}
.mp-view.mp-visible {
  opacity: 1;
}

.mp-icon {
  display: inline-flex;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
}
.mp-icon--pending { color: #dadada; }
.mp-icon--active { color: #4b75ff; }
.mp-icon--done { color: #079355; }
.mp-icon--error { color: #d73220; }

@keyframes mp-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
.mp-icon--active svg {
  animation: mp-pulse 1.5s ease-in-out infinite;
}

.mp-error-card {
  margin: 8px 0;
  padding: 10px 12px;
  border-left: 3px solid #d73220;
  border-radius: 4px;
  background: #ffebe8;
}

#mp-phases .sprinkle-row {
  gap: 8px;
  justify-content: flex-start;
}
#mp-phases .sprinkle-body { flex: 1; }

#mp-ready .sprinkle-kv-list,
#mp-done .sprinkle-kv-list { margin-top: 12px; }

#mp-ready .sprinkle-body { margin-bottom: 16px; }

#mp-ready .sprinkle-btn-group,
#mp-done .sprinkle-btn-group,
#mp-error .sprinkle-btn-group { margin-top: 16px; }
</style>
```

- [ ] **Step 2: Commit CSS changes**

```bash
git add migration/migrate-page/migrate-page.shtml
git commit -m "feat(sprinkle): add style block with S2 tokens and transitions

- View fade transitions (150ms ease-in)
- S2 semantic icon colors (pending/active/done/error)
- Pulse animation for active phase indicator
- Error card with red accent border
- Spacing rules replacing dividers"
```

---

### Task 3: Rewrite Script Block

**Files:**
- Modify: `migration/migrate-page/migrate-page.shtml` (replace entire `<script>` block)

- [ ] **Step 1: Write icon constants and phase config**

At the top of the script block:

```js
var PHASES = ['extraction', 'decomposition', 'blocks', 'assembly'];
var PHASE_PROGRESS = { extraction: 25, decomposition: 50, blocks: 75, assembly: 90 };
var currentPreviewUrl = null;

var ICON_PENDING = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="currentColor" role="img" aria-label="Pending"><path d="M10 18.75c-4.825 0-8.75-3.925-8.75-8.75S5.175 1.25 10 1.25s8.75 3.925 8.75 8.75-3.925 8.75-8.75 8.75m0-16c-3.998 0-7.25 3.252-7.25 7.25s3.252 7.25 7.25 7.25 7.25-3.252 7.25-7.25S13.998 2.75 10 2.75"/></svg>';
var ICON_ACTIVE = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="currentColor" role="img" aria-label="In progress"><circle cx="10" cy="10" r="5"/></svg>';
var ICON_DONE = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="currentColor" role="img" aria-label="Complete"><path d="M10 18.75c-4.825 0-8.75-3.925-8.75-8.75S5.175 1.25 10 1.25s8.75 3.925 8.75 8.75-3.925 8.75-8.75 8.75m0-16c-3.998 0-7.25 3.252-7.25 7.25s3.252 7.25 7.25 7.25 7.25-3.252 7.25-7.25S13.998 2.75 10 2.75"/><path d="M9.223 13.5c-.212 0-.415-.09-.558-.248l-2.51-2.792c-.278-.309-.253-.782.055-1.06s.781-.252 1.06.056l1.893 2.107 3.487-4.756c.244-.334.711-.41 1.048-.161.334.244.406.713.161 1.047l-4.032 5.5c-.133.183-.342.295-.567.306z"/></svg>';
var ICON_ERROR = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="currentColor" role="img" aria-label="Failed"><path d="m11.06 10 2.22-2.22c.293-.293.293-.767 0-1.06s-.767-.293-1.06 0L10 8.94 7.78 6.72c-.293-.293-.767-.293-1.06 0s-.293.767 0 1.06L8.94 10l-2.22 2.22c-.293.293-.293.767 0 1.06.146.147.338.22.53.22s.384-.073.53-.22L10 11.06l2.22 2.22c.146.147.338.22.53.22s.384-.073.53-.22c.293-.293.293-.767 0-1.06z"/><path d="M10 18.75c-4.825 0-8.75-3.925-8.75-8.75S5.175 1.25 10 1.25s8.75 3.925 8.75 8.75-3.925 8.75-8.75 8.75m0-16c-3.998 0-7.25 3.252-7.25 7.25s3.252 7.25 7.25 7.25 7.25-3.252 7.25-7.25S13.998 2.75 10 2.75"/></svg>';
```

- [ ] **Step 2: Write showView() — canonical implementation from spec Section 4**

```js
function showView(id) {
  var views = ['mp-ready', 'mp-migrating', 'mp-done', 'mp-error'];
  for (var i = 0; i < views.length; i++) {
    var el = document.getElementById(views[i]);
    el.style.display = 'none';
    el.classList.remove('mp-visible');
  }
  var target = document.getElementById(id);
  target.style.display = '';
  requestAnimationFrame(function() {
    target.classList.add('mp-visible');
    var heading = target.querySelector('.mp-view-heading');
    if (heading) heading.focus();
  });
}
```

- [ ] **Step 3: Write updatePhases() — consolidated from spec Section 1**

```js
function updatePhases(activePhase, detail) {
  var activeIdx = PHASES.indexOf(activePhase);
  if (activeIdx === -1) return;

  for (var i = 0; i < PHASES.length; i++) {
    var row = document.querySelector('[data-phase="' + PHASES[i] + '"]');
    if (!row) continue;
    var icon = row.querySelector('.mp-icon');
    var detailEl = row.querySelector('.mp-detail');

    if (i < activeIdx) {
      icon.innerHTML = ICON_DONE;
      icon.className = 'mp-icon mp-icon--done';
      detailEl.textContent = '';
    } else if (i === activeIdx) {
      icon.innerHTML = ICON_ACTIVE;
      icon.className = 'mp-icon mp-icon--active';
      detailEl.textContent = detail || '';
    } else {
      icon.innerHTML = ICON_PENDING;
      icon.className = 'mp-icon mp-icon--pending';
      detailEl.textContent = '';
    }
  }

  var pct = PHASE_PROGRESS[activePhase] || 0;
  var bar = document.getElementById('mp-progress');
  if (bar) {
    bar.style.setProperty('--progress', pct + '%');
    bar.setAttribute('aria-valuenow', pct);
  }

  var label = document.getElementById('mp-progress-label');
  if (label) {
    label.textContent = 'Phase ' + (activeIdx + 1) + ' of 4';
  }
}
```

- [ ] **Step 4: Write markAllDone() — consolidated from spec Section 1**

```js
function markAllDone() {
  for (var i = 0; i < PHASES.length; i++) {
    var row = document.querySelector('[data-phase="' + PHASES[i] + '"]');
    if (!row) continue;
    var icon = row.querySelector('.mp-icon');
    icon.innerHTML = ICON_DONE;
    icon.className = 'mp-icon mp-icon--done';
    row.querySelector('.mp-detail').textContent = '';
  }
  var bar = document.getElementById('mp-progress');
  if (bar) {
    bar.style.setProperty('--progress', '100%');
    bar.setAttribute('aria-valuenow', 100);
  }
  var label = document.getElementById('mp-progress-label');
  if (label) label.textContent = 'Complete';
}
```

- [ ] **Step 5: Write helper functions — populateDone, populateError, populateMigrating**

`populateDone` from spec Section 7, `populateError` and `populateMigrating` from spec Section 9:

```js
function populateDone(data) {
  var doneUrl = document.getElementById('mp-done-url');
  if (doneUrl) doneUrl.textContent = data.url || '';

  var blocksLabel = document.getElementById('mp-done-blocks-label');
  var blocksVal = document.getElementById('mp-done-blocks');
  if (data.blockCount && blocksLabel && blocksVal) {
    blocksLabel.style.display = '';
    blocksVal.style.display = '';
    blocksVal.textContent = data.blockCount + ' blocks migrated';
  } else if (blocksLabel && blocksVal) {
    blocksLabel.style.display = 'none';
    blocksVal.style.display = 'none';
  }
}

function populateError(data) {
  var errMsg = document.getElementById('mp-error-msg');
  if (errMsg) errMsg.textContent = data.message || 'Unknown error';
}

function populateMigrating(data) {
  if (data.url) {
    var srcEl = document.getElementById('mp-source-url');
    if (srcEl) srcEl.textContent = data.url;
  }
}
```

- [ ] **Step 6: Write action functions — startMigration, previewResult, newMigration**

These are largely unchanged from the original, just use the new helpers:

```js
function startMigration() {
  showView('mp-migrating');
  updatePhases('extraction', '');
  slicc.setState({ phase: 'extraction', status: 'running' });
  slicc.lick({ action: 'migrate-page' });
}

function previewResult() {
  if (currentPreviewUrl) {
    slicc.open(currentPreviewUrl);
  }
}

function newMigration() {
  currentPreviewUrl = null;
  slicc.setState(null);
  showView('mp-ready');
  loadConfig();
}
```

- [ ] **Step 7: Write handleUpdate() — refactored from spec Section 9**

```js
function handleUpdate(data) {
  if (!data || !data.phase) return;
  slicc.setState(data);

  if (data.phase === 'done') {
    currentPreviewUrl = data.previewUrl || null;
    populateDone(data);
    markAllDone();
    showView('mp-done');
    return;
  }

  if (data.phase === 'error') {
    populateError(data);
    showView('mp-error');
    return;
  }

  populateMigrating(data);
  showView('mp-migrating');

  if (data.status === 'done') {
    var phaseIdx = PHASES.indexOf(data.phase);
    var nextPhase = phaseIdx < PHASES.length - 1
      ? PHASES[phaseIdx + 1] : data.phase;
    updatePhases(nextPhase, '');
  } else {
    updatePhases(data.phase, data.detail || '');
  }
}
```

- [ ] **Step 8: Write loadConfig(), setConfigState(), restoreState(), init()**

From spec Sections 6 and 9:

```js
function setConfigState(configured) {
  var btn = document.querySelector('#mp-ready .sprinkle-btn--primary');
  var hint = document.getElementById('mp-config-hint');
  var repoEl = document.getElementById('mp-repo');
  if (!configured) {
    if (repoEl) repoEl.textContent = 'Not configured';
    if (btn) btn.disabled = true;
    if (hint) hint.style.display = '';
  } else {
    if (btn) btn.disabled = false;
    if (hint) hint.style.display = 'none';
  }
}

function loadConfig() {
  slicc.readFile('/workspace/skills/migrate-page/migrate-config.json').then(function(raw) {
    var config;
    try { config = JSON.parse(raw); } catch (e) {
      setConfigState(false);
      return;
    }

    var repoEl = document.getElementById('mp-repo');
    if (repoEl) repoEl.textContent = config.repo || 'Not configured';
    setConfigState(!!config.repo);

    if (config.currentMigration && !slicc.getState()) {
      restoreState(config.currentMigration);
    }
  }).catch(function() {
    setConfigState(false);
  });
}

function restoreState(state) {
  slicc.setState(state);
  if (state.phase === 'done') {
    currentPreviewUrl = state.previewUrl || null;
    populateDone(state);
    markAllDone();
    showView('mp-done');
  } else if (state.phase === 'error') {
    populateError(state);
    showView('mp-error');
  } else {
    populateMigrating(state);
    showView('mp-migrating');
    updatePhases(state.phase, state.detail || '');
  }
}

function init() {
  slicc.on('update', handleUpdate);
  var saved = slicc.getState();
  if (saved && saved.phase) {
    restoreState(saved);
  }
  loadConfig();
}

init();
```

- [ ] **Step 9: Commit JS changes**

```bash
git add migration/migrate-page/migrate-page.shtml
git commit -m "feat(sprinkle): rewrite JS with S2 icons, consolidated state, helpers

- S2 SVG icon constants (CheckmarkCircle, CloseCircle, Circle)
- Pulse animation on active phase indicator
- Canonical showView with transitions and focus management
- Consolidated updatePhases with ARIA valuenow + progress label
- Consolidated markAllDone with progress completion
- Shared helpers (populateDone/Error/Migrating)
- Refactored handleUpdate using helpers
- Single init() replacing duplicated state restoration
- loadConfig with setConfigState for disable-when-not-configured"
```

---

### Task 4: Final Review

**Files:**
- Read: `migration/migrate-page/migrate-page.shtml`

- [ ] **Step 1: Read the complete file and verify structure**

Verify the file has this structure:
1. Root `<div>` with `data-sprinkle-title` and `sprinkle-stack`
2. Four view divs, each with `class="mp-view"`, headings with `mp-view-heading tabindex="-1"`
3. No `sprinkle-divider` elements remain
4. No inline `style="font-size: 18px;"` remains
5. All phase rows use `<span class="mp-icon mp-icon--pending">` (no inline style)
6. `#mp-progress` has ARIA attributes
7. `#mp-progress-label` exists after the progress bar
8. `#mp-error` has `role="alert"` and `mp-error-card` class
9. `#mp-done` has inline CheckmarkCircle SVG and optional blocks row
10. `<style>` block exists between `</div>` and `<script>`
11. `<script>` starts with icon constants, ends with `init()`

- [ ] **Step 2: Verify no references to old patterns remain**

```bash
grep -n 'textContent.*\\\\u' migration/migrate-page/migrate-page.shtml
grep -n 'style\.color' migration/migrate-page/migrate-page.shtml
grep -n 'sprinkle-divider' migration/migrate-page/migrate-page.shtml
grep -n 'font-size: 18px' migration/migrate-page/migrate-page.shtml
```

All four commands should return no matches.

- [ ] **Step 3: Squash into a single commit for PR**

```bash
git rebase -i HEAD~3
```

Squash all 3 implementation commits into one:

```
feat(sprinkle): S2 UI uplift for migrate-page

Spectrum 2 audit-driven improvements:
- Replace unicode status icons with real S2 SVGs (CheckmarkCircle,
  CloseCircle, Circle) extracted from @react-spectrum/s2
- Add ARIA progressbar, live region, role=alert, focus management
- Semantic error treatment with red accent border
- View fade transitions (150ms ease-in)
- Progress label showing "Phase N of 4"
- Disable migrate button when repo not configured
- Enriched done view with success icon and optional block count
- Replace dividers with S2 spacing, consolidate inline styles
- Refactor JS: shared helpers, single init(), no duplicated state
```
