import { useCallback, useEffect, useRef, useState } from 'react';

type Result = { isFinal: boolean; [index: number]: { transcript: string } };
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((e: { resultIndex: number; results: ArrayLike<Result> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};

// The browser/device handles speech. No audio is recorded or uploaded by Fino.
export function useDictation(onText: (text: string) => void, onError: (message: string) => void, language?: string) {
  const [state, setState] = useState<'idle' | 'starting' | 'recording' | 'stopping'>('idle');
  const [interim, setInterim] = useState('');
  const active = useRef<Recognition | null>(null);
  const pending = useRef('');
  const started = useRef(false);
  const receivedAny = useRef(false);
  const timers = useRef<{start?:ReturnType<typeof setTimeout>;silence?:ReturnType<typeof setTimeout>;max?:ReturnType<typeof setTimeout>;stop?:ReturnType<typeof setTimeout>}>({});
  const callbacks = useRef({ onText, onError, language });
  callbacks.current = { onText, onError, language };
  const clearTimers = useCallback(() => {
    Object.values(timers.current).forEach(clearTimeout); timers.current = {};
  }, []);
  const cancel = useCallback(() => {
    clearTimers();
    const r = active.current; active.current = null; pending.current = ''; started.current = false;
    if (r) { r.onstart = null; r.onresult = null; r.onerror = null; r.onend = null; try { r.abort(); } catch { /* already ended */ } }
    setState('idle'); setInterim('');
  }, [clearTimers]);
  const toggle = useCallback(() => {
    const existing = active.current;
    if (existing) {
      if (!started.current) { cancel(); return; }
      setState('stopping');
      timers.current.stop = setTimeout(() => { if(active.current===existing) { if(pending.current.trim()) callbacks.current.onText(pending.current.trim()); cancel(); } },2000);
      try { existing.stop(); } catch { cancel(); }
      return;
    }
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Constructor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Constructor) { callbacks.current.onError('Use the microphone on your phone’s keyboard. For Arabic, switch the keyboard to Arabic first.'); return; }
    const r = new Constructor(); active.current = r; pending.current = ''; started.current = false; receivedAny.current = false;
    r.lang = (callbacks.current.language === 'auto' ? '' : callbacks.current.language) || navigator.language || 'en-US';
    r.continuous = true; r.interimResults = true;
    const silence = () => {
      clearTimeout(timers.current.silence);
      timers.current.silence = setTimeout(() => {
        if(active.current!==r)return;
        if(pending.current.trim()) callbacks.current.onText(pending.current.trim());
        else if(!receivedAny.current) callbacks.current.onError('No speech was detected. Check your microphone and choose AR for Arabic or EN for English.');
        cancel();
      },15000);
    };
    r.onstart = () => {
      if(active.current!==r)return;
      clearTimeout(timers.current.start); started.current = true; setState('recording'); silence();
      timers.current.max=setTimeout(()=>{if(active.current===r){try{r.stop();}catch{cancel();}}},120000);
    };
    r.onresult = e => {
      if (active.current !== r) return;
      if(!started.current) r.onstart?.();
      clearTimeout(timers.current.start); receivedAny.current = true;
      let preview = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) { const text=result[0].transcript.trim(); if(text) callbacks.current.onText(text); }
        else preview += result[0].transcript;
      }
      pending.current=preview; setInterim(preview); silence();
    };
    r.onerror = e => {
      if (active.current !== r) return;
      if(e.error!=='aborted') {
        const messages: Record<string,string> = {
          'not-allowed':'Allow microphone access, or use your phone keyboard’s Arabic microphone.',
          'language-not-supported':'This browser cannot recognize the selected language. Use your phone keyboard’s microphone instead.',
          'no-speech':'No speech was detected. Check your microphone and choose AR for Arabic or EN for English.',
          'audio-capture':'No working microphone was found. Check your device microphone.',
        };
        callbacks.current.onError(messages[e.error] || 'Device dictation could not connect. Try Safari or Chrome, or use your keyboard’s microphone.');
      }
      cancel();
    };
    r.onend = () => {
      if(active.current!==r)return;
      if(pending.current.trim()) callbacks.current.onText(pending.current.trim());
      active.current=null; pending.current='';started.current=false;clearTimers();setState('idle');setInterim('');
    };
    try {
      setState('starting');
      timers.current.start=setTimeout(()=>{if(active.current===r){callbacks.current.onError('The microphone did not start. Allow microphone access or use your keyboard’s microphone.');cancel();}},15000);
      r.start();
    } catch { cancel(); callbacks.current.onError('Could not start device dictation. Use your keyboard’s microphone.'); }
  }, [cancel,clearTimers]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') cancel(); };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); cancel(); };
  }, [cancel]);
  return { state, interim, toggle, cancel };
}
