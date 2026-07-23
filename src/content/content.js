import { MSG } from '../shared/constants.js';
import { sendToBackground } from '../shared/messaging.js';
import { createCaptureButton, createControlBar } from './overlay.js';

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

  let stepCount = state.stepCount;
  let isCapturing = false;
  let partsCount = state.parts.length;
  let currentPart =
    state.parts.find((part) => part.id === state.meta.currentPartId) ?? state.parts[state.parts.length - 1];

  async function handleCapture() {
    if (isCapturing) return; // debounce: ignore rapid clicks
    isCapturing = true;
    try {
      captureBtn.hide();
      controlBar.hide();

      // Flush paint by double requestAnimationFrame
      await new Promise((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(resolve);
        });
      });

      const response = await sendToBackground({ type: MSG.CAPTURE_STEP });
      if (response?.ok) {
        stepCount = response.stepCount;
        render(response.storageWarning);
      }
    } catch (err) {
      console.error('Capture failed:', err);
    } finally {
      captureBtn.show();
      controlBar.show();
      isCapturing = false;
    }
  }

  function teardown() {
    captureBtn.destroy();
    controlBar.destroy();
    // Allow a fresh Start Recording on this same tab (without navigating)
    // to re-run init() instead of being silently skipped by the guard above.
    window.__sopRecorderInjected = false;
  }

  const captureBtn = createCaptureButton({ onCapture: handleCapture });
  const controlBar = createControlBar({
    onContinue: async () => {
      const res = await sendToBackground({ type: MSG.NEW_PART });
      if (res?.ok) {
        currentPart = res.part;
        partsCount += 1;
        render();
      }
    },
    onExport: async () => {
      await sendToBackground({ type: MSG.STOP_SESSION });
      teardown();
    },
    onCancel: async () => {
      if (!window.confirm('Cancel this recording? All captured steps will be discarded.')) return;
      await sendToBackground({ type: MSG.CANCEL_SESSION });
      teardown();
    },
  });

  // Session ended from elsewhere (another tab exported/cancelled it, or the
  // popup's own Cancel Recording button was used) - tear down here too.
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === MSG.SESSION_ENDED) teardown();
  });

  function render(warning) {
    controlBar.updateState({ partTitle: currentPart?.title ?? '', stepCount, warning, nextPartNumber: partsCount + 1 });
  }
  render();
}
