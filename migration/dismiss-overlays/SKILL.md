---
name: dismiss-overlays
description: Use when a page may have cookie banners, GDPR consent, chat widgets, or other overlays blocking content. Run before extracting DOM or taking full-page screenshots.
allowed-tools: bash
---

# Dismiss Page Overlays

End-to-end overlay detection and dismissal. Visually verifies the page is
clean before returning. Temporary screenshots are deleted — no artifacts
persist.

## When to Use

- Before extracting DOM or visual tree from a page
- Before taking full-page screenshots for downstream use
- When navigating to any new page that may have consent banners

## What Is an Overlay?

Any element sitting ON TOP of the main page content:

- **Full-width bars:** Cookie consent ("Accept All"), GDPR/CCPA notice
- **Centered modals:** Newsletter signup, login dialog, age gate, paywall
- **Corner widgets:** Chat bubbles (Intercom, Zendesk), help buttons

**NOT overlays:** Sticky navigation, inline content, embedded forms.

## Steps

You receive a `{tabId}` for the target page.

### Step 1: Screenshot and Analyze

```bash
playwright-cli screenshot --tab={tabId} --fullPage=true --max-width=1440 --filename=/tmp/_overlay-check.png
```

Read the screenshot. If no overlays are visible, skip to Step 4.

### Step 2: Heuristic Dismissal

Run the `overlay-dismiss.js` script (shipped alongside this skill):

```bash
playwright-cli eval-file --tab={tabId} overlay-dismiss.js
```

The script handles known vendors (see table below) plus generic patterns.
It prefers clicking dismiss/accept buttons over DOM removal — clicking
sets consent cookies that persist across tabs.

### Step 3: Verify (max 2 retries)

Screenshot to check if overlays are gone:

```bash
playwright-cli screenshot --tab={tabId} --fullPage=true --max-width=1440 --filename=/tmp/_overlay-verify.png
```

Read the screenshot. If clean, go to Step 4.

If overlays survive, use the accessibility snapshot to identify them:

```bash
playwright-cli snapshot --tab={tabId}
```

Find the dismiss/accept button and click it:

```bash
playwright-cli eval --tab={tabId} "document.querySelector('SELECTOR').click()"
```

**Always prefer click over DOM removal.** Clicking sets the consent cookie,
which persists across all tabs to the same domain. DOM removal only hides
the element in this tab.

If no clickable button exists, remove the overlay as last resort:

```bash
playwright-cli eval --tab={tabId} "document.querySelectorAll('SELECTOR').forEach(e => e.remove())"
```

Re-screenshot and verify. Max 2 manual retries after the heuristic script.

### Step 4: Cleanup

Delete all temporary screenshots created by this skill:

```bash
rm -f /tmp/_overlay-check.png /tmp/_overlay-verify.png
```

No artifacts from this skill should persist downstream.

## Important Notes

- **Cookies persist across tabs.** Dismissing a banner sets a consent
  cookie for all tabs to the same domain in the browser session.
- **If another skill already dismissed overlays on this page**, the
  consent cookie prevents the banner from reappearing. Only run this
  skill if you see overlays.
- **Best-effort.** If no overlays are found, the skill completes after
  Step 1.

## Supported Vendors (Heuristic Script)

| Vendor | Banner Selector | Dismiss Action |
|--------|----------------|----------------|
| OneTrust | `#onetrust-consent-sdk` | Click `#onetrust-accept-btn-handler` |
| Cookiebot | `#CybotCookiebotDialog` | Click `#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll` |
| CookieConsent | `.cc-window` | Click `.cc-btn.cc-dismiss` |
| Intercom | `#intercom-container` | Click `.intercom-launcher` |
| Zendesk | `#launcher` | Click `[data-testid="launcher"]` |
| Drift | `#drift-widget` | Click `.drift-widget-close-icon` |
| Generic | `[class*="cookie"]`, `[id*="consent"]` | Click `[class*="accept"]`, `[aria-label*="close"]` |
| Fixed overlays | z-index > 100, >20% viewport | Remove from DOM |
