# New Project Brief

## Goal
A Chrome extension that captures a screenshot on every click during a recording session,
highlights the click point, and exports the full sequence into a .docx SOP document — so I
can create step-by-step SOP documents just by clicking through a workflow.

## User flow
1. User clicks the extension icon, presses "Start Recording"
2. While recording, every click on the page triggers a screenshot capture with a highlight
   marker at the click point
3. User can Pause/Resume recording via a floating on-page overlay
4. User can trigger "Continue to Part 2" — starts a new titled section within the same
   document, without ending the recording session
5. User presses "Stop" when done
6. Extension exports all captured steps (across all parts/sections) into a single .docx file

## Output / deliverables
A downloadable .docx SOP document with one section per step: annotated screenshot (red
circle highlight at click location) + an editable caption placeholder per step, organized
under part/section title placeholders (all editable directly in Word after export).

## Tech constraints
- Build approach: Claude Code project (real codebase)
- Frontend: React for popup UI (bundled with esbuild); plain JS for content script + background
- Backend: none — fully client-side extension
- Manifest V3, permissions limited to activeTab, scripting, storage, tabs only (no host
  permissions, no unlimitedStorage, no offscreen/downloads permission)
- Screenshot capture: chrome.tabs.captureVisibleTab()
- Highlight marker: red circle via OffscreenCanvas in the background service worker,
  devicePixelRatio-corrected
- Storage: chrome.storage.local, screenshots compressed (JPEG) — accepted practical
  ceiling of ~20-60 steps/session rather than switching to IndexedDB
- Export: docx npm package (dolanmiu), one Section per part/title

## Done criteria
- Can start/pause/stop a recording session
- Each click during recording produces a correctly highlighted, correctly positioned
  screenshot (including on high-DPI screens)
- Can trigger "continue to new part" mid-session with a new title, without losing earlier
  captured steps
- Final export produces a single .docx with all parts/sections in order, correct
  screenshots, editable captions
- Tested via "Load unpacked" on a real webpage (not chrome:// pages)

## Open questions
- None outstanding — resolved via interview (see plan: recording controls live in a
  floating overlay, not the popup; activeTab's navigation-revocation is accepted as-is
  with a resume-on-icon-click flow; no in-extension caption editing, placeholders only;
  chrome.storage.local kept over IndexedDB by explicit choice).
