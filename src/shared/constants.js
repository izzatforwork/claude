// Message types exchanged between popup / content script / background.
export const MSG = {
  START_SESSION: 'START_SESSION',
  GET_STATE: 'GET_STATE',
  CAPTURE_STEP: 'CAPTURE_STEP',
  NEW_PART: 'NEW_PART',
  STOP_SESSION: 'STOP_SESSION',
  CANCEL_SESSION: 'CANCEL_SESSION',
  SESSION_ENDED: 'SESSION_ENDED', // background -> content: tear down the overlay (export or cancel happened, possibly from another tab)
};

// Session lifecycle statuses, tracked in the background service worker.
export const STATUS = {
  ACTIVE: 'active', // recording follows whichever tab is active; background auto re-injects
  STOPPED: 'stopped', // stopped, export tab opened, awaiting download+cleanup
};

// Image compression: capture is lossless PNG, single JPEG encode happens after
// compositing the highlight circle, so quality/resizing only cost one lossy pass.
export const MAX_LONG_EDGE = 1600;
export const JPEG_QUALITY = 0.7;

// chrome.storage.local's documented quota without the (excluded) unlimitedStorage
// permission. Used only to decide when to warn the user, not enforced by Chrome via this constant.
export const STORAGE_QUOTA_BYTES = 5242880;
export const STORAGE_WARN_RATIO = 0.8;

// Storage key helpers - kept centralized so background and export read/write identically.
export const KEY_META = 'sop_session_meta';
export const KEY_PARTS = 'sop_session_parts';
export const KEY_STEP_INDEX = 'sop_session_step_index';
export const stepKey = (stepId) => `sop_step_${stepId}`;
