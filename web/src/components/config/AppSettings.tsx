import {AccessCodeSettings} from '../AccessCode';
import {NotificationsSection} from './NotificationsSection';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Toolkit } from '@shared/types';
import { BotAvatarFor } from '../../avatar/BotAvatar';
import { configApi, type ComputerDetails } from '../../lib/configApi';
import { relativeShort } from '../../lib/time';
import { useConfigUI, type AppSection, type Theme } from '../../configStore';
import { useStore } from '../../store';
import { computerStatusText } from '../DetailsPanel';
import { Icon } from '../Icon';
import { ToolkitLogo } from '../ToolkitLogo';
import { Glyph } from './glyphs';
import { ConfirmButton, Segmented, Switch } from './ui';
import { chime, finishSoundOn, setFinishSound } from '../../lib/finishNotices';
import { api } from '../../lib/api';
import { lang, langChoice, setLangChoice, t } from '../../lib/i18n';

const SECTIONS: { id: AppSection; label: string }[] = [
  { id: 'general', label: t("General") },
  { id: 'notifications', label: t("Notifications") },
  { id: 'computer', label: t("Computer") },
  { id: 'permissions', label: t("Permissions") },
  { id: 'apps', label: t("Connected apps") },
  { id: 'account', label: t("Account") },
];

/** Full-window settings page, opened from the account menu. */
export function AppSettings() {
  const section = useConfigUI((s) => s.appSettings);
  const close = useConfigUI((s) => s.closeAppSettings);
  const open = useConfigUI((s) => s.openAppSettings);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.modal-root')) { e.preventDefault(); close(); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [close]);
  if (!section) return null;
  return createPortal(
    <div className="app-settings" role="dialog" aria-modal="true" aria-label={t("Settings")}>
      <aside className="app-settings__nav">
        <button type="button" className="app-settings__back" onClick={close}><Glyph name="arrow_left" size={14} /> {t("Back to Bots")}</button>
        <div className="app-settings__heading">{t("Settings")}</div>
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" className={`cfg-nav__item${section === s.id ? ' is-active' : ''}`} onClick={() => open(s.id)} aria-current={section === s.id || undefined}>
            {s.label}
          </button>
        ))}
      </aside>
      <div className="app-settings__main">
        <button type="button" className="app-settings__close icon-btn" onClick={close} aria-label={t("Close settings")} title={t("Close (Esc)")}><Icon name="close" opacity={0.8} /></button>
        <div className="app-settings__page">
          {section === 'notifications' && <NotificationsSection />}
          {section === 'general' && <GeneralSection />}
          {section === 'computer' && <ComputerSection />}
          {section === 'permissions' && <PermissionsSection />}
          {section === 'apps' && <AppsSection />}
          {section === 'account' && <AccountSection />}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function PageHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="app-settings__head">
      <h1>{title}</h1>
      {sub && <p>{sub}</p>}
    </div>
  );
}

