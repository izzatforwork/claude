export async function setActiveBadge(stepCount) {
  await chrome.action.setBadgeText({ text: String(stepCount) });
  await chrome.action.setBadgeBackgroundColor({ color: '#16a34a' });
  await chrome.action.setTitle({ title: `Recording — ${stepCount} step(s) captured` });
}

export async function setInterruptedBadge() {
  await chrome.action.setBadgeText({ text: '!' });
  await chrome.action.setBadgeBackgroundColor({ color: '#d93025' });
  await chrome.action.setTitle({ title: 'Recording paused by page navigation — click the icon to resume' });
}

export async function clearBadge() {
  await chrome.action.setBadgeText({ text: '' });
  await chrome.action.setTitle({ title: '' });
}
