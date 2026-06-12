import { useState } from 'react';
import { Copy, Check, Volume2, VolumeX } from 'lucide-react';
import { speak, stopSpeaking, isSpeaking } from '../../shared/speech';
import type { SentenceTranslation } from '../../shared/types';

interface Props {
  result: SentenceTranslation;
  sourceLang: string;
}

export default function SentenceResult({ result, sourceLang }: Readonly<Props>) {
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(result.translatedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleSpeak = async () => {
    if (isSpeaking()) {
      stopSpeaking();
      setSpeaking(false);
    } else {
      setSpeaking(true);
      try {
        await speak(result.sourceText, sourceLang);
      } catch (err) {
        console.error('Speech error:', err);
      } finally {
        setSpeaking(false);
      }
    }
  };

  return (
    <div className="qt-sentence">
      <div className="qt-sentence__header">
        <p className="qt-sentence__translated">{result.translatedText}</p>
        <div className="qt-sentence__actions">
          <button
            className="qt-icon-btn"
            onClick={handleSpeak}
            aria-label={speaking ? 'Stop speaking' : 'Speak translation'}
          >
            {speaking ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
          <button className="qt-copy-btn" onClick={copy} aria-label={copied ? 'Copied' : 'Copy translation'}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
      </div>
      <p className="qt-sentence__source">{result.sourceText}</p>
    </div>
  );
}
