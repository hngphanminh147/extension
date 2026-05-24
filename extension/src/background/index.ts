// indices per .docs/request-response-formats.md; positions may drift across regions/clients
import { DEFAULT_CONFIG, type ExtensionConfig, type MessageResponse, type SuggestResult, type TranslateResult } from '../shared/types';
import { MSG } from '../shared/messages';
import { isSingleWord, parseSuggestResponse, parseTranslateResponse } from '../shared/translate';

let config: ExtensionConfig = { ...DEFAULT_CONFIG };
chrome.storage.local.get(DEFAULT_CONFIG, (stored) => {
  config = stored as ExtensionConfig;
});

async function fetchSuggest(text: string): Promise<SuggestResult> {
  const url = new URL('https://suggestqueries.google.com/complete/search');
  url.searchParams.set('client', 'firefox');
  url.searchParams.set('q', text);
  url.searchParams.set('hl', config.uiLang);
  url.searchParams.set('gl', 'us');
  url.searchParams.set('ie', 'utf-8');
  url.searchParams.set('oe', 'utf-8');

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Suggest HTTP ${res.status}`);
  const data: unknown[] = await res.json();
  return parseSuggestResponse(data);
}

async function fetchTranslate(text: string, sl?: string, tl?: string): Promise<TranslateResult> {
  const single = isSingleWord(text);
  const url = new URL('https://translate.google.com/translate_a/single');
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', sl ?? config.sourceLang);
  url.searchParams.set('tl', tl ?? config.targetLang);
  url.searchParams.set('hl', config.uiLang);
  url.searchParams.set('ie', 'UTF-8');
  url.searchParams.set('oe', 'UTF-8');
  url.searchParams.set('q', text);
  // dt params match observed Google web calls that usually return the 14-slot payload.
  // indices per .docs/request-response-formats.md; positions may drift if dt set changes
  url.searchParams.append('dt', 't');
  if (single) {
    for (const dt of ['bd', 'ex', 'ld', 'md', 'qca', 'rw', 'rm', 'ss', 'at']) {
      url.searchParams.append('dt', dt);
    }
  }

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Translate HTTP ${res.status}`);
  const data: unknown = await res.json();
  return parseTranslateResponse(data, text, single);
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'qt-translate',
    title: 'Translate',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'qt-translate' && info.selectionText && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: MSG.CONTEXT_TRANSLATE, text: info.selectionText });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === MSG.SUGGEST) {
    fetchSuggest(msg.text as string)
      .then((data) => sendResponse({ ok: true, data } satisfies MessageResponse<SuggestResult>))
      .catch((err: unknown) =>
        sendResponse({ ok: false, error: String(err) } satisfies MessageResponse<SuggestResult>),
      );
    return true;
  }
  if (msg.type === MSG.TRANSLATE) {
    fetchTranslate(msg.text as string, msg.sl as string | undefined, msg.tl as string | undefined)
      .then((data) => sendResponse({ ok: true, data } satisfies MessageResponse<TranslateResult>))
      .catch((err: unknown) =>
        sendResponse({ ok: false, error: String(err) } satisfies MessageResponse<TranslateResult>),
      );
    return true;
  }

  // ── OCR pipeline ────────────────────────────────────────────────────────────

  if (msg.type === MSG.START_OCR) {
    handleStartOcr();
    return;
  }

  if (msg.type === MSG.SELECTION_DONE) {
    handleSelectionDone(
      msg as { type: string; rect: OcrRect; dpr: number; debug: boolean },
      sender.tab?.id,
    );
    return;
  }

  if (msg.type === MSG.OCR_CANCEL) {
    cancelOcrJob();
  }
});

// ── OCR helpers ──────────────────────────────────────────────────────────────

interface OcrRect { x: number; y: number; w: number; h: number }

let pendingOcrTabId: number | null = null;
let ocrJobSeq = 0;
const OCR_TIMEOUT_MS = 120_000;

const OFFSCREEN_URL = 'offscreen.html';

