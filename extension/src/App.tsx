import { useState, useEffect, useRef, useCallback } from 'react';
import { Globe, ArrowRightLeft, AlertCircle } from 'lucide-react';
import { DEFAULT_CONFIG, type TranslateResult, type SuggestResult, type MessageResponse } from './shared/types';
import { MSG } from './shared/messages';
import SearchInput from './popup/components/SearchInput';
import SuggestionList from './popup/components/SuggestionList';
import WordCard from './popup/components/WordCard';
import SentenceResult from './popup/components/SentenceResult';
import './popup/popup.css';

type OutputState = 'idle' | 'loading' | 'success' | 'error';

function sendMsg<T>(type: string, text: string): Promise<MessageResponse<T>> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, text }, (res: MessageResponse<T>) => resolve(res));
  });
}

function App() {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [result, setResult] = useState<TranslateResult | null>(null);
  const [outputState, setOutputState] = useState<OutputState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce only fetches suggestions — translation is explicit (Enter / search icon)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const res = await sendMsg<SuggestResult>(MSG.SUGGEST, query);
      if (res.ok && res.data) setSuggestions(res.data.suggestions);
    }, DEFAULT_CONFIG.debounceMs);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const translate = useCallback(async (text: string) => {
    if (!text.trim()) {
      setResult(null);
      setOutputState('idle');
      return;
    }
    setOutputState('loading');
    setErrorMsg('');
    const res = await sendMsg<TranslateResult>(MSG.TRANSLATE, text);
    if (res.ok && res.data) {
      setResult(res.data);
      setOutputState('success');
    } else {
      setErrorMsg(res.error ?? 'Translation failed');
      setOutputState('error');
    }
  }, []);

  const handleSubmit = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSuggestions([]);
    translate(query);
  }, [query, translate]);

  const handleSelect = (suggestion: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQuery(suggestion);
    setSuggestions([]);
    translate(suggestion);
  };

  const handleRetry = () => translate(query);

  return (
    <div className="qt-popup">
      {/* Header */}
      <header className="qt-header">
        <div className="qt-header__icon">
          <Globe size={16} />
        </div>
        <h1 className="qt-header__title">Quick Translate</h1>
      </header>

      {/* Language pair — static stub, selection coming in a future release */}
      <div className="qt-lang-pair" title="Language selection — coming soon">
        <button className="qt-lang-btn" disabled>{DEFAULT_CONFIG.sourceLang.toUpperCase()}</button>
        <button className="qt-swap-btn" disabled aria-label="Swap languages">
          <ArrowRightLeft size={14} />
        </button>
        <button className="qt-lang-btn" disabled>{DEFAULT_CONFIG.targetLang.toUpperCase()}</button>
      </div>

      {/* Input */}
      <div className="qt-input-wrap">
        <SearchInput
          value={query}
          onChange={setQuery}
          onSubmit={handleSubmit}
          onDismissSuggestions={() => setSuggestions([])}
        />
        {suggestions.length > 0 && (
          <SuggestionList suggestions={suggestions} onSelect={handleSelect} />
        )}
      </div>

      {/* Output */}
      <div className={`qt-output qt-output--${outputState}`}>
        {outputState === 'idle' && (
          <p className="qt-output__placeholder">Press Enter or ↵ to translate…</p>
        )}
        {outputState === 'loading' && (
          <div className="qt-spinner-wrap">
            <div className="qt-spinner" />
            <span>Translating…</span>
          </div>
        )}
        {outputState === 'error' && (
          <div className="qt-error-wrap">
            <AlertCircle size={18} />
            <p>{errorMsg}</p>
            <button className="qt-retry-btn" onClick={handleRetry}>Try again</button>
          </div>
        )}
        {outputState === 'success' && result?.mode === 'word' && <WordCard key={result.sourceText} result={result} />}
        {outputState === 'success' && result?.mode === 'sentence' && <SentenceResult result={result} />}
      </div>

      {/* Auto-translate toggle — placeholder, wired in Step 3 (content script tooltip) */}
      <div className="qt-auto-row">
        <label htmlFor="qt-auto" className="qt-auto-row__label">
          Auto-translate selected text
        </label>
        <input
          type="checkbox"
          id="qt-auto"
          role="switch"
          className="qt-switch"
          disabled
          title="Coming soon — requires content script (Step 3)"
        />
      </div>
    </div>
  );
}

export default App;
