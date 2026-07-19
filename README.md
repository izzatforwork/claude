# SOP Screen Snippet Recorder

Chrome extension (Manifest V3): record a click-through workflow and export it as a
step-by-step SOP `.docx` document. Every click during a recording session becomes a
screenshot with a red circle at the click point; the session can be split into
multiple titled "parts" without stopping; everything exports into one Word document.

## Setup

```
npm install
npm run build
```

This produces `dist/`. To iterate: `npm run watch` (rebuilds the JS bundles on
change; re-run `npm run build` if you edit `manifest.json`, `popup.html`, or
`export.html`, since the watcher only copies those once at startup).

## Load into Chrome

1. Go to `chrome://extensions`.
2. Enable "Developer mode" (top right).
3. Click "Load unpacked" and select the `dist/` folder.
4. Open a real webpage (not a `chrome://` page), click the extension icon, then
   "Start Recording".

## How it works

- **Recording controls** live in a floating overlay injected onto the page (Pause/
  Resume, Continue to Part 2, Stop) rather than the popup, since MV3 popups close
  on blur.
- **Screenshots + highlight**: the background service worker calls
  `chrome.tabs.captureVisibleTab()`, then draws the red circle via `OffscreenCanvas`
  (devicePixelRatio-corrected), resizes, and compresses to JPEG.
- **Storage**: `chrome.storage.local`, one key per step, cleared after a
  successful export. Practical ceiling is roughly 20-60 steps per session
  depending on screenshot content (by design - see `NEW_PROJECT.md`).
- **Page navigation mid-recording**: `activeTab` is revoked the instant the tab
  navigates to a new page, which drops the injected overlay. The toolbar icon's
  badge turns into a "click to resume" indicator; clicking it re-injects and
  reattaches to the same session without losing captured steps.
- **Export**: opens a dedicated `export.html` tab (not the popup) that reads the
  session from storage and builds the `.docx` via the `docx` package on a real
  button click.

See `NEW_PROJECT.md` for the full brief and the plan file for the detailed
architecture rationale.
