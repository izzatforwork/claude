import overlayCss from './overlay.css';

// Creates a standalone floating capture button inside a Shadow DOM.
// Returns { root, hide(), show(), destroy() }.
export function createCaptureButton({ onCapture }) {
  const host = document.createElement('div');
  host.id = 'sop-capture-btn-host';
  host.style.cssText = 'all: initial; position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); z-index: 2147483647;';

  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = overlayCss;
  shadow.appendChild(style);

  const button = document.createElement('button');
  button.textContent = 'Capture';
  button.style.cssText = 'padding: 8px 16px; background: #2563eb; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;';
  button.addEventListener('click', onCapture);
  shadow.appendChild(button);

  document.documentElement.appendChild(host);

  function hide() {
    host.style.display = 'none';
  }

  function show() {
    host.style.display = '';
  }

  function destroy() {
    host.remove();
  }

  return { root: host, hide, show, destroy };
}

// Creates a floating control bar (Continue to Part 2 + Export buttons) inside a Shadow DOM.
// Returns { root, updateState(), hide(), show(), destroy() }.
export function createControlBar({ onContinue, onExport }) {
  const host = document.createElement('div');
  host.id = 'sop-control-bar-host';
  host.style.cssText = 'all: initial; position: fixed; bottom: 16px; right: 16px; z-index: 2147483647;';

  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = overlayCss;
  shadow.appendChild(style);

  const bar = document.createElement('div');
  bar.className = 'sop-bar';
  bar.innerHTML = `
    <span class="sop-status" data-role="status"></span>
    <span class="sop-warning" data-role="warning" hidden>Storage almost full</span>
    <button data-role="continue" type="button"></button>
    <button data-role="export" type="button" class="sop-stop">Export</button>
  `;
  shadow.appendChild(bar);

  const statusEl = bar.querySelector('[data-role="status"]');
  const warningEl = bar.querySelector('[data-role="warning"]');
  const continueBtn = bar.querySelector('[data-role="continue"]');
  const exportBtn = bar.querySelector('[data-role="export"]');

  continueBtn.addEventListener('click', onContinue);
  exportBtn.addEventListener('click', onExport);

  document.documentElement.appendChild(host);

  function updateState({ partTitle, stepCount, warning, nextPartNumber }) {
    statusEl.textContent = `● Recording — ${partTitle} — ${stepCount} step(s)`;
    warningEl.hidden = !warning;
    continueBtn.textContent = `Continue to Part ${nextPartNumber}`;
  }

  function hide() {
    host.style.display = 'none';
  }

  function show() {
    host.style.display = '';
  }

  function destroy() {
    host.remove();
  }

  return { root: host, updateState, hide, show, destroy };
}
