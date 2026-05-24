# Quick Translate — Chrome Extension

A lightweight, personal-use Chrome extension (Manifest V3) for fast translation. Trigger it from the popup for manual input or select text on any page to get an inline tooltip translation — no API keys, no backend, no setup beyond loading the unpacked build.

Built with **Vite + React + TypeScript** (popup) and **vanilla TypeScript** (content script).

---

## Features

- **Popup** — type a word or sentence; single-word lookups show definitions and examples, sentences show a plain translation. Debounced autocomplete via Google Suggest.
- **Selection tooltip** — select text on any page, click the translate button that appears, and see the result inline. Dismiss with a click outside or **Esc**.
- **OCR** — drag to crop a screen region; the offscreen document runs Tesseract to extract text, which is then translated.
- **Language pair** — configurable source → target (defaults: `en → vi`). Pick from 18 languages directly in the popup; choice persists via `chrome.storage.local`.

---

## Setup

From the project root:

```bash
npm install
npm run build
```

A `dist/` folder is generated at the root. This is what Chrome loads.

> **Never edit files inside `dist/` directly.** Always edit source in `extension/src/` and re-run `npm run build`.

---

## Loading the extension in Chrome

1. Open [chrome://extensions/](chrome://extensions/).
2. Enable **Developer mode** (toggle in the top-right).
3. Click **Load unpacked** and select the `dist/` folder.
4. The extension appears as **Quick Translate** in your extensions list.
5. (Optional) Pin it next to the address bar for quick access.

---

## Project structure

```
extension/
  src/
    background/   # Service worker — all fetch() calls live here
    content/      # Content script — selection listener, tooltip DOM, OCR overlay
    popup/        # React popup UI (App.tsx, components/)
    offscreen/    # Offscreen document — canvas crop + Tesseract OCR
    shared/       # types.ts, messages.ts, translate.ts (shared contracts)
  public/
    manifest.json
dist/             # Build output (gitignored) — load this as the unpacked extension
```

---

## Tech stack

| Layer | Technology |
| ----- | ---------- |
| Build | Vite |
| Popup UI | React + TypeScript |
| Content / Background / Offscreen | Vanilla TypeScript |
| OCR | Tesseract.js (via offscreen document) |
| Translate / Suggest | Unofficial Google endpoints (personal use) |
