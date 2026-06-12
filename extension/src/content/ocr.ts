// Keep in sync with shared/messages.ts MSG constants.
// Inlined to avoid a Rollup shared chunk (content scripts can't load ES module chunks).
const MSG_START_SELECTION = 'START_SELECTION';
const MSG_SELECTION_DONE  = 'SELECTION_DONE';
const MSG_OCR_RESULT      = 'OCR_RESULT';
const MSG_OCR_ERROR       = 'OCR_ERROR';
const MSG_OCR_CANCEL      = 'OCR_CANCEL';

interface OcrRect { x: number; y: number; w: number; h: number }

let ocrOverlay: HTMLDivElement | null = null;
let ocrResultPanel: HTMLDivElement | null = null;
let ocrLoadingKeyHandler: ((e: KeyboardEvent) => void) | null = null;
let ocrTranslateFn: ((text: string, cb: (translated: string | null, error?: string) => void) => void) | null = null;

// ── Inline SVG icons ──────────────────────────────────────────────────────────

const CAMERA_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;
const COPY_ICON   = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const CHECK_ICON  = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const ALERT_ICON  = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;

// Inlined — value imports from shared modules would create a Rollup shared chunk
// that classic content scripts cannot load.
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function ocrDebugLog(stage: string, startMs: number, data: Record<string, unknown>): void {
  console.log(`[OCR:${stage}]`, { elapsed: Date.now() - startMs, ...data });
}

// ── Panel lifecycle ───────────────────────────────────────────────────────────

function removeOcrOverlay(): void {
  ocrOverlay?.remove();
  ocrOverlay = null;
}

function removeOcrResultPanel(): void {
  if (ocrLoadingKeyHandler) {
    document.removeEventListener('keydown', ocrLoadingKeyHandler);
    ocrLoadingKeyHandler = null;
  }
  ocrResultPanel?.remove();
  ocrResultPanel = null;
}

function cancelOcr(): void {
  removeOcrResultPanel();
  chrome.runtime.sendMessage({ type: MSG_OCR_CANCEL });
}

// ── Translation section helpers ───────────────────────────────────────────────

function getOrCreateTranslationSection(panel: HTMLDivElement): HTMLDivElement {
  let section = panel.querySelector('.qt-ocr-result__translation') as HTMLDivElement | null;
  if (!section) {
    section = document.createElement('div');
    section.className = 'qt-ocr-result__translation';
    const footer = panel.querySelector('.qt-ocr-result__footer');
    panel.insertBefore(section, footer ?? null);
  }
  return section;
}

function setTranslationLoading(section: HTMLDivElement): void {
  section.innerHTML = `
    <div class="qt-ocr-result__tl-loading">
      <div class="qt-ocr-result__tl-spinner"></div>
      <span>Translating…</span>
    </div>
  `;
}

function setTranslationResult(section: HTMLDivElement, translated: string, original: string): void {
  section.innerHTML = `
    <div class="qt-ocr-result__tl-row">
      <span class="qt-ocr-result__tl-text">${escapeHtml(translated)}</span>
      <button class="qt-ocr-result__tl-copy" aria-label="Copy translation">${COPY_ICON}</button>
    </div>
    <div class="qt-ocr-result__tl-source">${escapeHtml(original)}</div>
  `;

  const copyBtn = section.querySelector('.qt-ocr-result__tl-copy') as HTMLButtonElement | null;
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(translated).then(() => {
        copyBtn.innerHTML = CHECK_ICON;
        copyBtn.style.color = '#4cbb8a';
        setTimeout(() => { copyBtn.innerHTML = COPY_ICON; copyBtn.style.color = ''; }, 1500);
      }).catch(() => {});
    });
  }
}

function setTranslationError(section: HTMLDivElement, message: string): void {
  section.innerHTML = `<div class="qt-ocr-result__tl-error">${escapeHtml(message)}</div>`;
}

// ── Panel builders ────────────────────────────────────────────────────────────

