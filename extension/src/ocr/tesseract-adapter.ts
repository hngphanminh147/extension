/**
 * Tesseract.js implementation of OcrAdapter.
 *
 * Uses a singleton worker so the WASM init cost is paid only once per
 * offscreen document lifetime (per language). The worker is lazily created
 * on the first `recognize()` call and reinit'd when the language changes.
 *
 * Asset paths point to locally bundled files under public/tesseract/ and
 * public/lang-data/ to satisfy the extension's Content Security Policy.
 */

import { createWorker } from 'tesseract.js';
import type { Worker } from 'tesseract.js';
import type { OcrAdapter, OcrResult } from './adapter';

/** Tesseract language codes with CJK (Chinese, Japanese, Korean) script support. */
const CJK_LANGS = new Set(['chi_sim', 'chi_tra', 'jpn', 'jpn_vert', 'tha']);

export class TesseractAdapter implements OcrAdapter {
  private worker: Worker | null = null;
  private currentLang: string | null = null;
  private initPromise: Promise<Worker> | null = null;

  private async createWorker(lang: string): Promise<Worker> {
    const w = await createWorker(lang, 1, {
      workerPath: chrome.runtime.getURL('tesseract/worker.min.js'),
      corePath:   chrome.runtime.getURL('tesseract/tesseract-core-simd-lstm.wasm.js'),
      langPath:   chrome.runtime.getURL('lang-data/'),
      workerBlobURL: false,
      gzip: false,
      logger: (m: { status: string; progress: number }) => {
        if (m.status === 'recognizing text') {
          console.debug(`[OCR:tesseract] ${Math.round(m.progress * 100)}%`);
        }
      },
    });
    this.worker = w;
    this.currentLang = lang;
    return w;
  }

  private async getWorker(lang: string): Promise<Worker> {
    if (this.worker && this.currentLang === lang) {
      return this.worker;
    }

    if (this.worker || this.initPromise) {
      await this.terminate();
    }

    this.initPromise ??= this.createWorker(lang).finally(() => {
      this.initPromise = null;
    });
    return this.initPromise;
  }

  async recognize(imageDataUrl: string, lang: string): Promise<OcrResult> {
    const worker = await this.getWorker(lang);

    if (CJK_LANGS.has(lang)) {
      await worker.setParameters({ preserve_interword_spaces: '1' });
    }

    const { data } = await worker.recognize(imageDataUrl);
    return {
      text: data.text.trim(),
      confidence: Math.round(data.confidence),
    };
  }

  async terminate(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.currentLang = null;
    }
    this.initPromise = null;
  }
}
