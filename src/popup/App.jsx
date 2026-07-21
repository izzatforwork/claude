import { useEffect, useState } from 'react';
import { MSG, STATUS } from '../shared/constants.js';
import { sendToBackground } from '../shared/messaging.js';

const RESTRICTED_URL_RE = /^(chrome|chrome-extension|edge|about|devtools|view-source):/i;

function isRestrictedUrl(url) {
  if (!url) return true;
  if (RESTRICTED_URL_RE.test(url)) return true;
  if (url.startsWith('https://chrome.google.com/webstore')) return true;
  if (url.startsWith('https://microsoftedge.microsoft.com/addons')) return true;
  return false;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function injectContentScript(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
}

export default function App() {
  const [view, setView] = useState('loading'); // loading | start | active | stopped | error
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      const state = await sendToBackground({ type: MSG.GET_STATE });
      const status = state?.meta?.status;
      if (status === STATUS.ACTIVE) {
        setView('active');
        // The background auto re-injects on tab switch/navigation, but not for
        // the tab that's already active when the popup happens to be opened
        // (e.g. right after a browser/service-worker restart) — top up here.
        ensureInjected();
      } else if (status === STATUS.STOPPED) {
        setView('stopped');
      } else {
        setView('start');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function ensureInjected() {
    try {
      const tab = await getActiveTab();
      if (tab?.id && !isRestrictedUrl(tab.url)) {
        await injectContentScript(tab.id);
      }
    } catch {
      // Best-effort only; the badge already reflects blocked/active state.
    }
  }

  async function start() {
    try {
      const tab = await getActiveTab();
      if (!tab?.id) throw new Error('No active tab found');
      if (isRestrictedUrl(tab.url)) {
        throw new Error('Cannot record on this page (Chrome system pages, the Web Store, etc). Open a regular webpage and try again.');
      }
      await sendToBackground({ type: MSG.START_SESSION, tabId: tab.id });
      try {
        await injectContentScript(tab.id);
      } catch (injectErr) {
        // Roll back so we never leave a session marked active with no way to reach it.
        await sendToBackground({ type: MSG.CANCEL_SESSION });
        throw injectErr;
      }
      window.close();
    } catch (err) {
      setError(String(err?.message ?? err));
      setView('error');
    }
  }

  async function cancelRecording() {
    try {
      await sendToBackground({ type: MSG.CANCEL_SESSION });
      setError(null);
      setView('start');
    } catch (err) {
      setError(String(err?.message ?? err));
      setView('error');
    }
  }

  async function reopenExport() {
    try {
      await sendToBackground({ type: MSG.STOP_SESSION });
      window.close();
    } catch (err) {
      setError(String(err?.message ?? err));
      setView('error');
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ fontSize: 15, margin: '0 0 12px' }}>Screen Snippet Recorder</h1>
      {view === 'loading' && <p>Loading…</p>}
      {view === 'start' && (
        <button onClick={start} style={buttonStyle}>
          Start Recording
        </button>
      )}
      {view === 'active' && (
        <>
          <p>
            Recording in progress — it follows you across tabs and pages. Use the floating Capture button on the
            page to capture a step, then use the floating bar to Continue to a new part or Export when done.
          </p>
          <button onClick={cancelRecording} style={secondaryButtonStyle}>
            Cancel Recording
          </button>
        </>
      )}
      {view === 'stopped' && (
        <>
          <p>Recording stopped.</p>
          <button onClick={reopenExport} style={buttonStyle}>
            Reopen Export Tab
          </button>
        </>
      )}
      {view === 'error' && (
        <>
          <p style={{ color: '#dc2626' }}>Error: {error}</p>
          <button onClick={cancelRecording} style={secondaryButtonStyle}>
            Reset
          </button>
        </>
      )}
    </div>
  );
}

const buttonStyle = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 14,
  fontWeight: 600,
  color: '#fff',
  background: '#dc2626',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
};

const secondaryButtonStyle = {
  ...buttonStyle,
  marginTop: 8,
  background: '#64748b',
};
