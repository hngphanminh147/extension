import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import type { SentenceTranslation } from '../../shared/types';

interface Props {
  result: SentenceTranslation;
}

export default function SentenceResult({ result }: Readonly<Props>) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(result.translatedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="qt-sentence">
      <div className="qt-sentence__header">
        <p className="qt-sentence__translated">{result.translatedText}</p>
        <button className="qt-copy-btn" onClick={copy} aria-label={copied ? 'Copied' : 'Copy translation'}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
      <p className="qt-sentence__source">{result.sourceText}</p>
    </div>
  );
}
