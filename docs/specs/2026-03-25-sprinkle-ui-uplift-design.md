# Sprinkle UI Uplift — migrate-page

**Date:** 2026-03-25
**File:** `migration/migrate-page/migrate-page.shtml`
**Scope:** UX uplift — fix audit findings + polish, same architecture

## Context

The migrate-page sprinkle is a Slicc panel (.shtml) that drives page
migration. A Spectrum 2 audit found 5 critical issues and 8 warnings.
This spec addresses all of them in a single pass.

The sprinkle uses platform-provided `sprinkle-*` CSS classes. We cannot
use React Spectrum components — this is plain HTML + inline JS. Custom
styles go in a `<style>` block placed between the closing `</div>` of
the root container and the `<script>` tag.

## 1. Status Icons — Real S2 SVGs

**Problem:** Unicode characters (checkmark, filled circle, empty circle)
render inconsistently and are inaccessible.

**Solution:** Extract SVG path data from `@react-spectrum/s2@1.2.0`
icon modules (`icons/*.mjs`) and inline as raw `<svg>` elements. No
runtime dependency — just the path geometry.

### Icons used

| State | S2 Icon | Visual | Color (S2 alias) | Hex |
|-------|---------|--------|-------------------|-----|
| Pending | `Circle` | Outline ring | gray-300 | #dadada |
| Active | n/a | Solid filled circle | informative | #4b75ff |
| Done | `CheckmarkCircle` | Checkmark inside circle | positive | #079355 |
| Error | `CloseCircle` | X inside circle | negative | #d73220 |

### SVG constants

Each icon is 20x20 viewBox, uses `fill="currentColor"`, colored via
parent CSS `color` property. Stored as JS string constants in the
`<script>` block.

**ICON_PENDING** — S2 `Circle` icon (outline ring):

```js
var ICON_PENDING = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="currentColor" role="img" aria-label="Pending"><path d="M10 18.75c-4.825 0-8.75-3.925-8.75-8.75S5.175 1.25 10 1.25s8.75 3.925 8.75 8.75-3.925 8.75-8.75 8.75m0-16c-3.998 0-7.25 3.252-7.25 7.25s3.252 7.25 7.25 7.25 7.25-3.252 7.25-7.25S13.998 2.75 10 2.75"/></svg>';
```

**ICON_ACTIVE** — Simple filled circle (not an S2 icon; a status
indicator to visually distinguish from the outline pending state):

```js
var ICON_ACTIVE = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="currentColor" role="img" aria-label="In progress"><circle cx="10" cy="10" r="5"/></svg>';
```

**ICON_DONE** — S2 `CheckmarkCircle` icon (two paths: ring + checkmark):

```js
var ICON_DONE = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="currentColor" role="img" aria-label="Complete"><path d="M10 18.75c-4.825 0-8.75-3.925-8.75-8.75S5.175 1.25 10 1.25s8.75 3.925 8.75 8.75-3.925 8.75-8.75 8.75m0-16c-3.998 0-7.25 3.252-7.25 7.25s3.252 7.25 7.25 7.25 7.25-3.252 7.25-7.25S13.998 2.75 10 2.75"/><path d="M9.223 13.5c-.212 0-.415-.09-.558-.248l-2.51-2.792c-.278-.309-.253-.782.055-1.06s.781-.252 1.06.056l1.893 2.107 3.487-4.756c.244-.334.711-.41 1.048-.161.334.244.406.713.161 1.047l-4.032 5.5c-.133.183-.342.295-.567.306z"/></svg>';
```

**ICON_ERROR** — S2 `CloseCircle` icon (two paths: ring + X):

```js
var ICON_ERROR = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="currentColor" role="img" aria-label="Failed"><path d="m11.06 10 2.22-2.22c.293-.293.293-.767 0-1.06s-.767-.293-1.06 0L10 8.94 7.78 6.72c-.293-.293-.767-.293-1.06 0s-.293.767 0 1.06L8.94 10l-2.22 2.22c-.293.293-.293.767 0 1.06.146.147.338.22.53.22s.384-.073.53-.22L10 11.06l2.22 2.22c.146.147.338.22.53.22s.384-.073.53-.22c.293-.293.293-.767 0-1.06z"/><path d="M10 18.75c-4.825 0-8.75-3.925-8.75-8.75S5.175 1.25 10 1.25s8.75 3.925 8.75 8.75-3.925 8.75-8.75 8.75m0-16c-3.998 0-7.25 3.252-7.25 7.25s3.252 7.25 7.25 7.25 7.25-3.252 7.25-7.25S13.998 2.75 10 2.75"/></svg>';
```

