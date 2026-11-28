import { t } from '../lib/i18n';
import { useEffect, useRef, useState } from 'react';
import { Mic, Square, X, LoaderCircle } from 'lucide-react';
import { startLiveDictation, type LiveDictation } from '../lib/live-dictation';

/**
 * Voice typing: words appear in the message box live while you speak (Soniox streaming), and the box stays
 * editable the whole time. `onStart` / `onLive` / `onDone` let the composer place the words; `onCancel` takes
 * them back out. Stops by itself after about three minutes.
 */
export function DictationButton({ onStart, onLive, onDone, onCancel, onError, onBusy, disabled }: {
  onStart: () => void; onLive: (text: string) => void; onDone: (text: string) => void; onCancel: () => void;
  onError: (message: string) => void; onBusy: (busy: boolean) => void; disabled: boolean;
}) {
  const [phase, setPhase] = useState<'idle' | 'permission' | 'live' | 'finishing'>('idle');
  const [seconds, setSeconds] = useState(0);
  const session = useRef<LiveDictation | null>(null);
  const mounted = useRef(true);
  const cb = useRef({ onStart, onLive, onDone, onCancel, onError, onBusy });
  cb.current = { onStart, onLive, onDone, onCancel, onError, onBusy };
  const idle = () => { session.current = null; if (mounted.current) { setPhase('idle'); cb.current.onBusy(false); } };

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; session.current?.cancel(); cb.current.onBusy(false); }; }, []);
  useEffect(() => {
    if (phase !== 'live') return;
    const began = Date.now(); setSeconds(0);
    const timer = setInterval(() => {
      const s = Math.floor((Date.now() - began) / 1000);
      setSeconds(s);
      if (s >= 170) void finish(); // the live key lasts three minutes
    }, 250);
    return () => clearInterval(timer);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    setPhase('permission'); cb.current.onBusy(true); cb.current.onStart();
    try {
      const s = await startLiveDictation((text) => { if (mounted.current && session.current) cb.current.onLive(text); });
      if (!mounted.current) { s.cancel(); return; }
      session.current = s;
      setPhase('live');
    } catch (e) {
      cb.current.onCancel(); cb.current.onError((e as Error).message); idle();
    }
  };
  const finish = async () => {
    const s = session.current; if (!s) return;
    setPhase('finishing');
    try { const text = await s.finish(); if (mounted.current) cb.current.onDone(text); }
    catch (e) { if (mounted.current) cb.current.onError((e as Error).message); }
    finally { idle(); }
  };
  const cancel = () => { session.current?.cancel(); cb.current.onCancel(); idle(); };

  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return <span className="dictation">
    <button type="button" className={`composer__btn${phase === 'live' ? ' is-recording' : ''}`} disabled={(disabled && phase === 'idle') || phase === 'permission' || phase === 'finishing'}
      aria-label={phase === 'live' ? t('Stop voice typing') : t('Voice typing')} title={phase === 'live' ? t('Stop voice typing') : t('Voice typing')}
      onClick={() => (phase === 'live' ? void finish() : void start())}>
      {phase === 'live' ? <Square size={16} /> : phase === 'finishing' ? <LoaderCircle size={18} className="dictation__spinner" /> : <Mic size={18} />}
    </button>
    {phase !== 'idle' && <span className="dictation__status" role="status">
      <span>{phase === 'permission' ? t('Allow microphone access…') : phase === 'finishing' ? t('Finishing…') : `${t('Listening')} · ${mmss}`}</span>
      {phase === 'live' && <button type="button" onClick={() => void finish()}>{t('Done')}</button>}
      <button type="button" onClick={cancel} aria-label={t('Cancel voice typing')}><X size={15} /></button>
    </span>}
  </span>;
}
