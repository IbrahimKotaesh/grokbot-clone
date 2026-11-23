import { t } from '../lib/i18n';
import { useEffect, useRef, useState } from 'react';
import type RFBType from '@novnc/novnc';
import { BotAvatarFor } from '../avatar/BotAvatar';
import { api } from '../lib/api';
import { botVars } from '../lib/colors';
import { useSelectedBot, useStore } from '../store';
import { computerStatusText } from './DetailsPanel';
import { Icon } from './Icon';

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
  const [waking, setWaking] = useState(false);
  const [wakeError, setWakeError] = useState('');
  const running = computer?.status === 'running';
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
      rfb.addEventListener('connect', () => { if (!disposed) { setConn('connected'); if (mode === 'control') rfb?.focus(); } });
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

      <div className="viewer__stage">
        {running ? (
          <>
            <div ref={screenRef} className={`viewer__screen${mode === 'control' ? ' is-control' : ''}`} />
            {conn !== 'connected' && (
              <div className="viewer__overlay">
                {conn === 'connecting' ? t("Connecting to the screen…") : (
                  <>
                    <span>{conn === 'error' ? t("Couldn’t reach the screen.") : 'Disconnected.'}</span>
                    <button type="button" className="btn btn--light" onClick={() => setAttempt((n) => n + 1)}>{t("Reconnect")}</button>
                  </>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="viewer__overlay viewer__overlay--asleep">
            <span className="viewer__sleep-face"><i /><i /></span>
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
              <span className="viewer__bar-text"><span className="viewer__live-dot" /> <b>{t("You're in control")}</b></span>
              <button type="button" className="btn btn--light" onClick={() => setMode('watch')}>{t("I'm done")}</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
