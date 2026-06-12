// Type-only imports are erased at compile time — no runtime chunk dependency created.
// Value imports from shared modules must be inlined below to avoid a Rollup shared chunk
// that classic content scripts cannot load.
import type { MessageResponse, TranslateResult } from '../shared/types';
import { initOcrHandlers } from './ocr';

// Keep in sync with shared/messages.ts MSG constants
const MSG_TRANSLATE = 'TRANSLATE';
const MSG_CONTEXT_TRANSLATE = 'CONTEXT_TRANSLATE';

// Value copy of LANGUAGES from shared/types.ts — kept here to avoid a shared chunk
// that would require an ES module import in the classic content script.
const LANGUAGES: Record<string, string> = {
  auto: 'Auto-detect', en: 'English', vi: 'Vietnamese', zh: 'Chinese',
  ja: 'Japanese', ko: 'Korean', fr: 'French', de: 'German',
  es: 'Spanish', pt: 'Portuguese', ru: 'Russian', ar: 'Arabic',
  it: 'Italian', th: 'Thai', id: 'Indonesian', nl: 'Dutch',
  tr: 'Turkish', hi: 'Hindi',
};

// ── Language state (loaded from storage, kept in sync with popup) ─────────────
// Defaults inlined — keep in sync with DEFAULT_CONFIG in shared/types.ts.

const DEFAULT_SL = 'en';
const DEFAULT_TL = 'vi';

let currentSl = DEFAULT_SL;
let currentTl = DEFAULT_TL;

chrome.storage.local.get({ sourceLang: DEFAULT_SL, targetLang: DEFAULT_TL }, (result) => {
  currentSl = result.sourceLang as string;
  currentTl = result.targetLang as string;
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.sourceLang) currentSl = changes.sourceLang.newValue as string;
  if (changes.targetLang) currentTl = changes.targetLang.newValue as string;
});

// ── Singletons ────────────────────────────────────────────────────────────────

let trigger: HTMLButtonElement | null = null;
let tooltip: HTMLDivElement | null = null;

// Captured at selection time, consumed on trigger click
let pendingText = '';
let pendingRect: DOMRect | null = null;

// Kept for re-translation when the language changes inside the tooltip
let activeText = '';
let activeRect: DOMRect | null = null;

function getOrCreateTrigger(): HTMLButtonElement {
  if (!trigger) {
    trigger = document.createElement('button');
    trigger.className = 'qt-trigger qt-trigger--hidden';
    trigger.addEventListener('click', onTriggerClick);
    document.body.appendChild(trigger);
  }
  return trigger;
}

function getOrCreateTooltip(): HTMLDivElement {
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'qt-tooltip qt-tooltip--hidden';
    document.body.appendChild(tooltip);
  }
  return tooltip;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function langOptions(selected: string, includeAuto: boolean): string {
  return Object.entries(LANGUAGES)
    .filter(([code]) => includeAuto || code !== 'auto')
    .map(([code, name]) =>
      `<option value="${escapeHtml(code)}"${code === selected ? ' selected' : ''}>${escapeHtml(name)}</option>`,
    )
    .join('');
}

// ── Positioning ───────────────────────────────────────────────────────────────

function positionElement(el: HTMLElement, rect: DOMRect): void {
  const MARGIN = 8;
  const elH = el.offsetHeight || 120;
  const elW = el.offsetWidth || 300;

  // Prefer below the anchor; fall back to above when near the bottom of the viewport.
  let top: number;
  if (window.innerHeight - rect.bottom >= elH + MARGIN) {
    top = rect.bottom + window.scrollY + MARGIN;
  } else {
    top = rect.top + window.scrollY - elH - MARGIN;
    if (top < window.scrollY + MARGIN) top = window.scrollY + MARGIN;
  }

  let left = rect.left + window.scrollX;
  const maxLeft = window.scrollX + window.innerWidth - elW - MARGIN;
  if (left > maxLeft) left = maxLeft;
  if (left < window.scrollX + MARGIN) left = window.scrollX + MARGIN;

  el.style.top = `${top}px`;
  el.style.left = `${left}px`;
}

// ── Trigger ───────────────────────────────────────────────────────────────────

function showTrigger(text: string, rect: DOMRect): void {
  pendingText = text;
  pendingRect = rect;
  const el = getOrCreateTrigger();
  el.textContent = `Translate  ${currentSl} → ${currentTl}`;
  el.classList.remove('qt-trigger--hidden');
  positionElement(el, rect);
}

function hideTrigger(): void {
  trigger?.classList.add('qt-trigger--hidden');
  pendingText = '';
  pendingRect = null;
}

function onTriggerClick(): void {
  const text = pendingText;
  const rect = pendingRect;
  hideTrigger();
  if (text && rect) translateAndShow(text, rect);
}

// ── Tooltip render states ─────────────────────────────────────────────────────

function showLoading(el: HTMLDivElement): void {
  el.innerHTML = '<div class="qt-tooltip__loading">Translating…</div>';
  el.classList.remove('qt-tooltip--hidden');
}

