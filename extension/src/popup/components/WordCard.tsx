import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import type { WordTranslation, TranslationGroup, DefinitionGroup, ExampleItem, SynonymGroup, SenseBlock } from '../../shared/types';

type TabId = 'translate' | 'definition' | 'examples' | 'synonyms';

interface TabDef {
  id: TabId;
  label: string;
  count: number;
}

interface Props {
  result: WordTranslation;
}

// --- Tab panel sub-components ---

function TranslateTab({ groups }: Readonly<{ groups: TranslationGroup[] }>) {
  if (groups.length === 0) {
    return <p className="qt-tab-empty">No translations available.</p>;
  }
  return (
    <>
      {groups.map((group) => (
        <div key={group.pos} className="qt-sense">
          <span className="qt-sense__pos">{group.pos}</span>
          <div className="qt-gloss-list">
            {group.glosses.map((gloss, i) => (
              <div key={i} className="qt-gloss-item">
                <span className="qt-gloss-item__target">{gloss.targetWord}</span>
                {gloss.backTranslations.length > 0 && (
                  <span className="qt-gloss-item__backs">
                    {gloss.backTranslations.join(' · ')}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function DefinitionTab({ groups, examples }: Readonly<{ groups: DefinitionGroup[]; examples: ExampleItem[] }>) {
  if (groups.length === 0) {
    return <p className="qt-tab-empty">No definitions available.</p>;
  }

  // Build senseId → corpus example texts map for inline display
  const corpusById = new Map<string, string[]>();
  for (const ex of examples) {
    if (ex.senseId) {
      if (!corpusById.has(ex.senseId)) corpusById.set(ex.senseId, []);
      corpusById.get(ex.senseId)!.push(ex.text);
    }
  }

  return (
    <>
      {groups.map((group) => (
        <div key={group.pos} className="qt-sense">
          <span className="qt-sense__pos">{group.pos}</span>
          {group.items.map((item, i) => {
            const corpusExamples = item.senseId ? (corpusById.get(item.senseId) ?? []).slice(0, 3) : [];
            return (
              <div key={i} className="qt-def-item">
                <p className="qt-def-item__text">{item.text}</p>
                {item.example && (
                  <p className="qt-def-item__ex">"{item.example}"</p>
                )}
                {item.labels.length > 0 && (
                  <div className="qt-def-item__labels">
                    {item.labels.map((label) => (
                      <span key={label} className="qt-def-label">{label}</span>
                    ))}
                  </div>
                )}
                {corpusExamples.length > 0 && (
                  <ul className="qt-def-corpus-examples">
                    {corpusExamples.map((text, j) => (
                      <li key={j} className="qt-def-corpus-ex">{text}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}

function ExamplesTab({ examples, definitions }: Readonly<{ examples: ExampleItem[]; definitions: DefinitionGroup[] }>) {
  if (examples.length === 0) {
    return <p className="qt-tab-empty">No examples available.</p>;
  }

  // Build senseId → definition text lookup
  const defById = new Map<string, string>();
  for (const g of definitions)
    for (const item of g.items)
      if (item.senseId && !defById.has(item.senseId))
        defById.set(item.senseId, item.text);

  // Group examples by senseId, preserving insertion order
  const groups: Array<{ senseId: string | null; texts: string[] }> = [];
  const seen = new Map<string | null, string[]>();
  for (const ex of examples) {
    const key = ex.senseId ?? null;
    if (!seen.has(key)) {
      const texts: string[] = [];
      seen.set(key, texts);
      groups.push({ senseId: key, texts });
    }
    seen.get(key)!.push(ex.text);
  }

  return (
    <>
      {groups.map((group, gi) => (
        <div key={gi} className="qt-syn-sense-block">
          {group.senseId && defById.has(group.senseId) && (
            <p className="qt-syn-sense">{defById.get(group.senseId)}</p>
          )}
          <ul className="qt-examples">
            {group.texts.map((text, i) => (
              <li key={i} className="qt-example-item">{text}</li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

function SynonymSenseBlock({ sense }: Readonly<{ sense: SenseBlock }>) {
  return (
    <div className="qt-syn-sense-block">
      {sense.definition && (
        <p className="qt-syn-sense">{sense.definition}</p>
      )}
      {sense.clusters.map((cluster, i) => (
        <div key={i} className="qt-syn-cluster">
          <div className="qt-chips">
            {cluster.label && (
              <span className="qt-syn-label">{cluster.label}</span>
            )}
            {cluster.words.map((word) => (
              <span key={word} className="qt-chip">{word}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SynonymsTab({ groups }: Readonly<{ groups: SynonymGroup[] }>) {
  if (groups.length === 0) {
    return <p className="qt-tab-empty">No synonyms available.</p>;
  }
  return (
    <>
      {groups.map((group) => (
        <div key={group.pos} className="qt-sense">
          <span className="qt-sense__pos">{group.pos}</span>
          {group.senses.map((sense) => (
            <SynonymSenseBlock key={sense.senseId} sense={sense} />
          ))}
        </div>
      ))}
    </>
  );
}

// --- Main WordCard ---

export default function WordCard({ result }: Readonly<Props>) {
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    if (result.translations.length > 0) return 'translate';
    if (result.definitions.length > 0) return 'definition';
    if (result.synonyms.length > 0) return 'synonyms';
    if (result.examples.length > 0) return 'examples';
    return 'translate';
  });
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(result.translatedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Count total items per tab for the badge
  const translateCount = result.translations.reduce((n, g) => n + g.glosses.length, 0);
  const definitionCount = result.definitions.reduce((n, g) => n + g.items.length, 0);
  const examplesCount = result.examples.length;
  const synonymsCount = result.synonyms.reduce(
    (n, g) => n + g.senses.reduce((m, s) => m + s.clusters.reduce((k, c) => k + c.words.length, 0), 0),
    0,
  );

  const tabs: TabDef[] = [
    { id: 'translate',  label: 'Translate',  count: translateCount },
    { id: 'definition', label: 'Definition', count: definitionCount },
    { id: 'examples',   label: 'Examples',   count: examplesCount },
    { id: 'synonyms',   label: 'Synonyms',   count: synonymsCount },
  ];

  return (
    <div className="qt-word-card">
      {/* Header: headline translation + phonetic + copy */}
      <div className="qt-word-card__header">
        <div className="qt-word-card__main">
          <span className="qt-word-card__translation">{result.translatedText}</span>
          {result.phonetic && (
            <span className="qt-word-card__phonetic">{result.phonetic}</span>
          )}
        </div>
        <button
          className="qt-copy-btn"
          onClick={copy}
          aria-label={copied ? 'Copied' : 'Copy translation'}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>

      {/* Tab strip */}
      <div className="qt-tabs" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`qt-tab${activeTab === tab.id ? ' qt-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="qt-tab__count">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab body */}
      <div className="qt-tab-body" role="tabpanel">
        {activeTab === 'translate'  && <TranslateTab  groups={result.translations} />}
        {activeTab === 'definition' && <DefinitionTab groups={result.definitions} examples={result.examples} />}
        {activeTab === 'examples'   && <ExamplesTab   examples={result.examples} definitions={result.definitions} />}
        {activeTab === 'synonyms'   && <SynonymsTab   groups={result.synonyms} />}
      </div>
    </div>
  );
}