/** When a bot finishes while Fino is in the background: system notification and a soft sound. */
function FinishSettings() {
  const [sound, setSound] = useState(finishSoundOn());
  const [perm, setPerm] = useState(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  return (
    <section className="cfg-section">
      <div className="cfg-section__label">{t('When a bot finishes')}</div>
      <div className="cfg-card">
        <div className="cfg-row">
          <div className="cfg-row__text">
            <div className="cfg-row__title">{t('Play a soft sound')}</div>
            <div className="cfg-row__sub">{t('A short chime when a bot finishes while Fino is in the background.')}</div>
          </div>
          <Switch on={sound} label={t('Play a soft sound')} onChange={() => { const next = !sound; setFinishSound(next); setSound(next); if (next) chime(); }} />
        </div>
      </div>
      {perm === 'default' && <button type="button" className="btn btn--light" onClick={() => void Notification.requestPermission().then(setPerm)}>{t('Turn on notifications')}</button>}
      <div className="cfg-field__hint">{perm === 'granted' ? t('Notifications are on. You get one when a bot finishes while Fino is in the background.') : perm === 'denied' ? t('Notifications are blocked for this site in your browser settings.') : perm === 'unsupported' ? t('This browser can’t show notifications.') : t('Get a notification when a bot finishes while Fino is in the background.')}</div>
    </section>
  );
}

/** A short daily note from the Chief of Staff about what the team did and what waits for you. */
function MorningBriefSettings() {
  const chief = useStore((s) => s.bots.find((b) => b.isPrimary && b.kind !== 'room'));
  const [state, setState] = useState<{ enabled: boolean; hour: number } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api.morningBrief().then((r) => r.available && setState({ enabled: r.enabled, hour: r.hour })).catch(() => {}); }, []);
  if (!state || !chief) return null;
  const save = (next: { enabled: boolean; hour: number }) => {
    const prev = state; setState(next); setError('');
    api.setMorningBrief(next.enabled, next.hour).catch((e) => { setState(prev); setError((e as Error).message); });
  };
  const label = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString(lang === 'ar' ? 'ar' : 'en-US', { hour: 'numeric', minute: '2-digit' });
  return (
    <section className="cfg-section">
      <div className="cfg-section__label">{t('Morning brief')}</div>
      <div className="cfg-card">
        <div className="cfg-row">
          <div className="cfg-row__text">
            <div className="cfg-row__title">{t('Daily brief from {name}', { name: chief.name })}</div>
            <div className="cfg-row__sub">{t('Every morning: what your team finished, what is in progress and what waits for you.')}</div>
          </div>
          <Switch on={state.enabled} label={t('Morning brief')} onChange={() => save({ ...state, enabled: !state.enabled })} />
        </div>
        {state.enabled && (
          <div className="cfg-row">
            <div className="cfg-row__text"><div className="cfg-row__title">{t('Time')}</div></div>
            <select className="cfg-select" value={state.hour} aria-label={t('Time')} onChange={(e) => save({ ...state, hour: Number(e.target.value) })}>
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{label(h)}</option>)}
            </select>
          </div>
        )}
      </div>
      {error && <div className="cfg-field__hint" role="alert">{error}</div>}
    </section>
  );
}

// ---------------------------------------------------------------------------

function ThemeTile({ value, label, current, onPick }: { value: Theme; label: string; current: Theme; onPick: (t: Theme) => void }) {
  return (
    <button type="button" role="radio" aria-checked={current === value} className={`theme-tile${current === value ? ' is-active' : ''}`} onClick={() => onPick(value)}>
      <span className={`theme-tile__art is-${value}`} aria-hidden>
        <span className="theme-tile__side" />
        <span className="theme-tile__pane"><i /><i /><b /></span>
      </span>
      <span className="theme-tile__label">{label}</span>
    </button>
  );
}

function GeneralSection() {
  const theme = useConfigUI((s) => s.theme);
  const setTheme = useConfigUI((s) => s.setTheme);
  return (
    <>
      <PageHead title={t("General")} />
      <section className="cfg-section">
        <div className="cfg-section__label">{t("Theme")}</div>
        <div className="theme-tiles" role="radiogroup" aria-label={t("Theme")}>
          <ThemeTile value="system" label={t("System")} current={theme} onPick={setTheme} />
          <ThemeTile value="light" label={t("Light")} current={theme} onPick={setTheme} />
          <ThemeTile value="dark" label={t("Dark")} current={theme} onPick={setTheme} />
        </div>
        <div className="cfg-field__hint">{t("Your choice is saved on this device and used each time you open Fino. System follows your device’s appearance.")}</div>
      </section>
      <section className="cfg-section">
        <div className="cfg-section__label">{t('Language')}</div>
        <Segmented label={t('Language')} value={langChoice()} options={[{ value: 'system', label: t('System') }, { value: 'en', label: t("English") }, { value: 'ar', label: 'العربية' }]} onChange={(v) => { if (v !== langChoice()) setLangChoice(v); }} />
        <div className="cfg-field__hint">{t('Your choice is saved on this device. System follows your browser’s language.')}</div>
      </section>
      <MorningBriefSettings />
      <FinishSettings />
    </>
  );
}

// ---------------------------------------------------------------------------

const screenLabel = (id: string) => (id === 'default' ? t("Main screen") : `Screen ${Number(id.replace('screen-', '')) - 98 || id}`);

