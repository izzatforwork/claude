import { KEY_META, KEY_PARTS, KEY_STEP_INDEX, stepKey, STATUS, STORAGE_QUOTA_BYTES } from './constants.js';

// Thin promise wrappers around chrome.storage.local (kept in one place so the
// storage shape is defined exactly once, shared by background writes and export reads).

export async function getMeta() {
  const { [KEY_META]: meta } = await chrome.storage.local.get(KEY_META);
  return meta ?? null;
}

export async function setMeta(meta) {
  await chrome.storage.local.set({ [KEY_META]: meta });
}

export async function getParts() {
  const { [KEY_PARTS]: parts } = await chrome.storage.local.get(KEY_PARTS);
  return parts ?? [];
}

export async function setParts(parts) {
  await chrome.storage.local.set({ [KEY_PARTS]: parts });
}

export async function getStepIndex() {
  const { [KEY_STEP_INDEX]: index } = await chrome.storage.local.get(KEY_STEP_INDEX);
  return index ?? [];
}

export async function appendStepIndex(entry) {
  const index = await getStepIndex();
  index.push(entry);
  await chrome.storage.local.set({ [KEY_STEP_INDEX]: index });
  return index;
}

export async function getStep(stepId) {
  const key = stepKey(stepId);
  const result = await chrome.storage.local.get(key);
  return result[key] ?? null;
}

export async function setStep(step) {
  await chrome.storage.local.set({ [stepKey(step.id)]: step });
}

export async function getAllSteps() {
  const index = await getStepIndex();
  if (index.length === 0) return [];
  const keys = index.map((entry) => stepKey(entry.id));
  const result = await chrome.storage.local.get(keys);
  // Preserve capture order, not object-key iteration order.
  return index.map((entry) => result[stepKey(entry.id)]).filter(Boolean);
}

// Clears everything the extension wrote for the current session, freeing quota
// for the next recording. Called after a successful export.
export async function clearSession() {
  const index = await getStepIndex();
  const keys = [KEY_META, KEY_PARTS, KEY_STEP_INDEX, ...index.map((entry) => stepKey(entry.id))];
  await chrome.storage.local.remove(keys);
}

export async function getBytesInUseRatio() {
  const bytes = await chrome.storage.local.getBytesInUse(null);
  return bytes / STORAGE_QUOTA_BYTES;
}

export function isSessionLive(meta) {
  return !!meta && (meta.status === STATUS.ACTIVE || meta.status === STATUS.INTERRUPTED);
}
