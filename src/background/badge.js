export async function setActiveBadge(stepCount) {
  await chrome.action.setBadgeText({ text: String(stepCount) });
  await chrome.action.setBadgeBackgroundColor({ color: '#16a34a' });
  await chrome.action.setTitle({ title: `Recording — ${stepCount} step(s) captured` });
}

// Shown while a recording is active but the current tab can't be scripted
// (chrome://, the Web Store, etc.) — recording itself keeps running, the
// floating button just can't appear until the user switches to a normal page.
export async function setBlockedBadge() {
  await chrome.action.setBadgeText({ text: '–' });
  await chrome.action.setBadgeBackgroundColor({ color: '#94a3b8' });
  await chrome.action.setTitle({ title: 'Recording active — switch to a regular webpage to capture here' });
}

export async function clearBadge() {
  await chrome.action.setBadgeText({ text: '' });
  await chrome.action.setTitle({ title: '' });
}
