// Response format documented in .docs/request-response-formats.md
// Indices per .docs/ejoy-extension-api-spec.md §2; positions may drift across regions/clients
import type { SuggestResult, TranslateResult, WordSense } from './types';

export function isSingleWord(text: string): boolean {
  return /^\S+$/.test(text.trim());
}

export function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '');
}

export function parseSuggestResponse(raw: unknown[]): SuggestResult {
  const prefix = typeof raw[0] === 'string' ? raw[0] : '';
  const suggestions = Array.isArray(raw[1])
    ? (raw[1] as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];
  return { prefix, suggestions };
}

export function parseTranslateResponse(
  raw: unknown,
  sourceText: string,
  isSingle: boolean,
): TranslateResult {
  const data = raw as unknown[][];

  // [0] Translation rows — each row: [translatedText, sourceSnippet, null, null, n]
  // Second sub-array may contain phonetic at index [3]
  const translationBlock = Array.isArray(data[0]) ? (data[0] as unknown[][]) : [];
  const mainTranslated = translationBlock
    .map((row) => (Array.isArray(row) && typeof row[0] === 'string' ? row[0] : ''))
    .join('');
  const phoneticRow = translationBlock.find(
    (row) => Array.isArray(row) && row[0] == null && typeof row[3] === 'string',
  );
  const phonetic = phoneticRow ? (phoneticRow[3] as string) : null;

  if (!isSingle) {
    return {
      mode: 'sentence',
      sourceText,
      translatedText: mainTranslated,
    };
  }

  // [1] Dictionary POS blocks: [pos, [translations], [[translation, [synonyms]], ...], word, n]
  const dictBlock = Array.isArray(data[1]) ? (data[1] as unknown[][]) : [];

  // [10] Synonym clusters: [pos, [[[synonyms], id, [labels?]], ...], word, n]
  const synonymBlock = Array.isArray(data[10]) ? (data[10] as unknown[][]) : [];
  const allSynonyms = synonymBlock.flatMap((posGroup) => {
    const entries = Array.isArray(posGroup[1]) ? (posGroup[1] as unknown[][]) : [];
    return entries.flatMap((entry) => {
      const syns = Array.isArray(entry[0]) ? (entry[0] as unknown[]) : [];
      return syns.filter((s): s is string => typeof s === 'string');
    });
  });

  // [11] Definitions: [pos, [[definition, id, example, labels?], ...], word, n]
  const defBlock = Array.isArray(data[11]) ? (data[11] as unknown[][]) : [];
  // Build a map pos → definitions for merging into senses
  const defsByPos = new Map<string, Array<{ definition: string; example: string | null }>>();
  for (const posGroup of defBlock) {
    const pos = typeof posGroup[0] === 'string' ? posGroup[0] : '';
    const defs = Array.isArray(posGroup[1]) ? (posGroup[1] as unknown[][]) : [];
    defsByPos.set(
      pos,
      defs.map((d) => ({
        definition: typeof d[0] === 'string' ? d[0] : '',
        // index [2] = example, may contain HTML
        example: typeof d[2] === 'string' ? stripTags(d[2]) : null,
      })),
    );
  }

  const senses: WordSense[] = dictBlock.map((posGroup) => {
    const pos = typeof posGroup[0] === 'string' ? posGroup[0] : '';
    const translations = Array.isArray(posGroup[1])
      ? (posGroup[1] as unknown[]).filter((t): t is string => typeof t === 'string')
      : [];
    // [2] = [[translation, [collocates/synonyms]], ...] — extract collocate synonyms per sense
    const collocateRows = Array.isArray(posGroup[2]) ? (posGroup[2] as unknown[][]) : [];
    const senseSynonyms = collocateRows.flatMap((row) => {
      const syns = Array.isArray(row[1]) ? (row[1] as unknown[]) : [];
      return syns.filter((s): s is string => typeof s === 'string');
    });
    return {
      pos,
      translations,
      definitions: defsByPos.get(pos) ?? [],
      synonyms: senseSynonyms,
    };
  });

  return {
    mode: 'word',
    sourceText,
    translatedText: mainTranslated,
    phonetic,
    senses,
    synonyms: allSynonyms,
    collocations: [],
    slangNotes: [],
  };
}
