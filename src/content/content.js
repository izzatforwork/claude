import { MSG } from '../shared/constants.js';
import { sendToBackground } from '../shared/messaging.js';
import { createOverlay } from './overlay.js';

// Guards against double-injection: chrome.scripting.executeScript re-runs this
// whole file in the same isolated-world JS context if called twice on a page
// that hasn't navigated (e.g. an accidental repeat resume). Globals set by the
// first run persist for the second, so this flag is enough to no-op the retry.
if (!window.__sopRecorderInjected) {
  window.__sopRecorderInjected = true;
  init();
}

async function init() {
  const state = await sendToBackground({ type: MSG.GET_STATE });
  if (!state?.meta || state.meta.status !== 'active') return; // nothing to record on this page

  let isPaused = false;
  let stepCount = state.stepCount;
  let currentPart =
    state.parts.find((part) => part.id === state.meta.currentPartId) ?? state.parts[state.parts.length - 1];

  const overlay = createOverlay({
    onPauseToggle: () => {
      isPaused = !isPaused;
      render();
    },
    onContinue: async () => {
      const res = await sendToBackground({ type: MSG.NEW_PART });
      if (res?.ok) {
        currentPart = res.part;
        render();
      }
    },
    onStop: async () => {
      document.removeEventListener('click', handleClick, true);
      await sendToBackground({ type: MSG.STOP_SESSION });
      overlay.destroy();
    },
  });

  function render(warning) {
    overlay.updateState({ partTitle: currentPart?.title ?? '', stepCount, isPaused, warning });
  }
  render();

  async function handleClick(e) {
    if (isPaused) return;
    if (e.button !== 0) return; // primary/left click only (native `click` already excludes right/middle)
    if (overlay.root.contains(e.target)) return; // exclude clicks on our own overlay (shadow-including contains)

    const cssX = e.clientX;
    const cssY = e.clientY;
    const dpr = window.devicePixelRatio || 1;
    const response = await sendToBackground({ type: MSG.CAPTURE_STEP, cssX, cssY, dpr });
    if (response?.ok) {
      stepCount = response.stepCount;
      render(response.storageWarning);
    }
  }

  document.addEventListener('click', handleClick, true);
}
