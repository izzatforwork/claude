// Thin wrapper so callers don't deal with chrome.runtime's callback-vs-promise
// inconsistencies directly, and background message handlers stay declarative.

export function sendToBackground(message) {
  return chrome.runtime.sendMessage(message);
}

export function sendToTab(tabId, message) {
  return chrome.tabs.sendMessage(tabId, message).catch(() => {
    // Tab may not have a content script listening (e.g. navigated away, or a
    // chrome:// page) - this is expected during the activeTab-lapse window.
  });
}

// Registers a handler map { [type]: async (payload, sender) => result }.
// Returning a Promise from the listener signals chrome.runtime that a
// response will be sent asynchronously.
export function registerMessageRouter(handlers) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const handler = handlers[message?.type];
    if (!handler) return false;
    Promise.resolve(handler(message, sender))
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ error: String(err?.message ?? err) }));
    return true;
  });
}
