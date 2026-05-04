export interface ExtensionConfig {
  sourceLang: string;
  targetLang: string;
  uiLang: string;
  debounceMs: number;
}

export const DEFAULT_CONFIG: ExtensionConfig = {
  sourceLang: 'en',
  targetLang: 'vi',
  uiLang: 'en',
  debounceMs: 300,
};

export interface SuggestResult {
  prefix: string;
  suggestions: string[];
}

export interface WordSense {
  pos: string;
  translations: string[];
  definitions: Array<{ definition: string; example: string | null }>;
  synonyms: string[];
}

export interface WordTranslation {
  mode: 'word';
  sourceText: string;
  translatedText: string;
  phonetic: string | null;
  senses: WordSense[];
  synonyms: string[];
  collocations: string[];
  slangNotes: string[];
}

export interface SentenceTranslation {
  mode: 'sentence';
  sourceText: string;
  translatedText: string;
}

export type TranslateResult = WordTranslation | SentenceTranslation;

export interface MessageRequest {
  type: string;
  text: string;
}

export interface ContentMessage {
  type: string;
  text: string;
}

export interface MessageResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}
