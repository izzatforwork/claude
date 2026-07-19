import { Packer } from 'docx';
import * as storage from '../shared/storage.js';
import { buildDocx } from './docxBuilder.js';

const summaryEl = document.getElementById('summary');
const downloadBtn = document.getElementById('download-btn');
const errorEl = document.getElementById('error');

init();

async function init() {
  try {
    const meta = await storage.getMeta();
    const parts = (await storage.getParts()).sort((a, b) => a.order - b.order);
    const steps = await storage.getAllSteps();

    if (!meta || parts.length === 0) {
      summaryEl.textContent = 'No recorded session found. It may have already been exported.';
      return;
    }

    const stepsByPart = new Map(parts.map((part) => [part.id, []]));
    for (const step of steps) {
      const list = stepsByPart.get(step.partId);
      if (list) list.push(step);
    }
    for (const list of stepsByPart.values()) list.sort((a, b) => a.order - b.order);

    summaryEl.textContent = `${parts.length} part(s), ${steps.length} step(s) ready to export.`;
    downloadBtn.disabled = false;

    downloadBtn.addEventListener('click', () => handleDownload(parts, stepsByPart));
  } catch (err) {
    errorEl.textContent = `Failed to load session: ${err.message}`;
  }
}

async function handleDownload(parts, stepsByPart) {
  downloadBtn.disabled = true;
  downloadBtn.textContent = 'Building document…';
  errorEl.textContent = '';
  try {
    const doc = await buildDocx({ parts, stepsByPart });
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);

    // A real click on a blob: anchor needs no "downloads" permission and, since
    // it's a genuine user gesture (this handler runs from the button's click),
    // avoids Chrome's multi-download throttling that auto-triggered downloads hit.
    const a = document.createElement('a');
    a.href = url;
    a.download = `SOP - ${new Date().toISOString().slice(0, 10)}.docx`;
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
