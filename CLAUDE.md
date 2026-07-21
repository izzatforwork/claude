# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**SOP Screen Snippet Recorder** is a Manifest V3 Chrome extension that records click-through workflows and exports them as step-by-step SOP `.docx` documents. Users click through a process, every click captures a screenshot with a red highlight at the click point, and the full sequence exports to Word with editable captions and part/section titles.

## Architecture

### Three-Process Model (MV3)
- **Background Service Worker** (`src/background/background.js`): Lifecycle manager. Receives messages from popup and content script, maintains session state in `chrome.storage.local`, triggers screenshot captures, manages status badges.
- **Content Script** (`src/content/content.js`): Injected into active tab. Detects clicks, forwards `CAPTURE_STEP` messages to background with click coordinates, hosts floating overlay for pause/resume controls.
- **Popup/UI** (`src/popup/`): React component. Shows "Start Recording" button, displays session state, provides navigation to export tab.
- **Export Page** (`src/export/export.js`): Dedicated tab (not popup — popups close on blur). Reads session from storage, builds `.docx` via the `docx` npm package.

### Shared Modules
- **constants.js**: Message types (`MSG`), session statuses (`STATUS`), storage keys, image compression settings, circle styling constants.
- **messaging.js**: Promise wrappers around `chrome.runtime.sendMessage()` and `chrome.tabs.sendMessage()`. Declarative message router for background handlers.
- **storage.js**: Promise wrappers around `chrome.storage.local`. Defines the storage shape once; used by both background writes and export reads.

### Key Design Decisions
- **Pause/Resume is client-only**: Pause state lives entirely in the content script (not persisted to background), so clicks are gated locally without extra round-trips.
- **Navigation tolerance**: When user navigates mid-recording, `activeTab` permission lapses instantly. The badge turns into a "resume" indicator; clicking the icon re-injects the content script and resumes the session without losing earlier steps.
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

1. **START_SESSION**: Popup sends to background. Background clears old session, creates new `meta` (with `status: ACTIVE`), creates `Part 1`, clears any existing badge.
2. **Click during recording**: Content script detects click, sends `CAPTURE_STEP` with click coordinates (CSS px + `devicePixelRatio`). Background captures visible tab, draws red circle at click point via `OffscreenCanvas`, resizes/compresses to JPEG, stores in `chrome.storage.local`.
3. **NEW_PART**: User clicks "Continue to Part 2" in overlay. Background creates new part entry, updates `currentPartId` in meta. All subsequent clicks go into the new part.
4. **Navigation mid-recording**: Tab navigates, `activeTab` lapses. Content script can no longer send messages; background sets `status: INTERRUPTED` and updates badge to "resume" state.
5. **RESUME_SESSION**: User clicks icon again (on the interrupted tab or another tab). Background injects a fresh content script, updates `status` back to `ACTIVE`.
6. **STOP_SESSION**: User clicks "Stop" in overlay. Background sets `status: STOPPED`, opens the export tab.
7. **Export**: Export tab reads all `meta`, `parts`, and `steps` from storage, builds `.docx` via the `docx` package. After download, background clears the session.

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
- **Navigation edge case**: Simulate by navigating the tab mid-recording. Badge should flip to "resume" state, and clicking the icon should re-inject the overlay.

## Constraints & Limitations

- **MV3 only**: No `eval()`, no background page (service worker with limited lifetime), no host permissions (activeTab only).
- **No downloads permission**: Export must open a new tab with a download link (handled by the `docx` package).
- **~20–60 steps per session**: Storage quota limit (5 MB). Exceeding it would require IndexedDB, which wasn't chosen to keep scope tight.
- **No in-extension caption editing**: Captions are Word placeholders; users edit after export.
