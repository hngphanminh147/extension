# Phase 4 — Delivery Plan

## Overview

This plan breaks the MVP into incremental milestones, each delivering a working slice of functionality.

## Milestone 0: Project Setup

**Goal:** Establish development environment and project structure

| Task | Description |
|------|-------------|
| Initialize Vite + React + TypeScript | Create extension scaffold |
| Configure CRXJS plugin | Enable Chrome extension dev with HMR |
| Setup manifest.json (Manifest V3) | Permissions, content scripts, service worker |
| Configure ESLint + Prettier | Code quality tooling |
| Setup Vitest | Unit testing framework |
| Create folder structure | As defined in architecture |

**Deliverable:** Empty extension loads in Chrome, popup opens

---

## Milestone 1: Core Translation Flow

**Goal:** End-to-end translation working with hardcoded provider

| Task | Description |
|------|-------------|
| Implement `TranslatorProvider` interface | Base contract for providers |
| Create `GoogleTranslateProvider` | First provider implementation |
| Build background service worker | Message handling, API calls |
| Implement content script | Text selection detection |
| Add context menu | "Translate to English" menu item |
| Build basic tooltip component | Display translation result |
| Wire up message passing | Content ↔ Background communication |

**Deliverable:** Select text → right-click → see translation in tooltip

---

## Milestone 2: Settings & Configuration

**Goal:** User can configure target language and API key

| Task | Description |
|------|-------------|
| Design popup UI (React) | Tabs: Translate, History, Settings |
| Implement settings storage | `chrome.storage.sync` for settings |
| Build settings form | Target language dropdown, API key input |
| Dynamic context menu | Update menu text based on target lang |
| Add language list | ISO 639-1 supported languages |

**Deliverable:** Settings persist across sessions and devices

---

## Milestone 3: Caching & History

**Goal:** Improve performance and enable history viewing

| Task | Description |
|------|-------------|
| Implement `TranslationCache` | LRU cache with 24h TTL |
| Build history storage | Store last 50 translations |
| Create history UI in popup | List view with search/filter |
| Add "Copy" action to tooltip | Copy translation to clipboard |
| Implement cache indicators | Show "cached" badge on cached results |

**Deliverable:** Repeated translations are instant; history viewable in popup

---

## Milestone 4: Multi-Provider Support

**Goal:** Support multiple translation providers

| Task | Description |
|------|-------------|
| Implement `DeepLProvider` | DeepL API integration |
| Implement `LibreTranslateProvider` | Free/self-hosted option |
| Implement `OpenAIProvider` | GPT-based translation |
| Build provider factory | Dynamic provider instantiation |
| Add provider selector in settings | Dropdown with API key per provider |
| Handle provider errors gracefully | Fallback messaging |

**Deliverable:** User can switch between providers in settings

---

## Milestone 5: Polish & Edge Cases

**Goal:** Production-ready quality

| Task | Description |
|------|-------------|
| Tooltip positioning | Handle edge cases (near viewport edges) |
| Loading states | Spinner in tooltip while translating |
| Error handling UI | User-friendly error messages |
| Input validation | Text length limits, lang code validation |
| Keyboard shortcut | Optional hotkey for translation |
| Auto-detect source language | Display detected language in tooltip |

**Deliverable:** Smooth UX with no rough edges

---

## Milestone 6: Testing & Release

**Goal:** Ship to Chrome Web Store

| Task | Description |
|------|-------------|
| Unit tests | Providers, cache, storage helpers |
| Integration tests | Message passing, full translation flow |
| Manual QA | Test on various websites |
| Create store assets | Icons (128x128, 48x48, 16x16), screenshots |
| Write store description | Feature list, privacy policy |
| Submit to Chrome Web Store | Review and publish |

**Deliverable:** Extension live on Chrome Web Store

---

## Dependency Graph

```
M0 (Setup)
 │
 ▼
M1 (Core Translation) ──────┐
 │                          │
 ▼                          ▼
M2 (Settings) ────────► M4 (Multi-Provider)
 │                          │
 ▼                          │
M3 (Cache & History) ◄──────┘
 │
 ▼
M5 (Polish)
 │
 ▼
M6 (Release)
```

## Risk Mitigation Checkpoints

| After Milestone | Validate |
|-----------------|----------|
| M1 | Translation latency < 500ms |
| M3 | Cache hit rate on repeated queries |
| M4 | All providers work with same interface |
| M5 | Test on 10+ popular websites |

## Definition of Done (per milestone)

- [ ] All tasks completed
- [ ] No TypeScript errors
- [ ] No ESLint warnings
- [ ] Unit tests passing
- [ ] Manual smoke test successful
- [ ] Code reviewed (if team)
