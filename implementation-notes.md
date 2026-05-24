# Implementation notes — Step 8 (OCR multi-language + popup trigger)

## Decisions not in the spec

- **`OCR_LANGUAGES` constant** added to `src/shared/types.ts` alongside `LANGUAGES`. Only lists languages with bundled `.traineddata` files so the popup selector never offers unavailable options.
- **Button label** kept as "Scan" (per delivery plan) rather than "Capture Text" which was in an earlier partial implementation.
- **`chi_sim.traineddata` source**: downloaded from `tessdata/main` on GitHub (~43 MB actual size, larger than the ~20 MB estimate in the plan). Same repo family as typical Tesseract.js usage.

## Bug fix included

Step 7 wired `handleSelectionDone` to fire `RUN_OCR` via `chrome.runtime.sendMessage` without a callback, while a separate `OCR_DONE` runtime listener expected a broadcast message that offscreen never sent (offscreen only uses `sendResponse`). OCR results were never reaching the content script.

**Fix:** background now forwards OCR results via the `sendMessage` callback from offscreen. Removed the dead `OCR_DONE` runtime listener.

## OCR worker CSP fix (post–Step 8)

Tesseract.js defaults to `workerBlobURL: true`, which creates a `blob:` worker that `importScripts()` the extension URL. MV3 CSP blocks that cross-origin load.

**Fix:** `workerBlobURL: false` in `TesseractAdapter`; manifest adds `wasm-unsafe-eval` CSP and `web_accessible_resources` for `tesseract/*` and `lang-data/*`.

## OCR "Failed to fetch" + infinite loading (post–Step 8)

**Root cause:** Tesseract defaults to `gzip: true`, fetching `{lang}.traineddata.gz` from `langPath`. Bundled files are uncompressed `{lang}.traineddata`. Fetch 404 → loadLanguage rejects → tesseract.js `createWorker` swallows the error in an empty `.catch()` → `createWorker()` promise never resolves → loading panel stuck forever.

**Fix:** `gzip: false` in `TesseractAdapter`.

**UX hardening:** Loading panel gets close (×), Cancel button, and Escape to dismiss; sends `OCR_CANCEL` → background `OCR_ABORT` → offscreen invalidates job + terminates worker. Background adds 120 s timeout and job sequence guard so stale/cancelled responses are ignored.

## Tradeoffs

- **Worker reinit on lang change** terminates and recreates the Tesseract worker (~2–5 s on first load per language). Acceptable for 1–2 bundled languages; offscreen document lifecycle cleanup deferred to future extensions list.
- **CJK params** applied per-recognize call when lang is in the CJK list; not reset for non-CJK (Tesseract default persists until worker is terminated).

## Popup OCR layout — compact row (post-Step 8 UX fix)

**Problem:** The OCR section (lang label row + full-width Scan button + debug toggle) consumed ~136px at the bottom of the popup. Combined with a word card result (~292px minimum), total popup height exceeded the 580px max-height, requiring scroll. Users didn't notice the popup's internal scrollbar, making the translate result feel cut off by the OCR section.

**Fix:**

- Merged the OCR lang label + select + Scan button into a single 34px row (`.qt-ocr-row`). Removed the separate "OCR language" label; the select is self-evident in context.
- Dropped full-width `.qt-ocr-btn` in favour of an inline auto-width button beside the select.
- Reduced `.qt-tab-body` min-height from 200px → 100px, max-height from 280px → 240px. For typical word cards, this keeps the layout within 580px without popup scroll.
- OCR section now ~80px (was ~136px); typical word card result now fits in 580px without scrolling.

**Files changed:** `App.tsx`, `popup/popup.css`.

## Files changed

- `extension/public/lang-data/chi_sim.traineddata` — new
- `extension/src/ocr/adapter.ts` — `lang` param on `recognize()`
- `extension/src/ocr/tesseract-adapter.ts` — lang-aware singleton, SIMD core, CJK params
- `extension/src/shared/types.ts` — `ocrLang`, `OCR_LANGUAGES`
- `extension/src/shared/messages.ts` — `RUN_OCR` comment
- `extension/src/offscreen/index.ts` — pass `lang` to adapter
- `extension/src/background/index.ts` — read `ocrLang`, relay via callback
- `extension/src/App.tsx` — OCR language select + Scan button
- `extension/src/popup/popup.css` — OCR lang row styles
- `.product/delivery_plan.md`, `.product/architecture.md` — step 8 marked done

## content/index.ts split into index.ts + ocr.ts (2026-05-25)

`content/index.ts` was 538 lines with two unrelated concerns. Split:
- `content/index.ts` — translation UI only (~291 lines)
- `content/ocr.ts` — OCR overlay + panels + message handler; exports `initOcrHandlers(onTranslate)` called by `index.ts`

**Build safety:** `ocr.ts` is only imported by the content script entry point, so Rollup inlines it into `content.js` without creating a shared chunk (which classic content scripts can't load). Confirmed: `dist/content.js` is the only output.

**Forward compatibility:** `initOcrHandlers` accepts an `onTranslate` callback, ready for the step-9 "Translate →" button.

## Auto-translate placeholder removed

The disabled "Auto-translate selected text" toggle (Step 2 placeholder, marked "coming soon") was removed from `App.tsx`. It had no state, no handler, and no wiring to any other feature. The inline translation it was intended to gate already exists as the content script tooltip (Step 3). The `qt-auto-row`, `qt-auto-row__label`, and `qt-switch` CSS classes were kept — the OCR debug toggle row still uses them. No `.product/` doc referenced the placeholder, so no doc update needed.