function ComputerSection() {
  const computer = useStore((s) => s.computer);
  const bots = useStore((s) => s.bots);
  const [details, setDetails] = useState<ComputerDetails | null>(null);
  const [busy, setBusy] = useState<'wake' | 'sleep' | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const load = useCallback(() => { configApi.computerDetails().then(setDetails).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load, computer?.status, computer?.screens.length]);

  const status = computer?.status ?? details?.computer.status;
  const running = status === 'running';
  const transitioning = status === 'starting' || status === 'resuming' || status === 'creating' || status === 'suspending';
  const act = async (kind: 'wake' | 'sleep') => {
    setBusy(kind); setNote(null);
    try { kind === 'wake' ? await configApi.wake() : await configApi.sleep(); }
    catch (e) { setNote((e as Error).message); }
    finally { setBusy(null); }
  };
  const byId = new Map(bots.map((b) => [b.id, b]));

  return (
    <>
      <PageHead title={t("Computer")} sub={t("Your Bots share one cloud computer. Each Bot works on its own screen.")} />
      <section className="cfg-section">
        <div className="cfg-card">
          <div className="cfg-row">
            <span className={`computer-status-dot is-${running ? 'on' : transitioning ? 'busy' : 'off'}`} aria-hidden />
            <div className="cfg-row__text">
              <div className="cfg-row__title">Bots’ computer · {computerStatusText(computer ?? null)}</div>
              <div className="cfg-row__sub">
                {details ? `Goes to sleep after ${details.hibernation.idleMinutes} idle minutes when nobody is watching. Starts again on its own once a Bot has work.` : 'Checking…'}
              </div>
            </div>
            {running || status === 'suspending' ? (
              <button type="button" className="cfg-btn cfg-btn--secondary" disabled={!running || !!busy} onClick={() => act('sleep')}>{busy === 'sleep' || status === 'suspending' ? t("Going to sleep…") : t("Sleep")}</button>
            ) : (
              <button type="button" className="cfg-btn cfg-btn--primary" disabled={transitioning || !!busy} onClick={() => act('wake')}>{busy === 'wake' || transitioning ? 'Waking…' : t("Wake")}</button>
            )}
          </div>
          {computer?.error && status === 'error' && <div className="cfg-error cfg-error--inset">{computer.error}</div>}
          {note && <div className="cfg-error cfg-error--inset">{note}</div>}
        </div>
      </section>

      <section className="cfg-section">
        <div className="cfg-section__label">{t("Screens in use")}</div>
        <div className="cfg-card">
          {!details ? <div className="cfg-empty cfg-empty--flat">{t("Loading…")}</div> : details.screens.length === 0 ? (
            <div className="cfg-empty cfg-empty--flat">{t("No Bot has used the computer yet.")}</div>
          ) : details.screens.map((s) => {
            const bot = byId.get(s.botId);
            return (
              <div key={s.botId} className="cfg-row">
                {bot ? <BotAvatarFor bot={bot} size={28} /> : <span className="cfg-row__ph" />}
                <div className="cfg-row__text">
                  <div className="cfg-row__title">{bot?.name ?? t("Removed Bot")}</div>
                  <div className="cfg-row__sub">{screenLabel(s.screenId)} · used {relativeShort(s.lastUsedAt) === 'now' ? 'just now' : `${relativeShort(s.lastUsedAt)}${/^\d/.test(relativeShort(s.lastUsedAt)) ? ' ago' : ''}`}</div>
                </div>
                <ConfirmButton
                  className="cfg-btn cfg-btn--secondary"
                  confirmLabel="Reset screen"
                  disabled={!running}
                  title={running ? t("Closes everything open on this screen") : t("Wake the computer first")}
                  onConfirm={async () => { try { await configApi.resetScreen(s.botId); setNote(null); load(); } catch (e) { setNote((e as Error).message); } }}
                >
                  Reset
                </ConfirmButton>
              </div>
            );
          })}
        </div>
        <div className="cfg-field__hint">{t("Reset closes every window on that Bot’s screen, so it starts clean next time. Up to 4 Bots can have a screen at once.")}</div>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------

function humanizeTool(slug: string): { app: string; action: string } {
  const parts = slug.split(/[_:]/).filter(Boolean);
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  if (parts.length < 2) return { app: cap(slug), action: '' };
  return { app: cap(parts[0]), action: cap(parts.slice(1).join(' ')) };
}

function PermissionsSection() {
  const [policies, setPolicies] = useState<{ tool: string; mode: string }[] | null>(null);
  const load = useCallback(() => { configApi.policies().then((r) => setPolicies(r.policies)).catch(() => setPolicies([])); }, []);
  useEffect(() => { load(); }, [load]);
  const [autoApprove, setAutoApprove] = useState<boolean | null>(null);
  useEffect(() => { fetch('/api/account/approvals', { credentials: 'include' }).then((r) => r.json()).then((r) => setAutoApprove(!!r.autoApprove)).catch(() => setAutoApprove(false)); }, []);
  const toggleAuto = (on: boolean) => {
    setAutoApprove(on);
    fetch('/api/account/approvals', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ autoApprove: on }) })
      .then((r) => r.json()).then((r) => setAutoApprove(!!r.autoApprove)).catch(() => setAutoApprove(!on));
  };
  return (
    <>
      <PageHead title={t("Permissions")} sub={t("Choose when your Bots ask before acting.")} />
      <section className="cfg-section">
        <div className="cfg-card">
          <div className="cfg-row">
            <div className="cfg-row__text">
              <div className="cfg-row__title">{t("Don’t ask for approval")}</div>
              <div className="cfg-row__sub">{t("Your Bots act without asking first. They still ask if something looks suspicious, like instructions hidden in an email or web page.")}</div>
            </div>
            <Switch on={!!autoApprove} disabled={autoApprove === null} label={t("Don’t ask for approval")} onChange={toggleAuto} />
          </div>
        </div>
      </section>
      <section className="cfg-section">
        <div className="cfg-section__label">{t("Always allowed")}</div>
        <div className="cfg-card">
          {policies === null ? <div className="cfg-empty cfg-empty--flat">{t("Loading…")}</div> : policies.length === 0 ? (
            <div className="cfg-empty cfg-empty--flat">{t('Nothing here yet. When you choose “Always allow” on an approval, it shows up here.')}</div>
          ) : policies.map((p) => {
            const h = humanizeTool(p.tool);
            return (
              <div key={p.tool} className="cfg-row">
                <div className="cfg-row__text">
                  <div className="cfg-row__title">{h.app}{h.action ? ` · ${h.action}` : ''}</div>
                  <div className="cfg-row__sub">{t(p.mode === 'always_allow' ? t("Always allowed") : p.mode === 'blocked' ? t("Never allowed") : t("Asks first"))} · <code className="cfg-code">{p.tool}</code></div>
                </div>
                <button type="button" className="cfg-btn cfg-btn--secondary" onClick={() => configApi.deletePolicy(p.tool).then(load).catch(() => {})}>{t("Ask again")}</button>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------

function AppsSection() {
  const version = useStore((s) => s.connectionsVersion);
  const [apps, setApps] = useState<Toolkit[] | null>(null);
  useEffect(() => { configApi.connectedApps().then((r) => setApps(r.connectedApps ?? [])).catch(() => setApps([])); }, [version]);
  const openApps = () => { useConfigUI.getState().closeAppSettings(); useStore.getState().setModal('apps'); };
  return (
    <>
      <PageHead title={t("Connected apps")} sub={t("Apps your Bots can use for you, like email, calendar and docs.")} />
      <section className="cfg-section">
        <div className="cfg-card">
          <div className="cfg-row">
            <div className="cfg-row__text">
              <div className="cfg-row__title">{apps === null ? 'Checking…' : apps.length ? `${apps.length} app${apps.length === 1 ? '' : 's'} connected` : t("No apps connected yet")}</div>
              <div className="cfg-row__sub">{t("Bots ask before doing anything that changes data in an app.")}</div>
            </div>
            <button type="button" className="cfg-btn cfg-btn--primary" onClick={openApps}>{apps?.length ? t("Manage apps") : t("Connect apps")}</button>
          </div>
          {apps?.map((a) => (
            <div key={a.slug} className="cfg-row">
              <ToolkitLogo name={a.name} logo={a.logo} size={28} radius={7} />
              <div className="cfg-row__text">
                <div className="cfg-row__title">{a.name}</div>
                {a.description && <div className="cfg-row__sub">{a.description}</div>}
              </div>
              <span className="cfg-chip">{t("Connected")}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------

function AccountSection() {
  const user = useStore((s) => s.user);
  const [busy, setBusy] = useState(false);
  const initials = (user?.name ?? user?.email ?? '?').trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <>
      <PageHead title={t("Account")} />
      <AccessCodeSettings/>
      <section className="cfg-section">
        <div className="cfg-card">
          <div className="cfg-row">
            <span className="account__initials">{initials}</span>
            <div className="cfg-row__text">
              <div className="cfg-row__title">{user?.name}</div>
              <div className="cfg-row__sub">{user?.email}</div>
            </div>
            <button type="button" className="cfg-btn cfg-btn--secondary" disabled={busy} onClick={async () => { setBusy(true); await configApi.logout().catch(() => {}); location.reload(); }}>
              {busy ? t("Signing out…") : t("Sign out")}
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
