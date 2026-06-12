import { useState, useEffect, useRef, useCallback } from 'react';
import { Globe, ArrowRightLeft, AlertCircle, Scan } from 'lucide-react';
import { DEFAULT_CONFIG, LANGUAGES, OCR_LANGUAGES, type TranslateResult, type SuggestResult, type MessageResponse } from './shared/types';
import { MSG } from './shared/messages';
import SearchInput from './popup/components/SearchInput';
import SuggestionList from './popup/components/SuggestionList';
import WordCard from './popup/components/WordCard';
import SentenceResult from './popup/components/SentenceResult';
import './popup/popup.css';

type OutputState = 'idle' | 'loading' | 'success' | 'error';

function sendMsg<T>(type: string, text: string, extra?: Record<string, string>): Promise<MessageResponse<T>> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, text, ...extra }, (res: MessageResponse<T>) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message ?? 'Extension error' });
        return;
      }
      resolve(res);
    });
  });
}

function App() {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [result, setResult] = useState<TranslateResult | null>(null);
  const [outputState, setOutputState] = useState<OutputState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [sourceLang, setSourceLang] = useState(DEFAULT_CONFIG.sourceLang);
  const [targetLang, setTargetLang] = useState(DEFAULT_CONFIG.targetLang);
  const [ocrDebug, setOcrDebug] = useState(false);
  const [ocrLang, setOcrLang] = useState(DEFAULT_CONFIG.ocrLang);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSubmitRef = useRef<{ text: string; sl: string; tl: string } | null>(null);

  useEffect(() => {
    chrome.storage.local.get(
      {
        sourceLang: DEFAULT_CONFIG.sourceLang,
        targetLang: DEFAULT_CONFIG.targetLang,
        ocrLang: DEFAULT_CONFIG.ocrLang,
        ocrDebug: DEFAULT_CONFIG.ocrDebug,
      },
      (stored) => {
        setSourceLang(stored.sourceLang as string);
        setTargetLang(stored.targetLang as string);
        setOcrLang(stored.ocrLang as string);
        setOcrDebug(stored.ocrDebug as boolean);
      },
    );
  }, []);

  const handleOcrDebugToggle = (checked: boolean) => {
    setOcrDebug(checked);
    chrome.storage.local.set({ ocrDebug: checked });
  };

  const handleOcrLangChange = (lang: string) => {
    setOcrLang(lang);
    chrome.storage.local.set({ ocrLang: lang });
  };

  const handleCaptureText = () => {
    chrome.runtime.sendMessage({ type: MSG.START_OCR });
    window.close();
  };

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

  const translate = useCallback(async (text: string, sl = sourceLang, tl = targetLang) => {
    if (!text.trim()) {
      setResult(null);
      setOutputState('idle');
      return;
    }
    setOutputState('loading');
    setErrorMsg('');
    const res = await sendMsg<TranslateResult>(MSG.TRANSLATE, text, { sl, tl });
    if (res.ok && res.data) {
      setResult(res.data);
      setOutputState('success');
    } else {
      lastSubmitRef.current = null; // allow retry via Enter after an error
      setErrorMsg(res.error ?? 'Translation failed');
      setOutputState('error');
    }
  }, [sourceLang, targetLang]);

  const handleSubmit = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSuggestions([]);
    const trimmed = query.trim();
    const last = lastSubmitRef.current;
    if (last?.text === trimmed && last.sl === sourceLang && last.tl === targetLang) return;
    lastSubmitRef.current = { text: trimmed, sl: sourceLang, tl: targetLang };
    translate(query);
  }, [query, sourceLang, targetLang, translate]);

  const handleSelect = (suggestion: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQuery(suggestion);
    setSuggestions([]);
    translate(suggestion);
  };

  const handleRetry = () => translate(query);

  const handleSourceLang = (lang: string) => {
    if (lang === targetLang) {
      // Conflict: swap. If source was 'auto', fall back to a safe target instead.
      let newTarget = sourceLang;
      if (sourceLang === 'auto') {
        newTarget = lang === DEFAULT_CONFIG.sourceLang ? DEFAULT_CONFIG.targetLang : DEFAULT_CONFIG.sourceLang;
      }
      setSourceLang(lang);
      setTargetLang(newTarget);
      chrome.storage.local.set({ sourceLang: lang, targetLang: newTarget });
      if (result) translate(query, lang, newTarget);
    } else {
      setSourceLang(lang);
      chrome.storage.local.set({ sourceLang: lang });
      if (result) translate(query, lang, targetLang);
    }
  };

  const handleTargetLang = (lang: string) => {
    if (lang === sourceLang) {
      // Conflict: swap ('auto' is excluded from target options so sourceLang is always a real code here)
      setSourceLang(targetLang);
      setTargetLang(lang);
      chrome.storage.local.set({ sourceLang: targetLang, targetLang: lang });
      if (result) translate(query, targetLang, lang);
    } else {
      setTargetLang(lang);
      chrome.storage.local.set({ targetLang: lang });
      if (result) translate(query, sourceLang, lang);
    }
  };

  const handleSwap = () => {
    const newSource = targetLang;
    const newTarget = sourceLang;
    setSourceLang(newSource);
    setTargetLang(newTarget);
    chrome.storage.local.set({ sourceLang: newSource, targetLang: newTarget });
    if (result) translate(query, newSource, newTarget);
  };

  return (
    <div className="qt-popup">
      {/* Header */}
      <header className="qt-header">
        <div className="qt-header__icon">
          <Globe size={16} />
        </div>
        <h1 className="qt-header__title">Quick Translate</h1>
      </header>

      {/* Language pair */}
      <div className="qt-lang-pair">
        <select
          className="qt-lang-select"
          value={sourceLang}
          onChange={(e) => handleSourceLang(e.target.value)}
          aria-label="Source language"
        >
          {Object.entries(LANGUAGES).map(([code, name]) => (
            <option key={code} value={code}>{name}</option>
          ))}
        </select>
        <button
          className="qt-swap-btn"
          onClick={handleSwap}
          disabled={sourceLang === 'auto'}
          aria-label="Swap languages"
        >
          <ArrowRightLeft size={14} />
        </button>
        <select
          className="qt-lang-select"
          value={targetLang}
          onChange={(e) => handleTargetLang(e.target.value)}
          aria-label="Target language"
        >
          {Object.entries(LANGUAGES)
            .filter(([code]) => code !== 'auto')
            .map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
        </select>
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

      {/* OCR */}
      <div className="qt-ocr-section">
        <div className="qt-ocr-row">
          <select
            id="qt-ocr-lang"
            className="qt-lang-select"
            value={ocrLang}
            onChange={(e) => handleOcrLangChange(e.target.value)}
            aria-label="OCR language"
          >
            {Object.entries(OCR_LANGUAGES).map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </select>
          <button className="qt-ocr-btn" onClick={handleCaptureText}>
            <Scan size={14} />
            Scan
          </button>
        </div>
        <div className="qt-auto-row qt-ocr-debug-row">
          <label htmlFor="qt-ocr-debug" className="qt-auto-row__label">
            Show OCR Image
          </label>
          <input
            type="checkbox"
            id="qt-ocr-debug"
            role="switch"
            className="qt-switch"
            checked={ocrDebug}
            onChange={(e) => handleOcrDebugToggle(e.target.checked)}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
