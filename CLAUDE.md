# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Screen Snippet Recorder** is a Manifest V3 Chrome extension that records click-through workflows and exports them as step-by-step `.docx` documents. Users manually trigger captures via a floating "Capture" button on each step, resulting in a screenshot; the full sequence exports to Word with editable captions and part/section titles. Multi-part sessions are supported (e.g., "Part 1: Login", "Part 2: Dashboard") without stopping the recording.

## Architecture

### Three-Process Model (MV3)
- **Background Service Worker** (`src/background/background.js`): Lifecycle manager. Receives messages from popup and content script, maintains session state in `chrome.storage.local`, triggers screenshot captures, manages status badges.
- **Content Script** (`src/content/content.js`): Injected into the active tab (and re-injected automatically as the user switches tabs/navigates, see "Tab-following" below). Hosts a floating "Capture" button (manual, user-triggered — no automatic click detection) and a floating control bar (Continue to Part N / Export).
- **Popup/UI** (`src/popup/`): React component. Shows "Start Recording" button, displays session state, provides navigation to export tab.
- **Export Page** (`src/export/export.js`): Dedicated tab (not popup — popups close on blur). Reads session from storage, builds `.docx` via the `docx` npm package.

### Shared Modules
- **constants.js**: Message types (`MSG`), session statuses (`STATUS`), storage keys, image compression settings, circle styling constants.
- **messaging.js**: Promise wrappers around `chrome.runtime.sendMessage()` and `chrome.tabs.sendMessage()`. Declarative message router for background handlers.
- **storage.js**: Promise wrappers around `chrome.storage.local`. Defines the storage shape once; used by both background writes and export reads.

### Key Design Decisions

**Manual Capture (Pivot from Original Design)**
- Originally scoped as auto-click-detection with automatic screenshot on every click. **Actual implementation**: a floating "Capture" button that users click to manually capture each step. This was a mid-project pivot to simplify the UX and avoid accidental captures.
- No highlight circle is drawn at the click point (original brief included this; removed along with auto-detection).
- No Pause/Resume feature (nothing to pause when capture is manual).

