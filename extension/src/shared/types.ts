export interface ExtensionConfig {
  sourceLang: string;
  targetLang: string;
  uiLang: string;
  debounceMs: number;
  ocrLang: string;
}

export const DEFAULT_CONFIG: ExtensionConfig = {
  sourceLang: 'en',
  targetLang: 'vi',
  uiLang: 'en',
  debounceMs: 300,
  ocrLang: 'eng',
};

/** Tesseract language codes with bundled .traineddata files in public/lang-data/ */
export const OCR_LANGUAGES: Record<string, string> = {
  eng:     'English',
  chi_sim: 'Chinese (Simplified)',
};

/** Supported translation languages. "auto" is only valid as a source language. */
export const LANGUAGES: Record<string, string> = {
  auto: 'Auto-detect',
  en:   'English',
  vi:   'Vietnamese',
  zh:   'Chinese',
  ja:   'Japanese',
  ko:   'Korean',
  fr:   'French',
  de:   'German',
  es:   'Spanish',
  pt:   'Portuguese',
  ru:   'Russian',
  ar:   'Arabic',
  it:   'Italian',
  th:   'Thai',
  id:   'Indonesian',
  nl:   'Dutch',
  tr:   'Turkish',
  hi:   'Hindi',
};

export interface SuggestResult {
  prefix: string;
  suggestions: string[];
}

// --- Word translation sub-types (one per tab) ---

/** Tab 3 — Examples: a single corpus example sentence linked to a meaning sense (from dt=ex, data[13]) */
export interface ExampleItem {
  text: string;
  senseId: string | null;  // foreign key at row[5]; null when absent
}

/** Tab 1 — Translate: a single target-language gloss with the source-language back-translations that map to it (from data[1][i][2]) */
export interface TranslationGloss {
  targetWord: string;
  backTranslations: string[]; // source-language words that back-translate to this gloss
}

/** Tab 1 — Translate: target-language translations grouped by part of speech (from dt=bd, data[1]) */
export interface TranslationGroup {
  pos: string;
  glosses: TranslationGloss[];
}

/** Tab 2 — Definition: a single dictionary entry (from dt=md, data[12]) */
export interface DefinitionItem {
  senseId: string | null;  // foreign key linking to data[11] synonyms and data[13] examples
  text: string;
  example: string | null;  // inline example from data[12] itself (plain text)
  labels: string[];        // register / domain labels, e.g. "informal", "Music", "dated"
}

export interface DefinitionGroup {
  pos: string;
  items: DefinitionItem[];
}

/** Tab 4 — Synonyms: a cluster of English synonyms sharing the same meaning sense (from dt=ss, data[11]) */
export interface SynonymCluster {
  words: string[];
  label?: string;  // register label, e.g. "informal", "rare"
}

/**
 * One meaning-sense within a SynonymGroup: all synonym clusters that share the same
 * senseId (the foreign key linking data[11] clusters to their data[12] definition).
 */
export interface SenseBlock {
  senseId: string;
  definition?: string;        // short definition from data[12], used as section heading
  clusters: SynonymCluster[]; // sorted: unlabeled cluster first, labeled variants after
}

export interface SynonymGroup {
  pos: string;
  senses: SenseBlock[];  // grouped by senseId — was flat clusters[]
}

// --- Top-level translation result types ---

export interface WordTranslation {
  mode: 'word';
  sourceText: string;
  translatedText: string;   // main headline gloss (first usable string from data[0])
  phonetic: string | null;
  translations: TranslationGroup[];  // Tab 1 — from data[1]  (dt=bd)
  definitions: DefinitionGroup[];    // Tab 2 — from data[12] (dt=md)
  examples: ExampleItem[];           // Tab 3 — from data[13] (dt=ex), stripped HTML + senseId
  synonyms: SynonymGroup[];          // Tab 4 — from data[11] (dt=ss)
}

export interface SentenceTranslation {
  mode: 'sentence';
  sourceText: string;
  translatedText: string;
}

export type TranslateResult = WordTranslation | SentenceTranslation;

// --- Message protocol ---

export interface MessageRequest {
  type: string;
  text: string;
  sl?: string;
  tl?: string;
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
