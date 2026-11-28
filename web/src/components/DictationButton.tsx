import { useCallback, useEffect, useRef, useState } from 'react';
import { startLiveDictation, type LiveDictation } from '../lib/live-dictation';

/**
 * Voice typing, as in the iPhone app: words appear in the message box live while you speak (Soniox streaming), the
 * box stays editable, and the composer shows a recording row with a live waveform. `onStart` / `onLive` / `onDone`
 * let the composer place the words; `onCancel` takes them back out. Stops by itself after about three minutes.
 */
export function useDictation(cb: { onStart: () => void; onLive: (text: string) => void; onDone: (text: string) => void; onCancel: () => void; onError: (message: string) => void }) {
  const [phase, setPhase] = useState<'idle' | 'permission' | 'live' | 'finishing'>('idle');
  const [seconds, setSeconds] = useState(0);
  const session = useRef<LiveDictation | null>(null);
  const mounted = useRef(true);
  const cbs = useRef(cb); cbs.current = cb;
  const idle = () => { session.current = null; if (mounted.current) setPhase('idle'); };
  // Stable, so the waveform keeps drawing across re-renders (the timer re-renders four times a second).
  const level = useCallback(() => session.current?.level() ?? 0, []);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; session.current?.cancel(); }; }, []);
  const finish = async () => {
    const s = session.current; if (!s) return;
    setPhase('finishing');
    try { const text = await s.finish(); if (mounted.current) cbs.current.onDone(text); }
    catch (e) { if (mounted.current) cbs.current.onError((e as Error).message); }
    finally { idle(); }
  };
  useEffect(() => {
    if (phase !== 'live') return;
    const began = Date.now(); setSeconds(0);
    const timer = setInterval(() => { const s = Math.floor((Date.now() - began) / 1000); setSeconds(s); if (s >= 170) void finish(); }, 250);
    return () => clearInterval(timer);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    phase, seconds,
    busy: phase !== 'idle',
    level,
    async start() {
      if (phase !== 'idle') return;
      setPhase('permission'); cbs.current.onStart();
      try {
        const s = await startLiveDictation((text) => { if (mounted.current && session.current) cbs.current.onLive(text); });
        if (!mounted.current) { s.cancel(); return; }
        session.current = s; setPhase('live');
      } catch (e) { cbs.current.onCancel(); cbs.current.onError((e as Error).message); idle(); }
    },
    finish,
    cancel() { session.current?.cancel(); cbs.current.onCancel(); idle(); },
  };
}

/**
 * The live waveform from the iPhone app: rounded bars that scroll in from the right, one every 60 ms. Newer bars
 * are brighter, quiet moments rest on a soft baseline, and loudness is scaled to the speaker's own range (a slowly
 * rising floor and a slowly falling peak), so speech always shows clearly. Drawn on a canvas, so it stays smooth.
 */
const TICK = 60, BAR = 3, STEP = 6;
export function Waveform({ level, running }: { level: () => number; running: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current; if (!el) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let floor = -50, peak = -20, last = performance.now(), raf = 0;
    const bars: { target: number; h: number }[] = [];
    const scale = (amp: number) => {
      const db = 20 * Math.log10(Math.max(amp, 1e-5));
      floor = db < floor ? db : floor + 0.015 * (db - floor);
      peak = db > peak ? db : peak - 0.12;
      if (peak < floor + 15) peak = floor + 15;
      const x = Math.max(0, Math.min(1, (db - floor - 3) / (peak - floor - 3)));
      return x ** 1.3;
    };
    let prev = 0;
    const draw = (now: number) => {
      const dpr = window.devicePixelRatio || 1;
      const w = el.clientWidth, hgt = el.clientHeight;
      if (el.width !== Math.round(w * dpr) || el.height !== Math.round(hgt * dpr)) { el.width = Math.round(w * dpr); el.height = Math.round(hgt * dpr); }
      const n = Math.ceil(w / STEP) + 2;
      while (running && now - last >= TICK) {
        last += TICK;
        const v = scale(level());
        const eased = prev * 0.15 + v * 0.85; prev = eased;
        const x = Math.min(1, Math.max(0, (eased - 0.14) / 0.86));
        bars.push({ target: 4 + (hgt - 6) * x ** 0.75, h: 4 });
        if (bars.length > n) bars.splice(0, bars.length - n);
      }
      const ctx = el.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, hgt);
      ctx.fillStyle = getComputedStyle(el).color;
      const slide = reduce || !running ? 0 : STEP * (1 - Math.min(1, (now - last) / TICK));
      for (let i = 0; i < bars.length; i++) {
        const b = bars[i];
        b.h += (b.target - b.h) * 0.35;
        const age = i / Math.max(1, n - 1);
        ctx.globalAlpha = 0.28 + 0.72 * age ** 1.4;
        const x = w - 4 - (bars.length - 1 - i) * STEP + slide - BAR;
        const y = (hgt - b.h) / 2;
        ctx.beginPath();
        ctx.roundRect(x, y, BAR, b.h, BAR / 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [level, running]);
  return <canvas ref={canvas} className="voice-wave" aria-hidden />;
}
