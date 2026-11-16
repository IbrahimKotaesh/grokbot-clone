import { useCallback, useEffect, useRef, useState } from 'react';

type Result = { isFinal: boolean; [index: number]: { transcript: string } };
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<Result> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};

// The browser/device handles speech. No audio is recorded or uploaded by Fino.
export function useDictation(onText: (text: string) => void, onError: (message: string) => void, language?: string) {
  const [state, setState] = useState<'idle' | 'recording'>('idle');
  const [interim, setInterim] = useState('');
  const active = useRef<Recognition | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const callbacks = useRef({ onText, onError, language });
  callbacks.current = { onText, onError, language };
  const cancel = useCallback(() => {
    clearTimeout(timer.current);
    const r = active.current; active.current = null;
    if (r) { r.onresult = null; r.onerror = null; r.onend = null; r.abort(); }
    setState('idle'); setInterim('');
  }, []);
  const toggle = useCallback(() => {
    if (active.current) { active.current.stop(); return; }
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Constructor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Constructor) { callbacks.current.onError('Use the microphone on your phone’s keyboard to dictate into this message.'); return; }
    const r = new Constructor(); active.current = r;
    r.lang = (callbacks.current.language === 'auto' ? '' : callbacks.current.language) || navigator.language || 'en-US';
    r.continuous = true; r.interimResults = true;
    r.onresult = e => {
      if (active.current !== r) return;
      let preview = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) callbacks.current.onText(result[0].transcript);
        else preview += result[0].transcript;
      }
      setInterim(preview);
    };
    r.onerror = e => {
      if (active.current !== r || e.error === 'aborted') return;
      callbacks.current.onError(e.error === 'not-allowed' ? 'Allow microphone access in your browser, or use your keyboard’s microphone.' : 'Device dictation stopped. Try again or use your keyboard’s microphone.');
    };
    r.onend = () => { if (active.current === r) { active.current = null; clearTimeout(timer.current); setState('idle'); setInterim(''); } };
    try { r.start(); setState('recording'); timer.current = setTimeout(() => r.stop(), 120_000); }
    catch { cancel(); callbacks.current.onError('Could not start device dictation. Use your keyboard’s microphone.'); }
  }, [cancel]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') cancel(); };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); cancel(); };
  }, [cancel]);
  return { state, interim, toggle, cancel };
}
