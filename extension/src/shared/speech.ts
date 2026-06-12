/**
 * Text-to-Speech adapter using Web Speech API
 * Provides cross-browser speech synthesis for translated text
 */

interface SpeechState {
  isSpeaking: boolean;
  currentUtterance: SpeechSynthesisUtterance | null;
}

const state: SpeechState = {
  isSpeaking: false,
  currentUtterance: null,
};

/**
 * Map translation language codes to Web Speech API language codes
 * Some languages need region codes for best voice selection
 */
const LANG_CODE_MAP: Record<string, string> = {
  en: 'en-US',
  vi: 'vi-VN',
  zh: 'zh-CN',
  ja: 'ja-JP',
  ko: 'ko-KR',
  fr: 'fr-FR',
  de: 'de-DE',
  es: 'es-ES',
  pt: 'pt-PT',
  ru: 'ru-RU',
  ar: 'ar-SA',
  it: 'it-IT',
  th: 'th-TH',
  id: 'id-ID',
  nl: 'nl-NL',
  tr: 'tr-TR',
  hi: 'hi-IN',
};

/**
 * Find the best available voice for the given language
 * Prefers native voices over network voices when available
 */
function selectVoice(lang: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;

  const speechLang = LANG_CODE_MAP[lang] || lang;
  
  // Try exact match first (e.g., "en-US")
  let voice = voices.find(v => v.lang === speechLang && v.localService);
  if (voice) return voice;
  
  // Try exact match with network voice
  voice = voices.find(v => v.lang === speechLang);
  if (voice) return voice;
  
  // Try language prefix match (e.g., "en-US" matches "en")
  const langPrefix = speechLang.split('-')[0];
  voice = voices.find(v => v.lang.startsWith(langPrefix) && v.localService);
  if (voice) return voice;
  
  // Fallback: any voice matching language prefix
  voice = voices.find(v => v.lang.startsWith(langPrefix));
  if (voice) return voice;
  
  return null;
}

/**
 * Speak the given text in the specified language
 * @param text - The text to speak
 * @param lang - Language code (e.g., 'en', 'vi', 'zh')
 * @returns Promise that resolves when speech completes or rejects on error
 */
export function speak(text: string, lang: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!window.speechSynthesis) {
      reject(new Error('Speech synthesis not supported in this browser'));
      return;
    }

    // Stop any ongoing speech
    stopSpeaking();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = LANG_CODE_MAP[lang] || lang;
    
    // Try to select best voice
    const voice = selectVoice(lang);
    if (voice) {
      utterance.voice = voice;
    }
    
    // Configure speech parameters
    utterance.rate = 0.9;   // Slightly slower for clarity
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    utterance.onstart = () => {
      state.isSpeaking = true;
      state.currentUtterance = utterance;
    };

    utterance.onend = () => {
      state.isSpeaking = false;
      state.currentUtterance = null;
      resolve();
    };

    utterance.onerror = (event) => {
      state.isSpeaking = false;
      state.currentUtterance = null;
      
      // Ignore 'interrupted' and 'canceled' errors (user stopped it)
      if (event.error === 'interrupted' || event.error === 'canceled') {
        resolve();
      } else {
        reject(new Error(`Speech error: ${event.error}`));
      }
    };

    window.speechSynthesis.speak(utterance);
  });
}

/**
 * Stop any currently playing speech
 */
export function stopSpeaking(): void {
  if (window.speechSynthesis && state.isSpeaking) {
    window.speechSynthesis.cancel();
    state.isSpeaking = false;
    state.currentUtterance = null;
  }
}

/**
 * Check if speech is currently playing
 */
export function isSpeaking(): boolean {
  return state.isSpeaking;
}

/**
 * Get list of supported languages (those with available voices)
 */
export function getSupportedLanguages(): string[] {
  if (!window.speechSynthesis) return [];
  
  const voices = window.speechSynthesis.getVoices();
  const supportedLangs = new Set<string>();
  
  voices.forEach(voice => {
    const langPrefix = voice.lang.split('-')[0];
    supportedLangs.add(langPrefix);
  });
  
  return Array.from(supportedLangs);
}

// Ensure voices are loaded (some browsers load them asynchronously)
if (window.speechSynthesis) {
  // Trigger voice loading
  window.speechSynthesis.getVoices();
  
  // Listen for voice list changes (Chrome/Edge need this)
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = () => {
      // Voices are now loaded
    };
  }
}
