import { MSG, STATUS, STORAGE_WARN_RATIO, DEFAULT_STEP_CAPTION } from '../shared/constants.js';
import { registerMessageRouter, sendToTab } from '../shared/messaging.js';
import * as storage from '../shared/storage.js';
import { captureAndComposite } from './capture.js';
import { setActiveBadge, setBlockedBadge, clearBadge } from './badge.js';

let exportTabId = null; // Track the ID of the currently-open export tab

// Every tab we know has (or very recently had) the overlay injected, so that
// when a session ends we can tell every one of them to tear the overlay down
// (otherwise only the tab that clicked Export/Cancel gets cleaned up, and any
// other tab open during the recording keeps showing a stale floating button).
const injectedTabIds = new Set();

async function notifyAllInjectedTabsSessionEnded() {
  const tabIds = [...injectedTabIds];
  injectedTabIds.clear();
  await Promise.all(tabIds.map((tabId) => sendToTab(tabId, { type: MSG.SESSION_ENDED })));
}

registerMessageRouter({
  [MSG.START_SESSION]: handleStartSession,
  [MSG.GET_STATE]: handleGetState,
  [MSG.CAPTURE_STEP]: handleCaptureStep,
  [MSG.NEW_PART]: handleNewPart,
  [MSG.STOP_SESSION]: handleStopSession,
  [MSG.CANCEL_SESSION]: handleCancelSession,
});

async function handleStartSession({ tabId }) {
  await storage.clearSession(); // wipe any leftover from a previous unexported session
  const partId = crypto.randomUUID();
  const now = Date.now();
  await storage.setParts([{ id: partId, order: 0, title: 'Part 1' }]);
  await storage.setMeta({
    id: crypto.randomUUID(),
    status: STATUS.ACTIVE,
    currentPartId: partId,
    lastActiveTabId: tabId,
    createdAt: now,
    updatedAt: now,
  });
  await clearBadge();
  injectedTabIds.add(tabId); // popup injects into this tab right after START_SESSION resolves
  return { ok: true };
}

async function handleCancelSession() {
  await storage.clearSession();
  await clearBadge();
  await notifyAllInjectedTabsSessionEnded();
  return { ok: true };
}

async function handleGetState() {
  const meta = await storage.getMeta();
  const parts = await storage.getParts();
  const stepIndex = await storage.getStepIndex();
  return { meta, parts, stepCount: stepIndex.length };
}

async function handleCaptureStep(message, sender) {
  const meta = await storage.getMeta();
  if (!meta || meta.status !== STATUS.ACTIVE) return { ignored: true };

  const windowId = sender.tab?.windowId;
  const { imageDataUrl, width, height } = await captureAndComposite(windowId);

  const stepIndex = await storage.getStepIndex();
  const order = stepIndex.filter((entry) => entry.partId === meta.currentPartId).length + 1;
  const step = {
    id: crypto.randomUUID(),
    partId: meta.currentPartId,
    order,
    imageDataUrl,
    width,
    height,
    caption: DEFAULT_STEP_CAPTION,
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
  await notifyAllInjectedTabsSessionEnded();

  const exportUrl = chrome.runtime.getURL(`export.html?session=${meta.id}`);

  // Check if export tab still exists; reuse if so, otherwise create new one
  if (exportTabId) {
    try {
      await chrome.tabs.get(exportTabId);
      // Tab exists: reload it with the current session's URL so a tab left over
      // from a completed export doesn't keep showing stale "Downloaded" state.
      await chrome.tabs.update(exportTabId, { active: true, url: exportUrl });
      return { ok: true };
    } catch (err) {
      // Tab doesn't exist, clear ID and create new one
      exportTabId = null;
    }
  }

  // Create new export tab
  const newTab = await chrome.tabs.create({ url: exportUrl });
  exportTabId = newTab.id;
  return { ok: true };
}

// --- Tab-following: with host_permissions on <all_urls>, recording is no
// longer scoped to one "tracked" tab. Whenever the active tab changes, or the
// active tab finishes loading a new page (including a full cross-site
// navigation, not just SPA routing), we re-inject the content script so the
// floating button follows the user around the browser without needing a
// fresh click on the toolbar icon. Chrome-internal pages (chrome://, the Web
// Store, etc.) can never be scripted — recording keeps running, we just show
// a "blocked" badge until the user switches to a normal page. ---

const RESTRICTED_URL_RE = /^(chrome|chrome-extension|edge|about|devtools|view-source):/i;

function isInjectableUrl(url) {
  if (!url) return false;
  if (RESTRICTED_URL_RE.test(url)) return false;
  if (url.startsWith('https://chrome.google.com/webstore')) return false;
  if (url.startsWith('https://microsoftedge.microsoft.com/addons')) return false;
  return true;
}

async function maybeInject(tabId) {
  const meta = await storage.getMeta();
  if (!meta || meta.status !== STATUS.ACTIVE) return;

  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    return; // tab no longer exists
  }
  if (!tab.active) return;

  if (!isInjectableUrl(tab.url)) {
    await setBlockedBadge();
    return;
  }

  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  } catch {
    return; // page not scriptable for some other reason (e.g. still loading); leave badge as-is
  }

  injectedTabIds.add(tabId);
  meta.lastActiveTabId = tabId;
  meta.updatedAt = Date.now();
  await storage.setMeta(meta);
  const stepIndex = await storage.getStepIndex();
  await setActiveBadge(stepIndex.length);
}

chrome.tabs.onActivated.addListener(({ tabId }) => maybeInject(tabId));

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Full navigations report status 'complete'. Redirects and same-document
  // (History API) navigations often only report a `url` change with no status
  // field at all - the old check (status-only) silently ignored those, which
  // left the overlay dead after a redirect until the user manually switched
  // tabs. React to either signal.
  if (changeInfo.status !== 'complete' && !changeInfo.url) return;
  if (!tab.active) return;
  maybeInject(tabId);
});

// Detect when export tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === exportTabId) {
    exportTabId = null;
  }
  injectedTabIds.delete(tabId);
});
