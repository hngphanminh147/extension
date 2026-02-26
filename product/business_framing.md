# Phase 1 — Business Framing

## 1. Problem Statement

Reading content in foreign languages creates friction for users who need quick, contextual translations without leaving the page. Current solutions either:
- Require copying text to external apps (context switching)
- Offer clunky UI overlays that disrupt reading flow
- Lock users into expensive API subscriptions

## 2. Value Proposition

A lightweight Chrome extension that provides instant, inline translation with minimal UI friction — select text, right-click, see translation immediately.

## 3. Target Users

| Segment | Pain Point | Priority |
|---------|-----------|----------|
| Non-native English readers | Frequent vocab lookup while reading articles | High |
| Developers reading docs | Technical terms in foreign documentation | High |
| Researchers | Academic papers in multiple languages | Medium |
| Language learners | Quick reference while browsing | Medium |

## 4. MVP Scope

### In Scope (v1.0)
- [ ] Select text → right-click context menu → "Translate"
- [ ] Tooltip popup displaying translation near selection
- [ ] Settings page for configuring target language
- [ ] Pluggable translation provider (Google Translate API initially)
- [ ] Translation history (local storage, last 50 items)

### Out of Scope (Future)
- AI context-aware translation (LLM-powered)
- Custom glossary/terminology management
- Offline translation model
- Full-page translation mode
- Keyboard shortcuts

## 5. Success Metrics

| Metric | Target (v1.0) |
|--------|---------------|
| Translation latency | < 500ms |
| Extension size | < 500KB |
| User rating | 4.0+ stars |

## 6. Constraints & Risks

| Risk | Mitigation |
|------|------------|
| API rate limits | Implement caching for repeated translations |
| API costs | Support multiple providers, allow user's own API key |
| Manifest V3 limitations | Design with service worker constraints in mind |
| Privacy concerns | No server-side logging, all history stored locally |

## 7. Competitive Landscape

| Extension | Strength | Weakness |
|-----------|----------|----------|
| Google Translate | Free, reliable | Heavy UI, requires popup |
| DeepL | High quality | Paid, limited free tier |
| ImTranslator | Feature-rich | Bloated, slow |

**Our differentiator:** Lightweight, fast, privacy-focused, provider-agnostic.
