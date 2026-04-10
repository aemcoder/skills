# Cancel Migration Design

Add a cancel button to the migrate-page sprinkle that stops a running
migration and resets the UI so the user can start over.

## Context

The migrate-page sprinkle has four views: ready, migrating, done, error.
Once a migration starts, the only way out is to wait for completion or
failure. If the user wants to abort mid-migration (wrong page, wrong
repo, taking too long), they have no option.

Slicc PR #385 added `slicc.stopCone()` to the sprinkle bridge API. It
kills the cone agent but leaves scoops running. A working prototype in
`stop-test.shtml` demonstrated a two-phase pattern: stopCone followed by
a cleanup lick that spawns a fresh cone to drop orphan scoops.

## Design

### Cancel mechanism: two-phase stop

1. `slicc.stopCone()` — kills the migration cone (fire-and-forget).
2. After 500ms, `slicc.lick({ action: 'cancel-migration', data: { instruction } })`
   spawns a cleanup cone with natural-language instructions to list all
   scoops and drop each non-cone scoop.
3. The cleanup cone confirms completion by sending
   `sprinkle send migrate-page '{"phase":"cancelled"}'`.

### Intermediate "Cancelling" view

A new `mp-cancelling` view prevents the user from restarting while
cleanup is in progress. Flow:

```
mp-migrating → [Cancel click] → mp-cancelling → [confirmation] → mp-ready
```

The cancelling view shows a spinner and "Cancelling..." text. No buttons
are available — the user waits for confirmation or a timeout.

### Timeout fallback

If the cleanup cone does not confirm within 10 seconds, the sprinkle
resets to `mp-ready` anyway. This covers cases where the cleanup cone
fails to start or gets stuck.

### UI reset on confirmation

When `handleUpdate` receives `{"phase":"cancelled"}`:

- Clear slicc state (`slicc.setState(null)`)
- Clear `currentMigration` in migrate-config.json (write null)
- Transition to `mp-ready`

### Cancel button placement

A secondary "Cancel" button appears on the `mp-migrating` view, below
the progress bar. It is always visible during migration — not gated by
phase.

## What does NOT change

- **SKILL.md** — no changes. Cancel logic lives in the sprinkle, which
  is already Slicc-specific. Skills stay platform-agnostic.
- **Disk artifacts** — cancel stops processes only. The cloned repo at
  `/shared/{repo}/`, `.migration/` folder, and partial block output stay
  on disk.
- **Other views** — mp-ready, mp-done, mp-error are unchanged.

## Changes

### migrate-page.shtml

| Change | Detail |
|--------|--------|
| New HTML | `mp-cancelling` view with spinner and status text |
| New HTML | Cancel button on `mp-migrating` view |
| New CSS | Styles for `mp-cancelling` view and cancel button |
| New function | `cancelMigration()` — two-phase stop with 500ms delay |
| Modified function | `handleUpdate()` — handle `phase: "cancelled"` |
| New logic | Timeout fallback (10s) that resets to mp-ready |

### State transitions

```
mp-migrating
  ├─ [phase update] → update phases (existing)
  ├─ [phase: done] → mp-done (existing)
  ├─ [phase: error] → mp-error (existing)
  └─ [Cancel click] → mp-cancelling (NEW)

mp-cancelling
  ├─ [phase: cancelled] → mp-ready (NEW)
  └─ [10s timeout] → mp-ready (NEW, fallback)
```

## Cleanup lick payload

```javascript
slicc.lick({
  action: 'cancel-migration',
  data: {
    instruction: 'List all scoops with list_scoops. '
      + 'For each non-cone scoop, call drop_scoop to remove it. '
      + 'Then send confirmation: '
      + 'sprinkle send migrate-page \'{"phase":"cancelled"}\''
  }
});
```

The instruction is natural language — no SKILL.md formalization. The
cleanup cone interprets and executes it. This keeps the skill decoupled
from Slicc internals.
