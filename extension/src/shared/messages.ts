export const MSG = {
  SUGGEST: 'SUGGEST',
  TRANSLATE: 'TRANSLATE',
  CONTEXT_TRANSLATE: 'CONTEXT_TRANSLATE',

  // OCR pipeline
  START_OCR:      'START_OCR',       // popup → background: begin OCR flow
  START_SELECTION:'START_SELECTION', // background → content: show overlay
  SELECTION_DONE: 'SELECTION_DONE',  // content → background: { rect, dpr }
  RUN_OCR:        'RUN_OCR',         // background → offscreen: { dataUrl, rect, dpr, lang, debug }
  OCR_DONE:       'OCR_DONE',        // offscreen → background: { text, confidence, croppedUrl? }
  OCR_RESULT:     'OCR_RESULT',      // background → content: { text, confidence, croppedUrl?, timings? }
  OCR_ERROR:      'OCR_ERROR',       // background → content: { error }
  OCR_CANCEL:     'OCR_CANCEL',      // content → background: user cancelled
  OCR_ABORT:      'OCR_ABORT',       // background → offscreen: cancel in-flight job
} as const;
