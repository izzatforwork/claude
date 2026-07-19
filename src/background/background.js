import { MSG, STATUS, STORAGE_WARN_RATIO } from '../shared/constants.js';
import { registerMessageRouter } from '../shared/messaging.js';
import * as storage from '../shared/storage.js';
import { captureAndComposite } from './capture.js';
import { setActiveBadge, setInterruptedBadge, clearBadge } from './badge.js';

registerMessageRouter({
  [MSG.START_SESSION]: handleStartSession,
  [MSG.RESUME_SESSION]: handleResumeSession,
  [MSG.GET_STATE]: handleGetState,
  [MSG.CAPTURE_STEP]: handleCaptureStep,
  [MSG.NEW_PART]: handleNewPart,
  [MSG.STOP_SESSION]: handleStopSession,
});

async function handleStartSession({ tabId, windowId }) {
  await storage.clearSession(); // wipe any leftover from a previous unexported session
  const partId = crypto.randomUUID();
  const now = Date.now();
  await storage.setParts([{ id: partId, order: 0, title: 'Part 1' }]);
  await storage.setMeta({
    id: crypto.randomUUID(),
    status: STATUS.ACTIVE,
    currentPartId: partId,
    trackedTabId: tabId,
    trackedWindowId: windowId,
    createdAt: now,
    updatedAt: now,
  });
  await clearBadge();
  return { ok: true };
}

async function handleResumeSession({ tabId, windowId }) {
  const meta = await storage.getMeta();
  if (!meta) return { ok: false, error: 'no-session' };
  meta.status = STATUS.ACTIVE;
  meta.trackedTabId = tabId;
  meta.trackedWindowId = windowId;
  meta.updatedAt = Date.now();
  await storage.setMeta(meta);
  await clearBadge();
  const stepIndex = await storage.getStepIndex();
  const parts = await storage.getParts();
  return { ok: true, meta, parts, stepCount: stepIndex.length };
}

async function handleGetState() {
  const meta = await storage.getMeta();
  const parts = await storage.getParts();
  const stepIndex = await storage.getStepIndex();
  return { meta, parts, stepCount: stepIndex.length };
}

async function handleCaptureStep({ cssX, cssY, dpr }, sender) {
  const meta = await storage.getMeta();
  if (!meta || meta.status !== STATUS.ACTIVE) return { ignored: true };

  const windowId = sender.tab?.windowId;
  const { imageDataUrl, width, height } = await captureAndComposite(windowId, cssX, cssY, dpr);

  const stepIndex = await storage.getStepIndex();
  const order = stepIndex.filter((entry) => entry.partId === meta.currentPartId).length + 1;
  const step = {
    id: crypto.randomUUID(),
    partId: meta.currentPartId,
    order,
    imageDataUrl,
    width,
    height,
    caption: '[Add description]',
    clickCssX: cssX,
    clickCssY: cssY,
    dpr,
    createdAt: Date.now(),
  };
  await storage.setStep(step);
  const newIndex = await storage.appendStepIndex({ id: step.id, partId: step.partId });

  meta.updatedAt = Date.now();
  await storage.setMeta(meta);
  await setActiveBadge(newIndex.length);

  const usageRatio = await storage.getBytesInUseRatio();
  return { ok: true, stepCount: newIndex.length, storageWarning: usageRatio >= STORAGE_WARN_RATIO };
}

async function handleNewPart() {
  const meta = await storage.getMeta();
  if (!meta) return { ok: false, error: 'no-session' };
  const parts = await storage.getParts();
  const order = parts.length;
  const part = { id: crypto.randomUUID(), order, title: `Part ${order + 1}` };
  parts.push(part);
  await storage.setParts(parts);
  meta.currentPartId = part.id;
  meta.updatedAt = Date.now();
  await storage.setMeta(meta);
  return { ok: true, part };
}

async function handleStopSession() {
  const meta = await storage.getMeta();
  if (!meta) return { ok: false, error: 'no-session' };
  meta.status = STATUS.STOPPED;
  meta.updatedAt = Date.now();
  await storage.setMeta(meta);
  await clearBadge();
  await chrome.tabs.create({ url: chrome.runtime.getURL(`export.html?session=${meta.id}`) });
  return { ok: true };
}

// --- activeTab-lapse detection: activeTab is revoked the instant the tracked
// tab navigates to a new page or is closed, taking the injected content
// script/overlay with it. We can't re-inject without a fresh user gesture, so
// we just surface a badge telling the user to click the toolbar icon to resume. ---

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status !== 'loading') return;
  const meta = await storage.getMeta();
  if (!meta || meta.trackedTabId !== tabId || meta.status !== STATUS.ACTIVE) return;
  meta.status = STATUS.INTERRUPTED;
  meta.updatedAt = Date.now();
  await storage.setMeta(meta);
  await setInterruptedBadge();
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const meta = await storage.getMeta();
  if (!meta || meta.trackedTabId !== tabId || meta.status !== STATUS.ACTIVE) return;
  meta.status = STATUS.INTERRUPTED;
  meta.updatedAt = Date.now();
  await storage.setMeta(meta);
  await setInterruptedBadge();
});
