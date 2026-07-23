# Master Prompt — Screen Snippet Recorder

> Rebuild guide synthesized at project closure (2026-07-22). Reflects what actually got
> built and why, not just the original brief — several parts of the design pivoted
> during the build. Use this if rebuilding from scratch or briefing a similar project.

## What this is

A Manifest V3 Chrome extension that records a click-through workflow as a sequence of
manually-captured screenshots and exports them as a step-by-step `.docx` document. Not
an auto-click-recorder — capture is a deliberate user action per step.

## Build order that actually worked

1. **Scaffold first**: popup (React, esbuild-bundled), content script (plain JS),
   background service worker (plain JS), shared `constants.js`/`messaging.js`/
   `storage.js` modules defining the message protocol and storage shape once, used by
   both background and export code. Get `npm run build` producing a loadable `dist/`
   before adding features.
2. **CLAUDE.md early**: write the architecture/build-commands doc once the shape is
   stable, so future sessions (and future you) aren't reverse-engineering the message
   flow from source.
3. **Core recording loop**: manual "Capture" floating button → `CAPTURE_STEP` message →
   background captures the visible tab via `chrome.tabs.captureVisibleTab`, resizes/
   compresses to JPEG via `OffscreenCanvas`, stores in `chrome.storage.local`. Multi-part
   sessions via a "Continue to Part N" control that creates a new part and re-tags the
   current-part pointer in session meta.
4. **Export flow**: dedicated tab (not a popup — popups close on blur and would drop
   the download), two screens — edit part titles, then build+download the `.docx` via
   the `docx` npm package, one `Section` per part.
5. **Permission model pivot**: started on `activeTab`-only permissions (narrowest
   scope), which meant recording was pinned to the single tab active when "Start
   Recording" was clicked, and any navigation/tab-switch killed the content script with
   no way to silently re-inject. This turned out to conflict directly with the actual
   use case (recording workflows that span multiple tabs/sites). Switched to
   `host_permissions: ["<all_urls>"]` plus `chrome.tabs.onActivated` /
   `chrome.tabs.onUpdated` listeners in the background that auto re-inject the content
   script into whichever tab is currently active. **If rebuilding: default to the
   tab-following model from the start** unless there's a specific reason to keep
   recording single-tab-scoped — the activeTab-only version is strictly worse for this
   use case and was a wasted detour.
6. **Recovery path**: any flow that can mark a session "active" in storage must be able
   to fail without leaving that state stuck — e.g. starting a recording on a
   `chrome://` page (unscriptable) used to leave the session flagged active with no
   floating button and no way back except manually clearing storage. Fix: validate
   before mutating state, roll back via an explicit `CANCEL_SESSION` message on
   failure, and always expose a manual "Cancel/Reset" control in the UI regardless of
   root cause.

## What changed from the original brief (and why)

- **No automatic click-detection or red-circle highlight.** The original brief called
  for screenshotting every click automatically with a highlight marker. Built version
  uses a manual "Capture" button instead — deliberate steps only, no highlight
  circle. This was a mid-project pivot (see git history: "Implement Problems 1,2,3").
- **No Pause/Resume.** Removed along with automatic click-capture — nothing to pause
  when nothing fires automatically.
- **"Stop" renamed to "Export"** to match what the button actually does.
- **Permissions: `<all_urls>` host permissions, not `activeTab`-only.** See build-order
  step 5 above — the original tech-constraint of "no host permissions" didn't survive
  contact with the actual desired behavior (recording across tabs/sites).

## Key decisions carried over from standing preferences

- React for the popup UI, plain JS for content/background/export (non-UI parts) —
  validated cleanly, no friction.
- `docx` over PDF for the exported document — validated, correct call for an editable
  SOP-style output.
- `chrome.storage.local` (not IndexedDB) with JPEG compression — accepted ceiling of
  ~20-60 steps/session, never hit in practice.

## Debugging/verification lesson (the main closure finding)

This project type — a Chrome extension — **cannot be executed or tested directly by
Claude Code** in this environment; verification requires manually loading it unpacked
in a real browser. Several bugs across multiple fix rounds were only caught by the
user's manual testing, not by Claude's own review, which extended the timeline and
left fixes looking more "done" than they actually were. If rebuilding this or any
similarly untestable project (browser extension, mobile app, hardware-adjacent):

- Every "fixed" claim should say whether it was verified by execution or only by
  tracing the code — don't blur the two.
- Pair every unverified fix with a workaround the user can act on immediately, instead
  of only handing over the fix and waiting for them to test it.
- This is now a standing "Debugging Protocol" in global CLAUDE.md — it should already
  be in effect for any rebuild, but worth restating here since it's the reason this
  project ran longer than its actual scope warranted.

## Post-launch note (2026-07-23 closure)

Marked "Completed" on 2026-07-22, then reopened after real daily use surfaced 3 more
bugs the original manual test pass and code review hadn't caught:

- **Overlay stuck after a redirect (HIGH)**: `background.js`'s tab-following listener
  only re-injected on `changeInfo.status === 'complete'`, silently ignoring the
  `changeInfo.url`-only events Chrome fires for redirects/History-API navigation. Now
  reacts to either signal. Flagged as unverified-by-execution at the time (this
  environment can't run Chrome) — confirm this actually holds if it recurs.
- **Stale overlay in other tabs after export (LOW)**: `sendToTab()` had been written in
  `messaging.js` but never actually called anywhere. Background now tracks injected
  tab IDs and broadcasts a `SESSION_ENDED` message on stop/cancel so every tab's
  overlay tears down, not just the one that triggered export.
- **No way to cancel mid-recording without reopening the popup**: the popup already had
  a working Cancel button, but the floating in-page control bar — the surface actually
  in view while recording — only had Continue/Export. Added a Cancel button there too.

Also shipped a feature request from real use: an editable **Document Title** field on
the export screen (used for both the `.docx` filename and an in-doc title page), and
removed the literal `[Add description]` placeholder text from exported captions
(left blank instead, so there's still a clean spot to type into in Word).

**Lesson**: for a project type Claude can't execute-test, treat "Completed" as
"code-review complete, pending field use," not a final bug-free state — see the new
closure finding in `POSTMORTEMS.md` and `NEW_PROJECT.md`'s pre-flight checklist. A
follow-up bug round after real usage is normal for this project type, not a sign the
original closure was wrong.