### Active state animation

The active icon gets a CSS `pulse` animation:

```css
@keyframes mp-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
.mp-icon--active svg { animation: mp-pulse 1.5s ease-in-out infinite; }
```

### Consolidated updatePhases()

This is the complete function body combining icon updates (Section 1),
`aria-valuenow` (Section 2), and progress label (Section 5):

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

### Consolidated markAllDone()

Sets all icons to done, progress to 100%, and label to "Complete":

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

## 2. Accessibility

### Progress bar

Add ARIA attributes to `#mp-progress`:

```html
<div class="sprinkle-progress-bar" id="mp-progress"
     role="progressbar"
     aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"
     aria-label="Migration progress"
     style="--progress: 0%;">
</div>
```

JS updates `aria-valuenow` alongside `--progress` in `updatePhases()`:

```js
bar.style.setProperty('--progress', pct + '%');
bar.setAttribute('aria-valuenow', pct);
```

### Phase list live region

Add `aria-live="polite"` to `#mp-phases`:

```html
<div class="sprinkle-stack" id="mp-phases"
     aria-live="polite" aria-relevant="text">
```

### Error announcement

Add `role="alert"` to `#mp-error` (shown in Section 3 HTML).

### Focus management

All four view headings get `class="sprinkle-heading mp-view-heading"`
and `tabindex="-1"`. Focus management is handled in the canonical
`showView()` defined in Section 4 (not duplicated here).

## 3. Semantic Error Treatment

Replace the plain card with an error-styled block:

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

CSS for the error card (light theme only — dark theme depends on
platform sprinkle-* theming and is out of scope):

```css
.mp-error-card {
  margin: 8px 0;
  padding: 10px 12px;
  border-left: 3px solid #d73220;
  border-radius: 4px;
  background: #ffebe8; /* S2 Palette/red/200 — light theme only */
}
```

Both the error and done heading icons are inline SVGs in the HTML
(truly static — no JS insertion needed).

## 4. View Transitions (Canonical showView)

This is the single canonical implementation of `showView()`. It
combines view toggling, fade transitions, and focus management.

CSS:

```css
.mp-view {
  opacity: 0;
  transition: opacity 150ms ease-in;
}
.mp-view.mp-visible {
  opacity: 1;
}
```

All four view divs (`#mp-ready`, `#mp-migrating`, `#mp-done`,
`#mp-error`) get `class="mp-view"` added to their class list.

JS:

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

## 5. Progress Label

Add a detail span below the progress bar:

```html
<div class="sprinkle-progress-bar" id="mp-progress" ...></div>
<div class="sprinkle-detail" id="mp-progress-label"
     style="text-align: center; margin-top: 6px;"></div>
```

Updated inside `updatePhases()`:

```js
var label = document.getElementById('mp-progress-label');
if (label) {
  var phaseIdx = PHASES.indexOf(activePhase);
  label.textContent = 'Phase ' + (phaseIdx + 1) + ' of 4';
}
```

When a phase completes and we advance to the next one (the
`data.status === 'done'` branch), the label shows the next phase's
number. On full completion: `"Complete"`. On error: cleared.

## 6. Disable Button When Not Configured

In `loadConfig()`, when repo is missing or "Not configured":

```js
var btn = document.querySelector('#mp-ready .sprinkle-btn--primary');
if (btn) btn.disabled = true;

var hint = document.getElementById('mp-config-hint');
if (hint) hint.style.display = '';
```

When config loads successfully, re-enable the button and hide the hint:

```js
if (btn) btn.disabled = false;
if (hint) hint.style.display = 'none';
```

HTML addition in `#mp-ready` after the btn-group:

```html
<div class="sprinkle-detail" id="mp-config-hint" style="display:none; margin-top: 8px;">
  Configure a target repository to get started.
</div>
```

## 7. Enriched Done View

Add a success icon and optional block count. The success icon uses
the standard 20x20 size (same `.mp-icon` class, no special sizing).

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

