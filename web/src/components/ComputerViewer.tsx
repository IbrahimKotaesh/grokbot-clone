import { t } from '../lib/i18n';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type RFBType from '@novnc/novnc';
import { BotAvatarFor } from '../avatar/BotAvatar';
import { api } from '../lib/api';
import { botVars } from '../lib/colors';
import { useSelectedBot, useStore } from '../store';
import { computerStatusText } from './DetailsPanel';
import { Icon } from './Icon';
import { Badr } from './Badr';

type Mode = 'watch' | 'control';
type Conn = 'connecting' | 'connected' | 'disconnected' | 'error';

/** Fullscreen computer stage: noVNC over our relay. Watch mode is view-only; Take control reconnects with mode=control. */
export function ComputerViewer({docked=false,panel=false}:{docked?:boolean;panel?:boolean}) {
  const bot = useSelectedBot();
  const computer = useStore((s) => s.computer);
  const set = useStore((s) => s.set);
  const screenRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<RFBType | null>(null);
  const [mode, setMode] = useState<Mode>('watch');
  const [conn, setConn] = useState<Conn>('connecting');
  const [attempt, setAttempt] = useState(0);
  // Drops in a row: a short one (an update restarting the server) heals quietly; the full message waits for several.
  const [fails, setFails] = useState(0);
  const [waking, setWaking] = useState(false);
  const [wakeError, setWakeError] = useState('');
  const running = computer?.status === 'running';
  // While the bot is mid-task the screen gets a red frame, so it's clear who is driving.
  // Only while it actually drives the computer, not while it's just thinking or writing.
  const botWorking = useStore((s) => { const l = bot ? s.live[bot.id] : undefined; return !!l?.isRunning && ['on_its_computer', 'browsing_web', 'reading_web'].includes(l.activity?.kind ?? ''); });
  // The bot's mouse: the server sends where it points; we draw an arrow there that glides between spots.
  const point = useStore((s) => (bot ? s.pointer[bot.id] : undefined));
  const [pointerPos, setPointerPos] = useState<{ left: number; top: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const place = () => {
      const canvas = screenRef.current?.querySelector('canvas');
      const stage = stageRef.current;
      if (!point || !canvas || !stage || !canvas.width) { setPointerPos(null); return; }
      const c = canvas.getBoundingClientRect(), st = stage.getBoundingClientRect();
      setPointerPos({ left: c.left - st.left + (point.x * c.width) / canvas.width, top: c.top - st.top + (point.y * c.height) / canvas.height });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [point, conn]);
  const close = () => {if(docked)window.dispatchEvent(new CustomEvent('fino-close-computer'));else set({viewerOpen:false});};

  const wake = async () => {
    setWaking(true); setWakeError('');
    try { const result = await api.ensureComputer(); set({computer:result.computer}); }
    catch (e) { setWakeError((e as Error).message || t("The computer could not start. Please try again.")); }
    finally { setWaking(false); }
  };
  useEffect(() => {
    setWakeError(''); setMode('watch');
    // Opening a sleeping computer is itself a request to wake it. The side panel only watches: it never wakes it on its own.
    if (bot && !running && !panel) void wake();
    // Only once on opening/switching; a failed attempt waits for an explicit retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bot?.id]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      // In control mode Escape belongs to the remote desktop.
      if (e.key === 'Escape' && mode === 'watch') { e.preventDefault(); close(); }
    };
    if (panel) return;
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (!bot || !running || !screenRef.current) return;
    let disposed = false;
    let rfb: RFBType | null = null;
    setConn('connecting');
    (async () => {
      const { default: RFB } = await import('@novnc/novnc');
      if (disposed || !screenRef.current) return;
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const url = `${proto}://${location.host}/api/bots/${bot.id}/screen?mode=${mode}`;
      rfb = new RFB(screenRef.current, url, { shared: true });
      rfb.viewOnly = mode === 'watch';
      rfb.scaleViewport = true;
      rfb.resizeSession = false;
      rfb.background = 'transparent';
      rfb.focusOnClick = mode === 'control';
      rfb.addEventListener('connect', () => { if (!disposed) { setConn('connected'); setFails(0); if (mode === 'control') rfb?.focus(); } });
      rfb.addEventListener('disconnect', (e) => { if (!disposed) setConn((e as CustomEvent<{ clean: boolean }>).detail?.clean ? 'disconnected' : 'error'); });
      rfb.addEventListener('securityfailure', () => { if (!disposed) setConn('error'); });
      rfbRef.current = rfb;
    })().catch(() => setConn('error'));
    return () => {
      disposed = true;
      try { rfb?.disconnect(); } catch { /* already closed */ }
      rfbRef.current = null;
      if (screenRef.current) screenRef.current.innerHTML = '';
    };
  }, [bot?.id, running, mode, attempt]);

  // The screen heals itself: a dropped connection tries again after 1, 2, 3… seconds, no button needed.
  useEffect(() => {
    if (!running || (conn !== 'error' && conn !== 'disconnected')) return;
    const timer = setTimeout(() => { setFails((n) => n + 1); setAttempt((n) => n + 1); }, Math.min(1000 * (fails + 1), 5000));
    return () => clearTimeout(timer);
  }, [running, conn, attempt, fails]);
  const quietRetry = conn !== 'connected' && conn !== 'connecting' && fails < 4;

  if (!bot) return null;
  const busy = waking || computer?.status === 'starting' || computer?.status === 'resuming' || computer?.status === 'creating';

  return (
    <div className={`viewer${docked||panel?' viewer--docked':''}${panel?' viewer--panel':''}`} role={docked||panel?'region':'dialog'} aria-modal={docked||panel?undefined:true} aria-label={`${bot.name}'s computer`} style={botVars(bot.avatarColor)}>
      {!panel && <><div className="viewer__scrim" onClick={mode === 'watch' ? close : undefined} />
      <div className="viewer__top">
        <div className="viewer__title">
          <BotAvatarFor bot={bot} size={24} />
          <span>{bot.name}'s computer</span>
          <span className="viewer__status">{computerStatusText(computer)}</span>
        </div>
        <button type="button" className="viewer__close" onClick={close} aria-label={t("Close computer")}><Icon name="close" color="#FFFFFF" /></button>
      </div></>}

      <div ref={stageRef} className={`viewer__stage${running && botWorking && mode === 'watch' ? ' is-bot-working' : ''}`}>
        {running ? (
          <>
            <div ref={screenRef} className={`viewer__screen${mode === 'control' ? ' is-control' : ''}`} />
            {botWorking && mode === 'watch' && conn === 'connected' && <span className="viewer__working" role="status"><i />{t('{name} is using the computer', { name: bot.name })}</span>}
            {mode === 'watch' && conn === 'connected' && pointerPos && point && Date.now() - point.at < 60_000 && (
              <span className="viewer__pointer" style={{ transform: `translate(${pointerPos.left}px, ${pointerPos.top}px)` }} aria-hidden="true">
                {point.action === 'click' && <i key={point.at} className="viewer__ripple" />}
                <svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2.5 L4 19 L8.6 14.8 L11.6 21.5 L14.4 20.3 L11.5 13.7 L17.8 13.4 Z" fill="#fff" stroke="#111" strokeWidth="1.4" strokeLinejoin="round" /></svg>
              </span>
            )}
            {(quietRetry || (conn === 'connecting' && fails > 0)) && <span className="viewer__reconnecting" role="status"><i />{t('Reconnecting…')}</span>}
            {conn !== 'connected' && !quietRetry && !(conn === 'connecting' && fails > 0) && (
              <div className="viewer__overlay">
                {conn === 'connecting' ? t("Connecting to the screen…") : (
                  <>
                    <span>{conn === 'error' ? t("Couldn’t reach the screen.") : t('Disconnected.')}</span>
                    <button type="button" className="btn btn--light" onClick={() => setAttempt((n) => n + 1)}>{t("Reconnect")}</button>
                  </>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="viewer__overlay viewer__overlay--asleep">
            <Badr mood={busy ? 'hop' : 'sleep'} size={76} className="viewer__badr" />
            <span>{busy ? t("Starting your computer…") : wakeError || (computer?.status === 'error' ? t("The computer is unavailable.") : panel ? t("Asleep. It wakes up when {name} needs it.", { name: bot.name }) : t("The computer is asleep."))}</span>
            {!busy && <button type="button" className="btn btn--light" onClick={() => void wake()}>{wakeError || computer?.status === 'error' ? t("Try again") : t("Wake computer")}</button>}
          </div>
        )}
      </div>

      {running && (
        <div className={`viewer__bar${mode === 'control' ? ' is-control' : ''}`}>
          {mode === 'watch' ? (
            <>
              <span className="viewer__bar-text"><b>{t("Watching")}</b>{!panel && <> {t("· Take control to use the mouse and keyboard")}</>}</span>
              <button type="button" className="btn btn--light" onClick={() => setMode('control')}>{t("Take control")}</button>
            </>
          ) : (
            <>
              <span className="viewer__bar-text"><span className="viewer__live-dot" /> <b>{t("You're in control")}</b>{botWorking && <> · {t('{name} waits until you’re done', { name: bot.name })}</>}</span>
              <button type="button" className="btn btn--light" onClick={() => setMode('watch')}>{t("I'm done")}</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