function cancelOcrJob(): void {
  pendingOcrTabId = null;
  ocrJobSeq += 1;
  chrome.runtime.sendMessage({ type: MSG.OCR_ABORT });
}

async function ensureOffscreenDocument(): Promise<void> {
  const existing = await chrome.offscreen.hasDocument();
  if (existing) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.DOM_SCRAPING],
    justification: 'Canvas crop and Tesseract OCR',
  });
}

function handleStartOcr(): void {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id;
    if (tabId == null) return;
    chrome.storage.local.get({ ocrDebug: false }, (stored) => {
      const debug = stored.ocrDebug as boolean;
      chrome.tabs.sendMessage(tabId, { type: MSG.START_SELECTION, debug });
    });
  });
}

function ocrBgLog(stage: string, startMs: number, data: Record<string, unknown>): void {
  console.log(`[OCR:${stage}]`, { elapsed: Date.now() - startMs, ...data });
}

function handleSelectionDone(
  msg: { type: string; rect: OcrRect; dpr: number; debug: boolean },
  tabId: number | undefined,
): void {
  if (tabId == null) return;
  pendingOcrTabId = tabId;
  const jobSeq = ++ocrJobSeq;

  const { rect, dpr, debug } = msg;
  const startMs = Date.now();
  let settled = false;

  const finish = (fn: () => void) => {
    if (settled || pendingOcrTabId !== tabId || jobSeq !== ocrJobSeq) return;
    settled = true;
    pendingOcrTabId = null;
    fn();
  };

  const timeoutId = setTimeout(() => {
    finish(() => {
      cancelOcrJob();
      chrome.tabs.sendMessage(tabId, { type: MSG.OCR_ERROR, error: 'OCR timed out' });
    });
  }, OCR_TIMEOUT_MS);

  chrome.tabs.captureVisibleTab({ format: 'png' }, (dataUrl) => {
    if (jobSeq !== ocrJobSeq) return;

    if (chrome.runtime.lastError || !dataUrl) {
      clearTimeout(timeoutId);
      finish(() => {
        chrome.tabs.sendMessage(tabId, {
          type: MSG.OCR_ERROR,
          error: chrome.runtime.lastError?.message ?? 'Screenshot failed',
        });
      });
      return;
    }

    if (debug) ocrBgLog('screenshot-taken', startMs, { dataUrlLength: dataUrl.length });

    ensureOffscreenDocument()
      .then(() => {
        if (jobSeq !== ocrJobSeq) return;
        chrome.storage.local.get({ ocrLang: config.ocrLang }, (stored) => {
          if (jobSeq !== ocrJobSeq) return;
          const lang = stored.ocrLang as string;
          chrome.runtime.sendMessage(
            { type: MSG.RUN_OCR, dataUrl, rect, dpr, lang, debug },
            (response: { error?: string; text?: string; confidence?: number; croppedUrl?: string; elapsed?: number } | undefined) => {
              clearTimeout(timeoutId);
              finish(() => {
                if (chrome.runtime.lastError) {
                  chrome.tabs.sendMessage(tabId, {
                    type: MSG.OCR_ERROR,
                    error: chrome.runtime.lastError.message ?? 'OCR failed',
                  });
                  return;
                }

                if (!response || response.error) {
                  chrome.tabs.sendMessage(tabId, {
                    type: MSG.OCR_ERROR,
                    error: response?.error ?? 'OCR failed',
                  });
                } else {
                  chrome.tabs.sendMessage(tabId, {
                    type: MSG.OCR_RESULT,
                    text: response.text,
                    confidence: response.confidence,
                    croppedUrl: response.croppedUrl,
                    elapsed: response.elapsed,
                    debug,
                  });
                }
              });
            },
          );
        });
      })
      .catch((err: unknown) => {
        clearTimeout(timeoutId);
        finish(() => {
          chrome.tabs.sendMessage(tabId, { type: MSG.OCR_ERROR, error: String(err) });
        });
      });
  });
}
