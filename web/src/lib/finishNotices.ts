import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { t } from './i18n';

/**
 * Tell people when a bot finishes, without them watching:
 * - Fino tab hidden: a system notification (when allowed), a soft chime and "(2) Fino" in the tab title.
 * - Fino open on another bot: an in-app notice with a View button.
 * - Already looking at that bot: nothing, the reply is right there.
 */

const SOUND_KEY = 'fino.finishSound';
export const finishSoundOn = () => { try { return localStorage.getItem(SOUND_KEY) !== '0'; } catch { return true; } };
export const setFinishSound = (on: boolean) => { try { localStorage.setItem(SOUND_KEY, on ? '1' : '0'); } catch { /* private window */ } };

let audio: AudioContext | null = null;
const audioContext = () => {
  if (audio) return audio;
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  audio = Ctx ? new Ctx() : null;
  return audio;
};

/** Two soft rising notes, about half a second. */
export function chime() {
  try {
    const ctx = audioContext(); if (!ctx) return;
    void ctx.resume();
    const start = ctx.currentTime + 0.02;
    for (const [freq, delay] of [[880, 0], [1318.5, 0.13]] as const) {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, start + delay);
      gain.gain.linearRampToValueAtTime(0.07, start + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + delay + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start + delay); osc.stop(start + delay + 0.55);
    }
  } catch { /* no audio here */ }
}

export interface FinishNotice { botId: string; name: string; at: number }

export function useFinishNotices() {
  const [notice, setNotice] = useState<FinishNotice | null>(null);
  useEffect(() => {
    // Browsers only play sound after the person has interacted once; warm the audio up on the first click.
    const unlock = () => { try { void audioContext()?.resume(); } catch { /* ignore */ } };
    window.addEventListener('pointerdown', unlock, { once: true });

    // A push subscription already shows a system notification; don't show a second one.
    let pushOn = false;
    void navigator.serviceWorker?.getRegistration().then((r) => r?.pushManager.getSubscription()).then((s) => { pushOn = !!s; }).catch(() => {});

    let unseen = 0;
    const baseTitle = document.title.replace(/^\(\d+\)\s*/, '');
    const setTitle = () => { document.title = unseen ? `(${unseen}) ${baseTitle}` : baseTitle; };
    const onVisible = () => { if (document.visibilityState === 'visible') { unseen = 0; setTitle(); } };
    document.addEventListener('visibilitychange', onVisible);

    const finished = (id: string) => {
      // Give the reply a moment to land so the preview is the new one.
      setTimeout(() => {
        const st = useStore.getState();
        const bot = st.bots.find((b) => b.id === id);
        if (!bot || bot.kind === 'room') return;
        const hidden = document.visibilityState !== 'visible';
        if (!hidden && st.selectedBotId === id) return;
        if (!hidden) { setNotice({ botId: id, name: bot.name, at: Date.now() }); return; }
        unseen += 1; setTitle();
        if (finishSoundOn()) chime();
        if (!pushOn && 'Notification' in window && Notification.permission === 'granted') {
          const n = new Notification(t('{name} finished', { name: bot.name }), { body: (bot.lastPreview ?? '').slice(0, 140), tag: `fino-finish-${id}`, icon: '/icons/fino-captain-192.png' });
          n.onclick = () => { window.focus(); useStore.getState().selectBot(id); n.close(); };
        }
      }, 700);
    };

    const running = new Map<string, boolean>(Object.entries(useStore.getState().live).map(([id, l]) => [id, !!l.isRunning]));
    const unsubscribe = useStore.subscribe((s) => {
      for (const [id, l] of Object.entries(s.live)) {
        const was = running.get(id), now = !!l.isRunning;
        running.set(id, now);
        // Finished = was working, now stopped, and not stopped to ask the person something.
        if (was && !now && !l.awaiting) finished(id);
      }
    });
    return () => { unsubscribe(); window.removeEventListener('pointerdown', unlock); document.removeEventListener('visibilitychange', onVisible); };
  }, []);
  return [notice, () => setNotice(null)] as const;
}
