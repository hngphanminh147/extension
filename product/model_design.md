# Phase 2 — Model Design

## 1. Core Domain Objects

### Translation Request/Response

```typescript
interface TranslationRequest {
  id: string;
  sourceText: string;
  sourceLang?: string;       // Auto-detect if not provided
  targetLang: string;
  provider: ProviderType;
  timestamp: number;
}

interface TranslationResponse {
  requestId: string;
  translatedText: string;
  detectedLang?: string;
  provider: ProviderType;
  cached: boolean;
}

type ProviderType = "google" | "deepl" | "openai" | "libre";
```

### Translation History

```typescript
interface TranslationHistoryItem {
  id: string;
  sourceText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  provider: ProviderType;
  timestamp: number;
  url?: string;              // Page where translation occurred
}

interface TranslationHistory {
  items: TranslationHistoryItem[];
  maxItems: number;          // Default: 50
}
```

## 2. Configuration Model

```typescript
interface UserSettings {
  defaultTargetLang: string;           // ISO 639-1 code (e.g., "en", "vi")
  defaultSourceLang: string | "auto";  // "auto" for auto-detect
  provider: ProviderType;
  apiKeys: Partial<Record<ProviderType, string>>;
  enableHistory: boolean;
  enableCache: boolean;
  tooltipPosition: "above" | "below" | "auto";
}

const DEFAULT_SETTINGS: UserSettings = {
  defaultTargetLang: "en",
  defaultSourceLang: "auto",
  provider: "google",
  apiKeys: {},
  enableHistory: true,
  enableCache: true,
  tooltipPosition: "auto",
};
```

## 3. UI State Models

### Tooltip State

```typescript
interface TooltipState {
  visible: boolean;
  loading: boolean;
  position: { x: number; y: number };
  translation: TranslationResponse | null;
  error: string | null;
}

type TooltipAction =
  | { type: "SHOW"; position: { x: number; y: number } }
  | { type: "HIDE" }
  | { type: "SET_LOADING" }
  | { type: "SET_RESULT"; translation: TranslationResponse }
  | { type: "SET_ERROR"; error: string };
```

### Popup State (Extension Popup)

```typescript
interface PopupState {
  settings: UserSettings;
  history: TranslationHistoryItem[];
  activeTab: "translate" | "history" | "settings";
}
```

## 4. Message Protocol (Content Script ↔ Background)

```typescript
type MessageType =
  | "TRANSLATE_REQUEST"
  | "TRANSLATE_RESPONSE"
  | "GET_SETTINGS"
  | "UPDATE_SETTINGS"
  | "CLEAR_HISTORY";

interface Message<T = unknown> {
  type: MessageType;
  payload: T;
}

// Example messages
type TranslateMessage = Message<TranslationRequest> & { type: "TRANSLATE_REQUEST" };
type TranslateResultMessage = Message<TranslationResponse> & { type: "TRANSLATE_RESPONSE" };
```

## 5. Storage Schema

```typescript
// chrome.storage.local
interface LocalStorage {
  history: TranslationHistoryItem[];
  cache: Record<string, CacheEntry>;  // Key: hash(sourceText + targetLang)
}

// chrome.storage.sync (synced across devices)
interface SyncStorage {
  settings: UserSettings;
}

interface CacheEntry {
  response: TranslationResponse;
  expiresAt: number;  // TTL: 24 hours
}
```

## 6. Validation Rules

| Field | Rule |
|-------|------|
| `sourceText` | 1-5000 characters |
| `targetLang` | Valid ISO 639-1 code |
| `apiKey` | Non-empty string when provider requires it |
| `history.items` | Max 50 items, FIFO eviction |
| `cache` | TTL 24 hours, max 500 entries |
