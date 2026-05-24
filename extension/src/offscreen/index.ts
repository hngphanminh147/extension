/**
 * Offscreen document — OCR crop + recognition pipeline.
 *
 * Lifecycle:
 *  1. Background creates this document via chrome.offscreen.createDocument().
 *  2. Background sends RUN_OCR with { dataUrl, rect, dpr, lang, debug }.
 *  3. We crop the screenshot on a canvas, run the OcrAdapter, and reply OCR_DONE.
 *
 * DPI note: mouse coordinates from the content script are CSS pixels.
 * The screenshot from captureVisibleTab() is device pixels. We must scale
 * every coordinate by `dpr` before cropping.
 */

import { MSG } from '../shared/messages';
import { createOcrAdapter } from '../ocr/index';

interface OcrRect { x: number; y: number; w: number; h: number }

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

function debugLog(stage: string, startMs: number, data: Record<string, unknown>): void {
  console.log(`[OCR:${stage}]`, { elapsed: Date.now() - startMs, ...data });
}

async function cropImage(
  dataUrl: string,
  rect: OcrRect,
  dpr: number,
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

    if (debug) debugLog('crop-start', startMs, { rect, dpr });

    const { croppedUrl, width, height } = await cropImage(dataUrl, rect, dpr);
    if (jobId !== activeJobId) return;

    if (debug) debugLog('crop-done', startMs, { width, height, rect, dpr });
    if (debug) debugLog('ocr-start', startMs, { width, height });

    const result = await adapter.recognize(croppedUrl, lang);
    if (jobId !== activeJobId) return;

    if (debug) debugLog('ocr-done', startMs, { text: result.text.slice(0, 80), confidence: result.confidence });

    sendResponse({
      text: result.text,
      confidence: result.confidence,
      croppedUrl: debug ? croppedUrl : undefined,
      elapsed: Date.now() - startMs,
    });
  })().catch((err: unknown) => {
    if (jobId !== activeJobId) return;
    console.error('[OCR:offscreen] error', err);
    sendResponse({ error: err instanceof Error ? err.message : String(err) });
  });

  return true;
});