Block count is populated inside `populateDone()` when
`data.blockCount` is present. This field is optional — the SKILL.md
protocol does not currently send `blockCount` in the done payload, so
the sprinkle gracefully hides the row when absent. If the skill adds
`blockCount` to `sprinkle send` data in the future, it appears
automatically.

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
```

## 8. Typography and Spacing Cleanup

### Style block placement

The `<style>` block goes between the closing `</div>` of the root
sprinkle container and the `<script>` tag:

```html
</div><!-- end root sprinkle-stack -->

<style>
  /* all custom styles here */
</style>

<script>
  /* all JS here */
</script>
```

### Remove inline font-size overrides

Delete `style="font-size: 18px;"` from all four headings. The
`sprinkle-heading` class handles heading size.

### Replace dividers with spacing

Remove all `<div class="sprinkle-divider">` instances. Replace with
margin-based spacing:

```css
#mp-ready .sprinkle-kv-list,
#mp-done .sprinkle-kv-list { margin-top: 12px; }

#mp-ready .sprinkle-body { margin-bottom: 16px; }

#mp-ready .sprinkle-btn-group,
#mp-done .sprinkle-btn-group,
#mp-error .sprinkle-btn-group { margin-top: 16px; }
```

S2 uses spacing as the primary grouping mechanism. Dividers are
reserved for longform content.

### Consolidate inline styles

Move repeated inline styles into the `<style>` block:

```css
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

#mp-phases .sprinkle-row {
  gap: 8px;
  justify-content: flex-start;
}

#mp-phases .sprinkle-body { flex: 1; }
```

This replaces the per-element inline styles on phase rows and icon
spans. The icon containers grow from 18px to 20px (matching the S2
20x20 icon canvas) — a 2px change that improves alignment with S2
but has minimal visual impact.

## 9. Consolidate State Restoration

Remove the duplicated inline state restoration block (lines 229-251
of the current file). Replace with a single `init()` function.

### Helper functions

Extract repeated DOM-update logic into helpers shared by both
`restoreState()` and `handleUpdate()`:

```js
function populateDone(data) {
  // See Section 7 for full implementation
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

### init() and restoreState()

```js
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

### Updated handleUpdate()

Refactored to use the same helpers:

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

### loadConfig() state override

`loadConfig()` still reads the config file for the repo name display
and button enable/disable (always runs), but only calls
`restoreState()` from `currentMigration` if there is no state already
restored from `slicc.getState()`:

```js
function loadConfig() {
  slicc.readFile('/workspace/skills/migrate-page/migrate-config.json').then(function(raw) {
    var config;
    try { config = JSON.parse(raw); } catch (e) {
      setConfigState(false);
      return;
    }

    // Repo name display — always runs regardless of migration state
    var repoEl = document.getElementById('mp-repo');
    if (repoEl) repoEl.textContent = config.repo || 'Not configured';
    setConfigState(!!config.repo);

    // Only restore migration state from config if slicc has no state
    if (config.currentMigration && !slicc.getState()) {
      restoreState(config.currentMigration);
    }
  }).catch(function() {
    setConfigState(false);
  });
}

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
```

## Summary of Changes

| # | Change | Category | Lines affected |
|---|--------|----------|---------------|
| 1 | S2 SVG icons from @react-spectrum/s2 | Icons / A11y | HTML icons, JS updatePhases + markAllDone |
| 2 | ARIA progressbar, live region, focus mgmt | Accessibility | HTML attrs, JS showView |
| 3 | Error card with accent border + icon | Design | #mp-error HTML + CSS |
| 4 | View fade transitions (canonical showView) | Interaction | CSS + JS showView |
| 5 | Progress label "Phase N of 4" | UX | New HTML element + JS |
| 6 | Disable button when not configured | UX | JS loadConfig + HTML hint |
| 7 | Enriched done view with icon + optional stats | Design | #mp-done HTML + JS |
| 8 | Remove dividers, consolidate styles, style block | S2 compliance | HTML + new style block |
| 9 | Single init(), shared helpers, updated handleUpdate | Code quality | JS refactor |

## Out of Scope

- React Spectrum runtime — plain HTML only
- Full app-frame structure — this is a panel widget
- Dark theme support — depends on platform sprinkle-* class theming
- Animated progress bar transitions — depends on platform CSS
- Adding `blockCount` to SKILL.md protocol — sprinkle handles it
  gracefully when absent; protocol change is a separate concern