function showOcrResultPanel(
  text: string,
  confidence: number,
  croppedUrl?: string,
  elapsed?: number,
  debug?: boolean,
): void {
  removeOcrResultPanel();

  const panel = document.createElement('div');
  panel.className = 'qt-ocr-result';

  const textContent = text
    ? escapeHtml(text)
    : '<span class="qt-ocr-result__empty">No text detected</span>';

  // Image preview toggle — always available when croppedUrl is present
  const previewSection = croppedUrl ? `
    <div class="qt-ocr-result__preview-row">
      <div class="qt-ocr-result__preview-divider"></div>
      <button class="qt-ocr-result__preview-toggle">Show image ▾</button>
    </div>
    <img class="qt-ocr-result__preview qt-ocr-result__preview--hidden" src="${croppedUrl}" alt="Scanned region" />
  ` : '';

  // Debug meta — only shown when ocrDebug is on
  const elapsedSuffix = elapsed === undefined ? '' : ` · ${elapsed}ms`;
  const metaSection = debug
    ? `<div class="qt-ocr-result__meta">Confidence: ${confidence}%${elapsedSuffix}</div>`
    : '';

  panel.innerHTML = `
    <div class="qt-ocr-result__head">
      <div class="qt-ocr-result__icon">${CAMERA_ICON}</div>
      <span class="qt-ocr-result__title">OCR Result</span>
      <button class="qt-ocr-result__close" aria-label="Close">&#215;</button>
    </div>
    <div class="qt-ocr-result__card">
      <pre class="qt-ocr-result__text">${textContent}</pre>
      ${previewSection}
      ${metaSection}
    </div>
    <div class="qt-ocr-result__footer">
      <button class="qt-ocr-result__copy-btn">Copy text</button>
      ${text ? '<button class="qt-ocr-result__translate-btn">Translate</button>' : ''}
    </div>
  `;

  panel.querySelector('.qt-ocr-result__close')?.addEventListener('click', removeOcrResultPanel);

  // Image toggle
  const toggleBtn = panel.querySelector('.qt-ocr-result__preview-toggle') as HTMLButtonElement | null;
  const previewImg = panel.querySelector('.qt-ocr-result__preview') as HTMLImageElement | null;
  if (toggleBtn && previewImg) {
    toggleBtn.addEventListener('click', () => {
      const hidden = previewImg.classList.toggle('qt-ocr-result__preview--hidden');
      toggleBtn.textContent = hidden ? 'Show image ▾' : 'Hide image ▴';
    });
  }

  const copyBtn = panel.querySelector('.qt-ocr-result__copy-btn') as HTMLButtonElement | null;
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(text).then(() => {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy text'; }, 1500);
      }).catch(() => { copyBtn.textContent = 'Failed'; });
    });
  }

  const translateBtn = panel.querySelector('.qt-ocr-result__translate-btn') as HTMLButtonElement | null;
  if (translateBtn && ocrTranslateFn) {
    const fn = ocrTranslateFn;
    translateBtn.addEventListener('click', () => {
      translateBtn.disabled = true;
      const section = getOrCreateTranslationSection(panel);
      setTranslationLoading(section);

      fn(text, (translated, error) => {
        translateBtn.disabled = false;
        if (error || !translated) {
          setTranslationError(section, error ?? 'Translation failed');
        } else {
          setTranslationResult(section, translated, text);
        }
      });
    });
  }

  document.body.appendChild(panel);
  ocrResultPanel = panel;

  if (text) {
    navigator.clipboard.writeText(text).catch(() => {/* silent */});
  }
}

function showOcrErrorPanel(message: string): void {
  removeOcrResultPanel();

  const panel = document.createElement('div');
  panel.className = 'qt-ocr-result qt-ocr-result--error';
  panel.innerHTML = `
    <div class="qt-ocr-result__head">
      <div class="qt-ocr-result__icon">${ALERT_ICON}</div>
      <span class="qt-ocr-result__title">OCR Error</span>
      <button class="qt-ocr-result__close" aria-label="Close">&#215;</button>
    </div>
    <div class="qt-ocr-result__error-msg">${escapeHtml(message)}</div>
  `;
  panel.querySelector('.qt-ocr-result__close')?.addEventListener('click', removeOcrResultPanel);
  document.body.appendChild(panel);
  ocrResultPanel = panel;
}

