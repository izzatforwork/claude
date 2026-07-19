import {
  MAX_LONG_EDGE,
  JPEG_QUALITY,
  CIRCLE_RADIUS_CSS,
  CIRCLE_LINE_WIDTH_CSS,
  CIRCLE_HALO_EXTRA_CSS,
} from '../shared/constants.js';

// Captures the current viewport, draws a red-ring highlight at the click point,
// then downsizes/compresses to a JPEG data URL. Runs entirely in the background
// service worker via OffscreenCanvas - no chrome.offscreen permission needed,
// and no round-trip through the content script.
export async function captureAndComposite(windowId, cssX, cssY, dpr) {
  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
  const captureBlob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(captureBlob);

  // captureVisibleTab returns physical-pixel resolution (CSS size * dpr), while
  // click coordinates are CSS px - this multiplication is the DPR correction.
  const circleX = Math.round(cssX * dpr);
  const circleY = Math.round(cssY * dpr);
  const radius = CIRCLE_RADIUS_CSS * dpr;
  const lineWidth = CIRCLE_LINE_WIDTH_CSS * dpr;
  const haloLineWidth = lineWidth + CIRCLE_HALO_EXTRA_CSS * dpr;

  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);

  // White halo first for legibility on dark backgrounds, red ring on top.
  ctx.beginPath();
  ctx.arc(circleX, circleY, radius, 0, Math.PI * 2);
  ctx.lineWidth = haloLineWidth;
  ctx.strokeStyle = '#FFFFFF';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(circleX, circleY, radius, 0, Math.PI * 2);
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = '#FF0000';
  ctx.stroke();

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
