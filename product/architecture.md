# Phase 3 — Architecture

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Chrome Browser                            │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │ Content      │    │ Background   │    │ Popup UI         │   │
│  │ Script       │◄──►│ Service      │◄──►│ (React)          │   │
│  │              │    │ Worker       │    │                  │   │
│  └──────┬───────┘    └──────┬───────┘    └──────────────────┘   │
│         │                   │                                    │
│         ▼                   ▼                                    │
│  ┌──────────────┐    ┌──────────────┐                           │
│  │ Tooltip UI   │    │ Storage      │                           │
│  │ (injected)   │    │ (local/sync) │                           │
│  └──────────────┘    └──────────────┘                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ Translation APIs │
                    │ Google/DeepL/... │
                    └──────────────────┘
```

## 2. Chrome Extension Components (Manifest V3)

| Component | File | Responsibility |
|-----------|------|----------------|
| Background Service Worker | `background/index.ts` | API calls, caching, message routing |
| Content Script | `content/index.ts` | Text selection, tooltip injection, context menu |
| Popup | `popup/App.tsx` | Settings UI, manual translation, history view |
| Options Page | `options/App.tsx` | Advanced settings (optional) |

### Manifest Structure

```json
{
  "manifest_version": 3,
  "name": "Quick Translator",
  "version": "1.0.0",
  "permissions": ["contextMenus", "storage", "activeTab"],
  "host_permissions": ["https://translation.googleapis.com/*"],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content.js"],
    "css": ["content.css"]
  }],
  "action": {
    "default_popup": "popup.html"
  }
}
```

## 3. Data Flow

### Translation Flow

```
1. User selects text on webpage
2. User right-clicks → "Translate to [lang]"
         │
         ▼
3. Content Script captures selection
   └─► Sends message to Background
         │
         ▼
4. Background Service Worker
   ├─► Check cache → if hit, return cached
   └─► If miss:
       ├─► Call Translation Provider
       ├─► Cache response
       └─► Store in history
         │
         ▼
5. Content Script receives response
   └─► Renders tooltip near selection
```

### Settings Flow

```
Popup UI ──► chrome.storage.sync.set() ──► Synced across devices
                      │
                      ▼
         Background listens to storage.onChanged
                      │
                      ▼
         Updates provider configuration
```

## 4. Provider Strategy Pattern

### Interface

```typescript
interface TranslatorProvider {
  readonly name: ProviderType;
  readonly requiresApiKey: boolean;
  
  translate(request: TranslationRequest): Promise<TranslationResponse>;
  validateApiKey?(apiKey: string): Promise<boolean>;
  getSupportedLanguages(): Promise<LanguageCode[]>;
}
```

### Implementations

```typescript
class GoogleTranslateProvider implements TranslatorProvider {
  readonly name = "google";
  readonly requiresApiKey = true;

  async translate(req: TranslationRequest): Promise<TranslationResponse> {
    const url = `https://translation.googleapis.com/language/translate/v2`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: req.sourceText,
        source: req.sourceLang,
        target: req.targetLang,
        key: this.apiKey,
      }),
    });
    // ... handle response
  }
}

class LibreTranslateProvider implements TranslatorProvider {
  readonly name = "libre";
  readonly requiresApiKey = false;
  // Free, self-hostable option
}
```

### Factory

```typescript
const providers: Record<ProviderType, () => TranslatorProvider> = {
  google: () => new GoogleTranslateProvider(),
  deepl: () => new DeepLProvider(),
  openai: () => new OpenAIProvider(),
  libre: () => new LibreTranslateProvider(),
};

function createProvider(type: ProviderType, apiKey?: string): TranslatorProvider {
  const provider = providers[type]?.();
  if (!provider) {
    throw new Error(`Unknown provider: ${type}`);
  }
  if (provider.requiresApiKey && !apiKey) {
    throw new Error(`API key required for ${type}`);
  }
  return provider;
}
```

## 5. Caching Strategy

```typescript
class TranslationCache {
  private readonly TTL = 24 * 60 * 60 * 1000; // 24 hours
  private readonly MAX_ENTRIES = 500;

  private generateKey(text: string, targetLang: string): string {
    return `${targetLang}:${hashCode(text)}`;
  }

  async get(text: string, targetLang: string): Promise<TranslationResponse | null> {
    const key = this.generateKey(text, targetLang);
    const { cache } = await chrome.storage.local.get("cache");
    const entry = cache?.[key];
    
    if (entry && entry.expiresAt > Date.now()) {
      return { ...entry.response, cached: true };
    }
    return null;
  }

  async set(text: string, targetLang: string, response: TranslationResponse): Promise<void> {
    // LRU eviction if MAX_ENTRIES exceeded
  }
}
```

## 6. Security Considerations

| Concern | Mitigation |
|---------|------------|
| API key exposure | Store in `chrome.storage.local` (encrypted by Chrome) |
| XSS in tooltip | Sanitize all translated text before rendering |
| CSP violations | Inject styles/scripts properly via content script |
| Data privacy | No external logging; all history is local-only |

## 7. File Structure

```
extension/
├── src/
│   ├── background/
│   │   ├── index.ts           # Service worker entry
│   │   ├── messageHandler.ts  # Message routing
│   │   └── cache.ts           # Caching logic
│   ├── content/
│   │   ├── index.ts           # Content script entry
│   │   ├── selectionHandler.ts
│   │   └── tooltip/
│   │       ├── Tooltip.tsx
│   │       └── tooltip.css
│   ├── popup/
│   │   ├── App.tsx
│   │   ├── components/
│   │   └── popup.css
│   ├── providers/
│   │   ├── index.ts           # Factory
│   │   ├── google.ts
│   │   ├── deepl.ts
│   │   └── types.ts
│   ├── shared/
│   │   ├── types.ts           # Domain models
│   │   ├── storage.ts         # Storage helpers
│   │   └── constants.ts
│   └── utils/
│       └── hash.ts
├── public/
│   ├── manifest.json
│   └── icons/
└── vite.config.ts
```

## 8. Build & Tooling

| Tool | Purpose |
|------|---------|
| Vite | Bundling with HMR for popup dev |
| TypeScript | Type safety |
| React | Popup UI |
| CRXJS | Vite plugin for Chrome extension |
| Vitest | Unit testing |
