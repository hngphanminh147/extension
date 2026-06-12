// Response format documented in .docs/google-api-spec.md
// Indices follow that spec's top-level layout table; positions may drift by region/client.
import type {
  SuggestResult,
  TranslateResult,
  TranslationGroup,
  TranslationGloss,
  DefinitionGroup,
  DefinitionItem,
  ExampleItem,
  SynonymGroup,
  SynonymCluster,
  SenseBlock,
} from './types';

/** Returns `true` if `text` contains no whitespace (i.e. is a single token). */
export function isSingleWord(text: string): boolean {
  return /^\S+$/.test(text.trim());
}

/** Removes all HTML tags from `html`, returning plain text. */
function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '');
}

/** Casts an unknown value to a string array, filtering out non-string elements. */
function asStrings(x: unknown): string[] {
  return Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * Flattens a nested label structure into a plain string array.
 *
 * The raw shape is `[[label, ...], ...]` — an outer array of sub-arrays where each
 * sub-array may itself contain strings. Non-string elements are silently dropped.
 */
function extractLabels(raw: unknown): string[] {
  const groups = Array.isArray(raw) ? (raw as unknown[][]) : [];
  return groups
    .flatMap((lg): unknown[] => (Array.isArray(lg) ? lg : []))
    .filter((l): l is string => typeof l === 'string');
}

/**
 * Parses a Google Suggest API response into a {@link SuggestResult}.
 *
 * @param raw - Raw response array where `raw[0]` is the echoed prefix and
 *              `raw[1]` is the list of suggestion strings.
 */
export function parseSuggestResponse(raw: unknown[]): SuggestResult {
  return {
    prefix: typeof raw[0] === 'string' ? raw[0] : '',
    suggestions: asStrings(raw[1]),
  };
}

/**
 * Shape of the Google Translate response (see `.docs/google-api-spec.md`).
 *
 * - `A` — full lexical-rich: `data[1]`=array, `data[11]`=synonyms(?), `data[12]`=defs, `data[13]`=examples
 * - `B` — compact + definitions: `data[1]`=null, `data[11]`=null, `data[12]`=defs, `data[13]`=optional
 * - `C` — candidate-only: `data[1]`=null, `data[12]`=absent
 *
 * **Important:** the variant is a family hint, not a slot guarantee. Any individual index can
 * still be null/absent within its family. Always guard with `Array.isArray()` before access.
 */
type ResponseVariant = 'A' | 'B' | 'C';

/** Infers the {@link ResponseVariant} from the top-level response array. */
function detectVariant(data: unknown[][]): ResponseVariant {
  if (Array.isArray(data[1])) return 'A';
  if (Array.isArray(data[12])) return 'B';
  return 'C';
}

/**
 * Parses `data[1]` (dt=bd) into per-POS translation groups — Variant A only.
 *
 * Raw format: `[[pos, targetGlosses[], glossToSynonyms[], headword, rank], ...]`
 *
 * Prefers `posGroup[2]` (`[[targetWord, [srcWord, ...]], ...]`) for richer back-translation
 * data; falls back to the flat `posGroup[1]` word list when `posGroup[2]` is absent.
 *
 * @param rawBlock - The `data[1]` array from the translate response.
 */
function parseTranslations(rawBlock: unknown[][]): TranslationGroup[] {
  return rawBlock.map((posGroup) => {
    const pos = typeof posGroup[0] === 'string' ? posGroup[0] : '';
    const glossMap = Array.isArray(posGroup[2]) ? (posGroup[2] as unknown[][]) : [];
    const glosses: TranslationGloss[] = glossMap.length > 0
      ? glossMap.map((entry) => ({
          targetWord: typeof entry[0] === 'string' ? entry[0] : '',
          backTranslations: asStrings(entry[1]),
        }))
      : asStrings(posGroup[1]).map((w) => ({ targetWord: w, backTranslations: [] }));
    return { pos, glosses };
  });
}

/**
 * Parses `data[12]` (dt=md) into per-POS definition groups — Variants A and B.
 *
 * Raw format: `[[pos, [[definition, senseId, example_or_null, labels?], ...], headword, rank], ...]`
 *
 * Also builds a `senseId → definition text` lookup map as a side-effect; the map is
 * returned alongside the groups so {@link parseSynonyms} can resolve sense headings.
 *
 * @param rawBlock - The `data[12]` array from the translate response.
 * @returns Parsed definition groups and the senseId lookup map.
 */
function parseDefinitions(
  rawBlock: unknown[][],
): { groups: DefinitionGroup[]; lookup: Map<string, string> } {
  const lookup = new Map<string, string>();
  const groups = rawBlock.map((posGroup) => {
    const pos = typeof posGroup[0] === 'string' ? posGroup[0] : '';
    const rawItems = Array.isArray(posGroup[1]) ? (posGroup[1] as unknown[][]) : [];
    const items: DefinitionItem[] = rawItems.map((item) => {
      const text    = typeof item[0] === 'string' ? item[0] : '';
      const senseId = typeof item[1] === 'string' ? item[1] : null;
      if (senseId && text && !lookup.has(senseId)) lookup.set(senseId, text);
      return {
        senseId,                                                          // preserved for cross-tab linking
        text,
        example: typeof item[2] === 'string' ? stripTags(item[2]) : null,
        labels: extractLabels(item[3]),
      };
    });
    return { pos, items };
  });
  return { groups, lookup };
}

/**
 * Parses `data[11]` (dt=ss) into per-POS synonym groups — typically Variant A, but guarded
 * individually (can be null even when `data[1]` is present, e.g. for "trans").
 *
 * Raw format: `[[pos, [[words[], senseId, labels?], ...], headword, rank], ...]`
 *
 * Clusters are grouped by `senseId`, which foreign-keys to a definition in `data[12]`.
 * Within each sense, unlabeled clusters sort before labeled register variants.
 *
 * @param rawBlock  - The `data[11]` array from the translate response.
 * @param defLookup - The senseId → definition text map produced by {@link parseDefinitions}.
 */
function parseSynonyms(rawBlock: unknown[][], defLookup: Map<string, string>): SynonymGroup[] {
  return rawBlock.map((posGroup) => {
    const pos = typeof posGroup[0] === 'string' ? posGroup[0] : '';
    const clusterRows = Array.isArray(posGroup[1]) ? (posGroup[1] as unknown[][]) : [];

    const senseOrder: string[] = [];
    const senseClusters = new Map<string, SynonymCluster[]>();

    for (const entry of clusterRows) {
      const words = asStrings(entry[0]);
      const senseId = typeof entry[1] === 'string' ? entry[1] : '__unknown__';
      const labelGroup = Array.isArray(entry[2]) ? (entry[2] as unknown[][]) : [];
      const label = Array.isArray(labelGroup[0]) && typeof labelGroup[0][0] === 'string'
        ? labelGroup[0][0]
        : undefined;

      if (!senseClusters.has(senseId)) {
        senseOrder.push(senseId);
        senseClusters.set(senseId, []);
      }
      senseClusters.get(senseId)!.push({ words, label });
    }

    const senses: SenseBlock[] = senseOrder.map((senseId) => {
      const clusters = senseClusters.get(senseId)!;
      clusters.sort((a, b) => (a.label ? 1 : 0) - (b.label ? 1 : 0));
      return { senseId, definition: defLookup.get(senseId), clusters };
    });

    return { pos, senses };
  });
}

/**
 * Parses `data[13]` (dt=ex) into a deduplicated list of {@link ExampleItem}s —
 * Variants A and B (guarded individually per updated spec).
 *
 * Raw format: `[[[html_string, null, null, null, null, senseId], ...]]`
 *
 * HTML tags are stripped and duplicate sentences are discarded.
 * The `senseId` at `row[5]` is preserved so the UI can group examples by meaning.
 *
 * @param rawBlock - The `data[13]` array from the translate response.
 */
function parseExamples(rawBlock: unknown[][]): ExampleItem[] {
  const rows = Array.isArray(rawBlock[0]) ? (rawBlock[0] as unknown[][]) : [];
  const seen = new Set<string>();
  const result: ExampleItem[] = [];
  for (const row of rows) {
    if (typeof row[0] === 'string') {
      const plain   = stripTags(row[0]);
      const senseId = typeof row[5] === 'string' ? row[5] : null;
      if (plain && !seen.has(plain)) {
        seen.add(plain);
        result.push({ text: plain, senseId });
      }
    }
  }
  return result;
}

/**
 * Parses a raw Google Translate API response into a structured {@link TranslateResult}.
 *
 * - When `isSingle` is `false` (multi-word / sentence input), returns a lean
 *   {@link SentenceTranslation} with only the headline translation.
 * - When `isSingle` is `true` (single-word input), detects the response variant and
 *   returns a full {@link WordTranslation} with translations, definitions, examples,
 *   and synonyms where available.
 *
 * @param raw        - The raw (untyped) response body from the Translate API.
 * @param sourceText - The original text that was translated.
 * @param isSingle   - Whether the input is a single word (enables lexical parsing).
 */
export function parseTranslateResponse(
  raw: unknown,
  sourceText: string,
  isSingle: boolean,
): TranslateResult {
  const data = raw as unknown[][];

  // data[0]: Primary translation rows (dt=t)
  // Each row: [translatedText, sourceText, null, null, rank, ...]
  // Phonetic row shape: [null, null, null, "phonetic"]
  const translationBlock = Array.isArray(data[0]) ? (data[0] as unknown[][]) : [];
  const mainTranslated = translationBlock
    .map((row) => (Array.isArray(row) && typeof row[0] === 'string' ? row[0] : ''))
    .join('');
  const phoneticRow = translationBlock.find(
    (row) => Array.isArray(row) && row[0] == null && typeof row[3] === 'string',
  );
  const phonetic = phoneticRow ? (phoneticRow[3] as string) : null;

  if (!isSingle) {
    return { mode: 'sentence', sourceText, translatedText: mainTranslated };
  }

  const variant = detectVariant(data);

  const translations = variant === 'A'
    ? parseTranslations(data[1] as unknown[][])
    : [];

  const { groups: definitions, lookup: defLookupMap } = variant !== 'C' && Array.isArray(data[12])
    ? parseDefinitions(data[12] as unknown[][])
    : { groups: [], lookup: new Map<string, string>() };

  const synonyms = Array.isArray(data[11])
    ? parseSynonyms(data[11] as unknown[][], defLookupMap)
    : [];

  const examples = variant !== 'C' && Array.isArray(data[13])
    ? parseExamples(data[13] as unknown[][])
    : [];

  return {
    mode: 'word',
    sourceText,
    translatedText: mainTranslated,
    phonetic,
    translations,
    definitions,
    examples,
    synonyms,
  };
}
