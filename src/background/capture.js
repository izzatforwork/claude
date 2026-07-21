import { MAX_LONG_EDGE, JPEG_QUALITY } from '../shared/constants.js';

// Captures the current visible tab, resizes to max long edge, and compresses to JPEG.
export async function captureAndComposite(windowId) {
  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
  const captureBlob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(captureBlob);

  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);

  const scale = Math.min(1, MAX_LONG_EDGE / Math.max(canvas.width, canvas.height));
  const outWidth = Math.round(canvas.width * scale);
  const outHeight = Math.round(canvas.height * scale);
  const outCanvas = new OffscreenCanvas(outWidth, outHeight);
  outCanvas.getContext('2d').drawImage(canvas, 0, 0, outWidth, outHeight);

  const outBlob = await outCanvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });
  const imageDataUrl = await blobToDataUrl(outBlob);

  return { imageDataUrl, width: outWidth, height: outHeight };
}

async function blobToDataUrl(blob) {
  const buffer = await blob.arrayBuffer();
  return `data:${blob.type};base64,${arrayBufferToBase64(buffer)}`;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000; // avoid String.fromCharCode call-stack overflow on large arrays
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
