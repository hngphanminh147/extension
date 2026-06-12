/**
 * Offscreen document — OCR crop + recognition pipeline.
 *
 * Lifecycle:
 *  1. Background creates this document via chrome.offscreen.createDocument().
 *  2. Background sends RUN_OCR with { dataUrl, rect, dpr, lang, debug }.
 *  3. We crop the screenshot on a canvas, run the OcrAdapter, and reply via sendResponse callback.
 *
 * DPI note: mouse coordinates from the content script are CSS pixels.
 * The screenshot from captureVisibleTab() is device pixels. We must scale
 * every coordinate by `dpr` before cropping.
 */

import { MSG } from '../shared/messages';
import { createOcrAdapter } from '../ocr/index';
import type { OcrRect } from '../shared/types';
import { ocrLog } from '../shared/utils';

interface RunOcrMessage {
  type: typeof MSG.RUN_OCR;
  dataUrl: string;
  rect: OcrRect;
  dpr: number;
  lang: string;
  debug: boolean;
}

const adapter = createOcrAdapter();
let activeJobId = 0;

async function cropImage(
  dataUrl: string,
  rect: OcrRect,
  dpr: number,
  mode: 'normal' | 'invert' | 'gray' = 'normal',
): Promise<{ croppedUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const sx = Math.round(rect.x * dpr);
      const sy = Math.round(rect.y * dpr);
      const sw = Math.round(rect.w * dpr);
      const sh = Math.round(rect.h * dpr);

      const outW = sw * 2;
      const outH = sh * 2;

      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);

      if (mode === 'invert') {
        ctx.globalCompositeOperation = 'difference';
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, outW, outH);
        ctx.globalCompositeOperation = 'source-over';
      } else if (mode === 'gray') {
        ctx.globalCompositeOperation = 'saturation';
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, outW, outH);
        ctx.globalCompositeOperation = 'source-over';
      }

      resolve({ croppedUrl: canvas.toDataURL('image/png'), width: outW, height: outH });
    };
    img.onerror = () => reject(new Error('Failed to load screenshot image'));
    img.src = dataUrl;
  });
}

function abortActiveJob(): void {
  activeJobId += 1;
  void adapter.terminate();
}

chrome.runtime.onMessage.addListener((msg: RunOcrMessage | { type: typeof MSG.OCR_ABORT }, _sender, sendResponse) => {
  if (msg.type === MSG.OCR_ABORT) {
    abortActiveJob();
    return;
  }

  if (msg.type !== MSG.RUN_OCR) return;

  const jobId = ++activeJobId;
  const startMs = Date.now();

  (async () => {
    const { dataUrl, rect, dpr, lang, debug } = msg;

    if (debug) ocrLog('crop-start', startMs, { rect, dpr });

    // Run normal pass
    const { croppedUrl: normalUrl, width, height } = await cropImage(dataUrl, rect, dpr, 'normal');
    if (jobId !== activeJobId) return;
    if (debug) ocrLog('crop-done', startMs, { width, height, mode: 'normal' });

    const normalResult = await adapter.recognize(normalUrl, lang);
    if (jobId !== activeJobId) return;
    if (debug) ocrLog('ocr-done', startMs, { confidence: normalResult.confidence, mode: 'normal' });

    interface Candidate { croppedUrl: string; text: string; confidence: number }
    const candidates: Candidate[] = [{ croppedUrl: normalUrl, ...normalResult }];

    if (normalResult.confidence < 50) {
      // Retry with inverted colors (handles light-on-dark pages)
      const { croppedUrl: invertUrl } = await cropImage(dataUrl, rect, dpr, 'invert');
      if (jobId !== activeJobId) return;
      const invertResult = await adapter.recognize(invertUrl, lang);
      if (jobId !== activeJobId) return;
      if (debug) ocrLog('ocr-done', startMs, { confidence: invertResult.confidence, mode: 'invert' });
      candidates.push({ croppedUrl: invertUrl, ...invertResult });

      if (invertResult.confidence < 20) {
        // Last resort: grayscale
        const { croppedUrl: grayUrl } = await cropImage(dataUrl, rect, dpr, 'gray');
        if (jobId !== activeJobId) return;
        const grayResult = await adapter.recognize(grayUrl, lang);
        if (jobId !== activeJobId) return;
        if (debug) ocrLog('ocr-done', startMs, { confidence: grayResult.confidence, mode: 'gray' });
        candidates.push({ croppedUrl: grayUrl, ...grayResult });
      }
    }

    const best = candidates.reduce((a, b) => b.confidence > a.confidence ? b : a, candidates[0]);

    sendResponse({
      text: best.text,
      confidence: best.confidence,
      croppedUrl: best.croppedUrl,
      elapsed: Date.now() - startMs,
    });
  })().catch((err: unknown) => {
    if (jobId !== activeJobId) return;
    console.error('[OCR:offscreen] error', err);
    sendResponse({ error: err instanceof Error ? err.message : String(err) });
  });

  return true;
});
