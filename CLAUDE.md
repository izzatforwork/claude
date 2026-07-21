# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**SOP Screen Snippet Recorder** is a Manifest V3 Chrome extension that records click-through workflows and exports them as step-by-step SOP `.docx` documents. Users click through a process, every click captures a screenshot with a red highlight at the click point, and the full sequence exports to Word with editable captions and part/section titles.

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
- **Manual capture, no click detection**: There is no automatic click listener. A floating "Capture" button is the only trigger for `CAPTURE_STEP`; this removed the earlier Pause/Resume feature entirely (nothing to pause when nothing fires automatically).
- **Tab-following via `host_permissions`**: The extension requests `<all_urls>` host permissions (not just `activeTab`) specifically so recording can follow the user across tabs and across full cross-site navigations without a fresh toolbar click each time. `background.js` listens for `chrome.tabs.onActivated` and `chrome.tabs.onUpdated` (status `complete`) and re-injects `content.js` into whatever tab is currently active, as long as the session is `ACTIVE`. Chrome-internal pages (`chrome://`, the Web Store, etc.) can never be scripted regardless of permissions — recording keeps running, but the toolbar badge shows a "blocked" state (grey `–`) until the user switches to a normal page.
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

- **overlay.js** / **overlay.css**: Floating UI with Pause/Resume, Continue to Part 2, and Stop buttons. Injected into the page when recording is active. Survives `pause` (local gate; no message sent), but must be re-injected after navigation.

## Debugging Tips

- **Check session state**: Open DevTools on the extension (right-click icon → "Inspect popup"), then `chrome.storage.local.getItem('sop_session_meta')`.
- **Message tracing**: Add `console.log` in messaging.js handlers or use `chrome.runtime.onMessage.addListener` in DevTools to trace message flow.
- **Storage quota**: Call `chrome.storage.local.getBytesInUse(null)` in DevTools to see current usage.
- **Tab-following edge case**: Simulate by starting a recording, then switching to a different tab or navigating to a different site. The floating Capture button should reappear automatically without clicking the toolbar icon. On a `chrome://` tab, the badge should show the grey "blocked" indicator instead.

## Constraints & Limitations

- **MV3 only**: No `eval()`, no background page (service worker with limited lifetime). Uses `host_permissions: ["<all_urls>"]` (not just `activeTab`) so recording can follow the user across tabs/sites — a deliberate trade-off of broader permission scope for that UX; re-evaluate if this needs tightening (e.g. optional permissions) before a public listing.
- **No downloads permission**: Export must open a new tab with a download link (handled by the `docx` package).
- **~20–60 steps per session**: Storage quota limit (5 MB). Exceeding it would require IndexedDB, which wasn't chosen to keep scope tight.
- **No in-extension caption editing**: Captions are Word placeholders; users edit after export.