**Tab-Following via `host_permissions` (Pivot from Original Permissions Model)**
- Originally scoped with `activeTab` permissions only (narrowest scope). **Actual implementation**: uses `host_permissions: ["<all_urls>"]` so recording can follow the user across tabs and across full cross-site navigations without restarting.
- `background.js` listens for `chrome.tabs.onActivated` and `chrome.tabs.onUpdated` (status `complete`) and automatically re-injects `content.js` into whichever tab is currently active (as long as the session is `ACTIVE`). No user gesture required.
- Chrome-internal pages (`chrome://`, Web Store, etc.) can never be scripted regardless of permissions — recording keeps running underneath, but the toolbar badge shows "blocked" (grey `–`) until the user switches to a scriptable page.
- **Recovery from stuck states**: If injection fails outright when starting a recording (e.g. the user's active tab was a `chrome://` page), the popup rolls the session back via `CANCEL_SESSION` instead of leaving a session marked active with no reachable UI. The popup's "active" view also always shows a "Cancel Recording" button so the user can self-recover without touching DevTools if the floating button ever fails to appear.
- **No caption editing in-extension**: Captions are placeholders in the `.docx` file — users edit them directly in Word after export, not in the extension.
- **Storage quota strategy**: Deliberately staying under 5 MB (no `unlimitedStorage` permission) for security. Accepted practical ceiling of ~20–60 steps per session depending on screenshot compression. Warn users at 80% quota.
- **Single export tab**: Export opens a *dedicated tab*, not a popup, because popups close on blur and would lose the download.

## Build & Development

### Common Commands
```bash
npm run build    # One-time full build into dist/
npm run watch    # Watch mode: rebuild JS bundles on source change
```

**Important**: `npm run watch` *does not* copy static files (`manifest.json`, `popup.html`, `export.html`). After editing those, run `npm run build` once to refresh them in `dist/`.

### Loading Into Chrome
1. Navigate to `chrome://extensions`.
2. Enable "Developer mode" (top right).
3. Click "Load unpacked" and select the `dist/` folder.
4. Open any real webpage (not `chrome://` pages), click the extension icon, then "Start Recording".

## Session Lifecycle

1. **START_SESSION**: Popup sends to background (after checking the active tab isn't a restricted `chrome://`-style page). Background clears old session, creates new `meta` (with `status: ACTIVE`), creates `Part 1`, clears any existing badge. Popup injects `content.js` into the current tab immediately; if that injection throws, popup calls `CANCEL_SESSION` to roll back rather than leaving a stuck `ACTIVE` session.
2. **Manual capture**: User clicks the floating "Capture" button. Content script sends `CAPTURE_STEP` (no coordinates — the click-highlight circle was removed along with automatic click detection). Background captures visible tab via `OffscreenCanvas`, resizes/compresses to JPEG, stores in `chrome.storage.local`.
3. **NEW_PART**: User clicks "Continue to Part N" in the control bar. Background creates new part entry, updates `currentPartId` in meta. All subsequent captures go into the new part.
4. **Tab switch / navigation mid-recording**: Because the extension holds `<all_urls>` host permissions, `background.js` listens for `chrome.tabs.onActivated` and `chrome.tabs.onUpdated` (status `complete`) and automatically re-injects `content.js` into whichever tab is active, no user gesture required. Session `status` stays `ACTIVE` throughout — there's no interrupted/resume state. If the active tab is a page that can't be scripted (`chrome://`, Web Store, etc.), the toolbar badge shows a grey "blocked" indicator until the user switches to a normal page; recording itself keeps running underneath.
5. **STOP_SESSION**: User clicks "Export" in the control bar (or "Reopen Export Tab" in the popup). Background sets `status: STOPPED`, opens the export tab (reusing and reloading an existing one if it's still open).
6. **Export**: Export tab reads all `meta`, `parts`, and `steps` from storage, builds `.docx` via the `docx` package. After download, background clears the session.
7. **CANCEL_SESSION**: Available any time a session is active (or stuck) via the popup's "Cancel Recording" / "Reset" button — wipes the session and badge so the user is never stuck with no way back to a clean state.

## Storage Shape

All data lives in `chrome.storage.local`:
- `sop_session_meta`: Session metadata (status, currentPartId, trackedTabId, etc.).
- `sop_session_parts`: Array of part objects `{ id, order, title }`.
- `sop_session_step_index`: Array of `{ id, partId, order, clickX, clickY }` (order of capture, not keyed).
- `sop_step_${stepId}`: Individual step with `{ id, imageDataUrl, width, height }` (JPEG data URI).

See `src/shared/storage.js` for the definitive API.

## Image Capture & Compositing

- **captureAndComposite** (`src/background/capture.js`): Calls `chrome.tabs.captureVisibleTab()` (lossless PNG), uses `OffscreenCanvas` to draw a red circle at the click point, accounts for `devicePixelRatio`, resizes to `MAX_LONG_EDGE` (1600 px), compresses to JPEG at `JPEG_QUALITY` (0.7).
- Circle styling: `CIRCLE_RADIUS_CSS` (18 px) + `CIRCLE_LINE_WIDTH_CSS` (4 px) + `CIRCLE_HALO_EXTRA_CSS` (3 px), scaled by `devicePixelRatio`.

## .docx Export

- **docxBuilder** (`src/export/docxBuilder.js`): Constructs a Word document with one `Section` per part. Each section contains a table or structured content with screenshots and editable caption placeholders.
- Uses the `docx` npm package (v9.x).

## Content Script & Overlay

- **overlay.js** / **overlay.css**: Floating UI with "Capture" button (manual screenshot trigger) and "Continue to Part N" / "Export" controls. Injected into the page when a recording session is active. Re-injected automatically whenever the user switches tabs or navigates (via background service worker's tab-following logic).

## Testing & Verification

**Critical Constraint**: Chrome extensions cannot be executed or tested directly by Claude Code in this environment. All verification requires manually loading the extension unpacked in a real browser. Code review and static analysis can catch some issues, but integration bugs (tab-following, overlay injection, storage persistence, export workflow) only surface during manual testing.

When fixing issues:
- Distinguish between "verified by execution" (user tested in browser) and "verified by code review" (traced the logic path). Don't blur the two.
- Pair code fixes with immediate workarounds the user can try, rather than only handing over the fix and waiting for testing feedback.
- Expect that some bugs may only show up during user testing despite confident code analysis.

## Debugging Tips

- **Check session state**: Open DevTools on the extension (right-click icon → "Inspect popup"), then `chrome.storage.local.getItem('sop_session_meta')`.
- **Message tracing**: Add `console.log` in messaging.js handlers or use `chrome.runtime.onMessage.addListener` in DevTools to trace message flow.
- **Storage quota**: Call `chrome.storage.local.getBytesInUse(null)` in DevTools to see current usage.
- **Tab-following edge case**: Simulate by starting a recording, then switching to a different tab or navigating to a different site. The floating Capture button should reappear automatically without clicking the toolbar icon. On a `chrome://` tab, the badge should show the grey "blocked" indicator instead.
- **Recovery flow**: Intentionally start a recording on a `chrome://` page to verify the popup shows "Cancel Recording" button and gracefully rolls back. The session should be clearable without manual storage deletion.

## Bug Fixes (2026-07-23 session)

Three bugs reported from manual testing; fixed with the following root causes/changes:

- **Overlay stuck after redirect (HIGH)**: `background.js`'s `chrome.tabs.onUpdated` listener only
  re-injected the content script when `changeInfo.status === 'complete'`. Per Chrome's `tabs.onUpdated`
  behavior, redirects and same-document/History-API navigations can fire with only `changeInfo.url` set
  and no `status` field, which the old check silently ignored — leaving the tab with a dead overlay until
  the user manually switched tabs. Now reacts to either signal. **Root cause identified by static code
  tracing, not confirmed by execution** (this project cannot run in a real browser from Claude Code) —
  verify by starting a recording, navigating a tab through a URL that redirects (HTTP redirect or
  `window.location.href` reassignment), and confirming the floating Capture button reappears.
- **Overlay persists in other tabs after export (LOW)**: `sendToTab()` in `messaging.js` existed but was
  never called anywhere in the codebase — background never told other tabs a session had ended.
  `background.js` now tracks injected tab IDs and broadcasts a `SESSION_ENDED` message on
  `STOP_SESSION`/`CANCEL_SESSION`; `content.js` now listens for it and tears down its overlay.
- **No way to cancel mid-recording**: The popup's `Cancel Recording` button already existed, but the
  floating in-page control bar (the primary UI while recording) only had Continue/Export. Added a Cancel
  button to `overlay.js`'s control bar, wired to `CANCEL_SESSION` with a confirm prompt.

## Constraints & Limitations

- **MV3 only**: No `eval()`, no background page (service worker with limited lifetime).
- **`host_permissions: ["<all_urls>"]`**: Broadly scoped permissions (not `activeTab`-only) needed to support tab-following. This is a deliberate trade-off — re-evaluate if tightening is needed (e.g., optional permissions) before a public listing on the Web Store.
- **No downloads permission**: Export must open a new tab with a download link (handled by the `docx` npm package).
- **~20–60 steps per session**: Storage quota limit (5 MB, no `unlimitedStorage` permission by design). Exceeding it would require IndexedDB; not included to keep scope tight.
- **No in-extension caption editing**: Part titles can be customized on the export screen; captions are Word placeholders, edited directly in the downloaded `.docx`.
- **Chrome-internal pages not scriptable**: Recording can continue running on `chrome://` pages, but the UI (floating overlay) cannot be injected. Badge shows "blocked" state; recording resumes normally when user switches back to a normal page.