function showResult(el: HTMLDivElement, result: TranslateResult, sl: string, tl: string): void {
  const swapDisabled = sl === 'auto' ? ' disabled' : '';
  el.innerHTML = `
    <button class="qt-tooltip__close" aria-label="Close">&#215;</button>
    <div class="qt-tooltip__translation">${escapeHtml(result.translatedText)}</div>
    <div class="qt-tooltip__source">${escapeHtml(result.sourceText)}</div>
    <div class="qt-tooltip__langs">
      <select class="qt-tooltip__lang-select" data-role="sl">${langOptions(sl, true)}</select>
      <button class="qt-tooltip__lang-swap" title="Swap languages"${swapDisabled}>&#8644;</button>
      <select class="qt-tooltip__lang-select" data-role="tl">${langOptions(tl, false)}</select>
    </div>
  `;
  el.querySelector('.qt-tooltip__close')?.addEventListener('click', hideTooltip);
  el.querySelector('.qt-tooltip__lang-swap')?.addEventListener('click', onSwapClick);
  el.querySelectorAll<HTMLSelectElement>('.qt-tooltip__lang-select').forEach((sel) => {
    sel.addEventListener('change', onLangChange);
  });
  el.classList.remove('qt-tooltip--hidden');
}

function showError(el: HTMLDivElement, message: string): void {
  el.innerHTML = `
    <button class="qt-tooltip__close" aria-label="Close">&#215;</button>
    <div class="qt-tooltip__error">${escapeHtml(message)}</div>
  `;
  el.querySelector('.qt-tooltip__close')?.addEventListener('click', hideTooltip);
  el.classList.remove('qt-tooltip--hidden');
}

function applySourceLang(val: string): void {
  if (val !== currentTl) {
    currentSl = val;
    return;
  }
  // Conflict: the new source matches the current target — swap.
  // If old source was 'auto' it can't become the new target, so fall back to a default.
  const fallback = val === DEFAULT_SL ? DEFAULT_TL : DEFAULT_SL;
  currentTl = currentSl === 'auto' ? fallback : currentSl;
  currentSl = val;
}

function applyTargetLang(val: string): void {
  // 'auto' is not in target options, so currentSl is always a real code here.
  if (val === currentSl) {
    currentSl = currentTl; // swap
  }
  currentTl = val;
}

function onLangChange(e: Event): void {
  const sel = e.target as HTMLSelectElement;
  if (sel.dataset.role === 'sl') {
    applySourceLang(sel.value);
  } else {
    applyTargetLang(sel.value);
  }
  chrome.storage.local.set({ sourceLang: currentSl, targetLang: currentTl });
  if (activeText && activeRect) translateAndShow(activeText, activeRect);
}

function onSwapClick(): void {
  if (currentSl === 'auto') return;
  const tmp = currentSl;
  currentSl = currentTl;
  currentTl = tmp;
  chrome.storage.local.set({ sourceLang: currentSl, targetLang: currentTl });
  if (activeText && activeRect) translateAndShow(activeText, activeRect);
}

function hideTooltip(): void {
  tooltip?.classList.add('qt-tooltip--hidden');
}

function hideAll(): void {
  hideTrigger();
  hideTooltip();
}

// ── Translate + show ──────────────────────────────────────────────────────────

function translateAndShow(text: string, rect: DOMRect): void {
  activeText = text;
  activeRect = rect;

  const el = getOrCreateTooltip();
  const sl = currentSl;
  const tl = currentTl;

  showLoading(el);
  positionElement(el, rect);

  chrome.runtime.sendMessage(
    { type: MSG_TRANSLATE, text, sl, tl },
    (response: MessageResponse<TranslateResult>) => {
      if (chrome.runtime.lastError) {
        showError(el, 'Extension error');
        positionElement(el, rect);
        return;
      }
      if (response?.ok && response.data) {
        showResult(el, response.data, sl, tl);
      } else {
        showError(el, response?.error ?? 'Translation failed');
      }
      positionElement(el, rect);
    },
  );
}

// ── Selection listener ────────────────────────────────────────────────────────

document.addEventListener('mouseup', (e) => {
  if (trigger?.contains(e.target as Node)) return;
  if (tooltip?.contains(e.target as Node)) return;

  const selection = window.getSelection();
  const text = selection?.toString().trim();

  if (!text) {
    hideTrigger();
    return;
  }

  hideTooltip();
  const rect = selection!.getRangeAt(0).getBoundingClientRect();
  showTrigger(text, rect);
});

// ── Dismiss handlers ──────────────────────────────────────────────────────────

document.addEventListener('pointerdown', (e) => {
  const target = e.target as Node;
  if (!trigger?.contains(target) && !tooltip?.contains(target)) {
    hideAll();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideAll();
});

// ── Context menu handler ──────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== MSG_CONTEXT_TRANSLATE) return;

  const text = msg.text as string;
  const selection = window.getSelection();
  let rect: DOMRect;
  if (selection && selection.rangeCount > 0) {
    rect = selection.getRangeAt(0).getBoundingClientRect();
  } else {
    rect = new DOMRect(window.innerWidth / 2, 80, 0, 0);
  }
  hideTrigger();
  translateAndShow(text, rect);
});

// ── OCR ───────────────────────────────────────────────────────────────────────

function doTranslate(
  text: string,
  cb: (translated: string | null, error?: string) => void,
): void {
  chrome.runtime.sendMessage(
    { type: MSG_TRANSLATE, text, sl: currentSl, tl: currentTl },
    (response: MessageResponse<TranslateResult>) => {
      if (chrome.runtime.lastError) { cb(null, 'Extension error'); return; }
      if (response?.ok && response.data) {
        cb(response.data.translatedText);
      } else {
        cb(null, response?.error ?? 'Translation failed');
      }
    },
  );
}

initOcrHandlers(doTranslate);
