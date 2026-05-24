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

function ocrDebugLog(stage: string, startMs: number, data: Record<string, unknown>): void {
  console.log(`[OCR:${stage}]`, { elapsed: Date.now() - startMs, ...data });
}

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

  const escapedText = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  let debugSection = '';
  if (debug) {
    debugSection = `
      <div class="qt-ocr-result__debug">
        ${croppedUrl ? `<img class="qt-ocr-result__preview" src="${croppedUrl}" alt="Cropped region" />` : ''}
        <div class="qt-ocr-result__meta">
          Confidence: ${confidence}%${elapsed === undefined ? '' : ` &nbsp;·&nbsp; ${elapsed}ms`}
        </div>
      </div>`;
  }

  panel.innerHTML = `
    <button class="qt-ocr-result__close" aria-label="Close">&#215;</button>
    <div class="qt-ocr-result__header">Extracted Text</div>
    <pre class="qt-ocr-result__text">${escapedText || '<span class="qt-ocr-result__empty">No text detected</span>'}</pre>
    ${debugSection}
    <div class="qt-ocr-result__actions">
      <button class="qt-ocr-result__copy">Copy</button>
    </div>
  `;

  panel.querySelector('.qt-ocr-result__close')?.addEventListener('click', removeOcrResultPanel);

  const copyBtn = panel.querySelector('.qt-ocr-result__copy') as HTMLButtonElement | null;
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(text).then(() => {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
      }).catch(() => {
        copyBtn.textContent = 'Failed';
      });
    });
  }

  document.body.appendChild(panel);
  ocrResultPanel = panel;

  // Auto-copy on result
  if (text) {
    navigator.clipboard.writeText(text).catch(() => {/* silent */});
  }
}

function showOcrErrorPanel(message: string): void {
  removeOcrResultPanel();

  const panel = document.createElement('div');
  panel.className = 'qt-ocr-result qt-ocr-result--error';
  panel.innerHTML = `
    <button class="qt-ocr-result__close" aria-label="Close">&#215;</button>
    <div class="qt-ocr-result__header">OCR Error</div>
    <div class="qt-ocr-result__error-msg">${message.replace(/</g, '&lt;')}</div>
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
    <button class="qt-ocr-result__close" aria-label="Cancel">&#215;</button>
    <div class="qt-ocr-result__header">
      <div class="qt-ocr-result__spinner"></div>
      Running OCR…
    </div>
    <button class="qt-ocr-result__cancel">Cancel</button>
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

    if (w < 8 || h < 8) return; // Too small — treat as cancelled

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

/**
 * Registers all OCR-related chrome.runtime.onMessage handlers.
 * @param onTranslate - callback for the future "Translate →" button (step 9).
 */
export function initOcrHandlers(
  _onTranslate: (text: string, rect: DOMRect) => void,
): void {
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
