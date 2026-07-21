import { Packer } from 'docx';
import * as storage from '../shared/storage.js';
import { buildDocx } from './docxBuilder.js';

const screenTitles = document.getElementById('screen-titles');
const screenDownload = document.getElementById('screen-download');
const titlesForm = document.getElementById('titles-form');
const continueBtn = document.getElementById('continue-btn');
const summaryEl = document.getElementById('summary');
const downloadBtn = document.getElementById('download-btn');
const errorEl = document.getElementById('error');

let meta, parts, steps, stepsByPart;

init();

async function init() {
  try {
    meta = await storage.getMeta();
    parts = (await storage.getParts()).sort((a, b) => a.order - b.order);
    steps = await storage.getAllSteps();

    if (!meta || parts.length === 0) {
      screenTitles.classList.remove('active');
      summaryEl.textContent = 'No recorded session found. It may have already been exported.';
      screenDownload.classList.add('active');
      return;
    }

    const stepsByPartTemp = new Map(parts.map((part) => [part.id, []]));
    for (const step of steps) {
      const list = stepsByPartTemp.get(step.partId);
      if (list) list.push(step);
    }
    for (const list of stepsByPartTemp.values()) list.sort((a, b) => a.order - b.order);
    stepsByPart = stepsByPartTemp;

    // Show Screen 1: Title input fields
    renderTitleInputs();
    continueBtn.addEventListener('click', handleContinue);
  } catch (err) {
    errorEl.textContent = `Failed to load session: ${err.message}`;
    screenTitles.classList.remove('active');
    screenDownload.classList.add('active');
  }
}

function renderTitleInputs() {
  titlesForm.innerHTML = '';
  for (const part of parts) {
    const div = document.createElement('div');
    div.className = 'part-title-input';
    const label = document.createElement('label');
    label.textContent = `Part ${part.order + 1} Title`;
    const input = document.createElement('input');
    input.type = 'text';
    input.id = `part-title-${part.id}`;
    input.value = part.title;
    div.appendChild(label);
    div.appendChild(input);
    titlesForm.appendChild(div);
  }
}

async function handleContinue() {
  // Collect custom titles from inputs
  const customParts = parts.map((part) => {
    const input = document.getElementById(`part-title-${part.id}`);
    return {
      ...part,
      title: input.value.trim() || part.title, // Use input value or fall back to default
    };
  });

  // Switch to Screen 2
  screenTitles.classList.remove('active');
  screenDownload.classList.add('active');

  summaryEl.textContent = `${customParts.length} part(s), ${steps.length} step(s) ready to export.`;
  downloadBtn.disabled = false;
  downloadBtn.addEventListener('click', () => handleDownload(customParts, stepsByPart));
}

async function handleDownload(customParts, stepsByPart) {
  downloadBtn.disabled = true;
  downloadBtn.textContent = 'Building document…';
  errorEl.textContent = '';
  try {
    const doc = await buildDocx({ parts: customParts, stepsByPart });
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);

    // A real click on a blob: anchor needs no "downloads" permission and, since
    // it's a genuine user gesture (this handler runs from the button's click),
    // avoids Chrome's multi-download throttling that auto-triggered downloads hit.
    const a = document.createElement('a');
    a.href = url;
    a.download = `Recording - ${new Date().toISOString().slice(0, 10)}.docx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);

    await storage.clearSession();
    downloadBtn.textContent = 'Downloaded';
    summaryEl.textContent += ' Session data cleared from storage.';
  } catch (err) {
    errorEl.textContent = `Failed to export: ${err.message}`;
    downloadBtn.disabled = false;
    downloadBtn.textContent = 'Download .docx';
  }
}
