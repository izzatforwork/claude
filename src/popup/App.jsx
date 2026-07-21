import { useEffect, useState } from 'react';
import { MSG, STATUS } from '../shared/constants.js';
import { sendToBackground } from '../shared/messaging.js';

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function injectContentScript(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
}

export default function App() {
  const [view, setView] = useState('loading'); // loading | start | active | resuming | stopped | error
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      const state = await sendToBackground({ type: MSG.GET_STATE });
      const status = state?.meta?.status;
      if (status === STATUS.ACTIVE) {
        setView('active');
      } else if (status === STATUS.INTERRUPTED) {
        setView('resuming');
        await resume();
      } else if (status === STATUS.STOPPED) {
        setView('stopped');
      } else {
        setView('start');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function resume() {
    try {
      const tab = await getActiveTab();
      if (!tab?.id) throw new Error('No active tab found');
      // Order matters: regrant/reattach the session in the background BEFORE
      // injecting, so content.js's initial GET_STATE already sees status 'active'.
      await sendToBackground({ type: MSG.RESUME_SESSION, tabId: tab.id, windowId: tab.windowId });
      await injectContentScript(tab.id);
      window.close();
    } catch (err) {
      setError(String(err?.message ?? err));
      setView('error');
    }
  }

  async function start() {
    try {
      const tab = await getActiveTab();
      if (!tab?.id) throw new Error('No active tab found');
      await sendToBackground({ type: MSG.START_SESSION, tabId: tab.id, windowId: tab.windowId });
      await injectContentScript(tab.id);
      window.close();
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
        <p>Recording in progress. Use the floating bar on the page to Pause, Continue to a new part, or Stop.</p>
      )}
      {view === 'resuming' && <p>Resuming recording on this page…</p>}
      {view === 'stopped' && (
        <>
          <p>Recording stopped.</p>
          <button onClick={reopenExport} style={buttonStyle}>
            Reopen Export Tab
          </button>
        </>
      )}
      {view === 'error' && <p style={{ color: '#dc2626' }}>Error: {error}</p>}
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
