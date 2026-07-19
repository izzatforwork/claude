import overlayCss from './overlay.css';

// Builds the floating recording-control bar inside a Shadow DOM, isolated from
// the host page's CSS. Returns { root, updateState, destroy }.
export function createOverlay({ onPauseToggle, onContinue, onStop }) {
  const host = document.createElement('div');
  host.id = 'sop-recorder-overlay-host';
  // "all: initial" strips any inherited/page CSS from the host element itself;
  // the explicit properties after it in the same rule win the cascade.
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
    <button data-role="pause" type="button">Pause</button>
    <button data-role="continue" type="button">Continue to Part 2</button>
    <button data-role="stop" type="button" class="sop-stop">Stop</button>
  `;
  shadow.appendChild(bar);

  const statusEl = bar.querySelector('[data-role="status"]');
  const warningEl = bar.querySelector('[data-role="warning"]');
  const pauseBtn = bar.querySelector('[data-role="pause"]');
  const continueBtn = bar.querySelector('[data-role="continue"]');
  const stopBtn = bar.querySelector('[data-role="stop"]');

  pauseBtn.addEventListener('click', onPauseToggle);
  continueBtn.addEventListener('click', onContinue);
  stopBtn.addEventListener('click', onStop);

  document.documentElement.appendChild(host);

  function updateState({ partTitle, stepCount, isPaused, warning }) {
    statusEl.textContent = isPaused
      ? `⏸ Paused — ${partTitle} — ${stepCount} step(s)`
      : `● Recording — ${partTitle} — ${stepCount} step(s)`;
    pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
    warningEl.hidden = !warning;
  }

  function destroy() {
    host.remove();
  }

  return { root: host, updateState, destroy };
}
