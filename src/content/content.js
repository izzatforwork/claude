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

  const captureBtn = createCaptureButton({ onCapture: handleCapture });
  const controlBar = createControlBar({
    onContinue: async () => {
      const res = await sendToBackground({ type: MSG.NEW_PART });
      if (res?.ok) {
        currentPart = res.part;
        render();
      }
    },
    onExport: async () => {
      await sendToBackground({ type: MSG.STOP_SESSION });
      captureBtn.destroy();
      controlBar.destroy();
    },
  });

  function render(warning) {
    controlBar.updateState({ partTitle: currentPart?.title ?? '', stepCount, warning });
  }
  render();
}
