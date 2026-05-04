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

async function fetchTranslate(text: string): Promise<TranslateResult> {
  const single = isSingleWord(text);
  const url = new URL('https://translate.google.com/translate_a/single');
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', config.sourceLang);
  url.searchParams.set('tl', config.targetLang);
  url.searchParams.set('hl', config.uiLang);
  url.searchParams.set('ie', 'UTF-8');
  url.searchParams.set('oe', 'UTF-8');
  url.searchParams.set('q', text);
  // dt=t is always included; word-only params add richer data
  url.searchParams.append('dt', 't');
  if (single) {
    url.searchParams.append('dt', 'md');
    url.searchParams.append('dt', 'ex');
    url.searchParams.append('dt', 'ss');
    url.searchParams.append('dt', 'bd');
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

// Stub — fully wired in Step 4
chrome.contextMenus.onClicked.addListener((_info, _tab) => {});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === MSG.SUGGEST) {
    fetchSuggest(msg.text as string)
      .then((data) => sendResponse({ ok: true, data } satisfies MessageResponse<SuggestResult>))
      .catch((err: unknown) =>
        sendResponse({ ok: false, error: String(err) } satisfies MessageResponse<SuggestResult>),
      );
    return true;
  }
  if (msg.type === MSG.TRANSLATE) {
    fetchTranslate(msg.text as string)
      .then((data) => sendResponse({ ok: true, data } satisfies MessageResponse<TranslateResult>))
      .catch((err: unknown) =>
        sendResponse({ ok: false, error: String(err) } satisfies MessageResponse<TranslateResult>),
      );
    return true;
  }
});