function showOcrLoadingPanel(): void {
  removeOcrResultPanel();

  const panel = document.createElement('div');
  panel.className = 'qt-ocr-result qt-ocr-result--loading';
  panel.innerHTML = `
    <div class="qt-ocr-result__head">
      <div class="qt-ocr-result__icon">${CAMERA_ICON}</div>
      <div class="qt-ocr-result__head-loading">
        <div class="qt-ocr-result__spinner"></div>
        <span class="qt-ocr-result__title">Running OCR…</span>
      </div>
      <button class="qt-ocr-result__close" aria-label="Cancel">&#215;</button>
    </div>
    <div class="qt-ocr-result__footer">
      <button class="qt-ocr-result__cancel">Cancel</button>
    </div>
  `;

  panel.querySelector('.qt-ocr-result__close')?.addEventListener('click', cancelOcr);
  panel.querySelector('.qt-ocr-result__cancel')?.addEventListener('click', cancelOcr);

  ocrLoadingKeyHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') cancelOcr();
  };
  document.addEventListener('keydown', ocrLoadingKeyHandler);

  document.body.appendChild(panel);
  ocrResultPanel = panel;
}

// ── Selection overlay ─────────────────────────────────────────────────────────

function startOcrSelection(debug: boolean): void {
  removeOcrOverlay();
  removeOcrResultPanel();

  const overlay = document.createElement('div');
  overlay.className = 'qt-ocr-overlay';
  document.body.appendChild(overlay);
  ocrOverlay = overlay;

  const selBox = document.createElement('div');
  selBox.className = 'qt-ocr-selection';
  overlay.appendChild(selBox);

  let startX = 0;
  let startY = 0;
  let dragging = false;
  const startMs = Date.now();

  function updateBox(rect: OcrRect): void {
    selBox.style.left   = `${rect.x}px`;
    selBox.style.top    = `${rect.y}px`;
    selBox.style.width  = `${rect.w}px`;
    selBox.style.height = `${rect.h}px`;
  }

  function onMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return;
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    updateBox({ x: startX, y: startY, w: 0, h: 0 });
    selBox.classList.add('qt-ocr-selection--active');
    e.preventDefault();
  }

  function onMouseMove(e: MouseEvent): void {
    if (!dragging) return;
    const x = Math.min(e.clientX, startX);
    const y = Math.min(e.clientY, startY);
    const w = Math.abs(e.clientX - startX);
    const h = Math.abs(e.clientY - startY);
    updateBox({ x, y, w, h });
  }

  function onMouseUp(e: MouseEvent): void {
    if (!dragging) return;
    dragging = false;

    const x = Math.min(e.clientX, startX);
    const y = Math.min(e.clientY, startY);
    const w = Math.abs(e.clientX - startX);
    const h = Math.abs(e.clientY - startY);

    cleanup();

    if (w < 8 || h < 8) return;

    const dpr = window.devicePixelRatio || 1;
    const rect: OcrRect = { x, y, w, h };

    if (debug) ocrDebugLog('selection-done', startMs, { rect, dpr, scaledRect: { x: x*dpr, y: y*dpr, w: w*dpr, h: h*dpr } });

    showOcrLoadingPanel();
    chrome.runtime.sendMessage({ type: MSG_SELECTION_DONE, rect, dpr, debug });
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      cleanup();
      chrome.runtime.sendMessage({ type: MSG_OCR_CANCEL });
    }
  }

  function cleanup(): void {
    overlay.removeEventListener('mousedown', onMouseDown);
    overlay.removeEventListener('mousemove', onMouseMove);
    overlay.removeEventListener('mouseup', onMouseUp);
    document.removeEventListener('keydown', onKeyDown);
    removeOcrOverlay();
  }

  overlay.addEventListener('mousedown', onMouseDown);
  overlay.addEventListener('mousemove', onMouseMove);
  overlay.addEventListener('mouseup', onMouseUp);
  document.addEventListener('keydown', onKeyDown);
}

// ── Init ──────────────────────────────────────────────────────────────────────

/**
 * Registers all OCR-related chrome.runtime.onMessage handlers.
 * @param onTranslate - called when the user clicks "Translate" on the OCR result panel.
 *   Receives the text to translate and a callback to deliver the result back in-panel.
 */
export function initOcrHandlers(
  onTranslate: (text: string, cb: (translated: string | null, error?: string) => void) => void,
): void {
  ocrTranslateFn = onTranslate;
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === MSG_START_SELECTION) {
      startOcrSelection((msg.debug as boolean) ?? false);
      return;
    }

    if (msg.type === MSG_OCR_RESULT) {
      showOcrResultPanel(
        msg.text as string,
        msg.confidence as number,
        msg.croppedUrl as string | undefined,
        msg.elapsed as number | undefined,
        msg.debug as boolean | undefined,
      );
      return;
    }

    if (msg.type === MSG_OCR_ERROR) {
      showOcrErrorPanel(msg.error as string);
    }
  });
}
