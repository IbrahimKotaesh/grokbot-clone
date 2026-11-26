import { t } from '../lib/i18n';
import { Badr } from './Badr';
import { useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../store';
import { TrafficLights } from './Sidebar';
import { isMacDesktop } from '../lib/desktop';
import { AuthPanel } from './AuthPanel';

export function SignIn({ initial = 'signin' }: { initial?: 'signin' | 'signup' }) {
  const devLogin = useStore((s) => s.devLogin);
  const googleLogin = useStore((s) => s.googleLogin);
  const localAccount = useStore((s) => s.localAccount);
  const checkAuth = useStore((s) => s.checkAuth);
  const [email, setEmail] = useState(localAccount?.email ?? '');
  const [name, setName] = useState(localAccount?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() => {
    const status = new URLSearchParams(location.search).get('login');
    if(status === 'not-allowed') return 'This account is not authorized to use this private app.';
    if(status === 'google-unavailable') return 'Google sign-in has not been set up. Continue with your local account below.';
    if(status === 'google-failed') return 'Google sign-in is temporarily unavailable. Check the connection setup, or continue locally.';
    return status === 'failed' ? t("Sign-in didn’t finish. Try again.") : null;
  });

  const dev = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes('@')) { setError(t("Enter an email address")); return; }
    setBusy(true); setError(null);
    try { await api.devLogin(email.trim(), name.trim() || undefined); await checkAuth(); } catch (err) { setError((err as Error).message); setBusy(false); }
  };

  return (
    <div className="signin">
      <div className="signin__chrome"><TrafficLights /></div>
      <div className="signin__card">
        <div className="signin__hero">
          <Badr mood="peek" size={112} className="signin__mascot signin__mascot--badr" />
        </div>
        <h1 className="signin__title">{t('Badr')}</h1>
        <p className="signin__sub">{t("A little company. A lot done. Your AI team, tools and ideas in one place.")}</p>
        {/* The Mac app catches the Google link and signs in natively; email + password works the same everywhere. */}
        <AuthPanel initial={initial} />
        {devLogin && (
          <form className="signin__dev" onSubmit={dev}>
            <div className="signin__divider"><span>{t("Continue on this Mac")}</span></div>
            <input className="text-input" type="email" placeholder={t("Email")} value={email} onChange={(e) => setEmail(e.target.value)} aria-label={t("Email")} />
            <input className="text-input" placeholder={t("Name (optional)")} value={name} onChange={(e) => setName(e.target.value)} aria-label={t("Name")} />
            <button type="submit" className="btn btn--secondary" disabled={busy}>{busy ? t("Signing in…") : localAccount && email === localAccount.email ? `Continue as ${localAccount.name || localAccount.email}` : t("Continue locally")}</button>
          </form>
        )}
        {!googleLogin && devLogin && <p className="signin__foot">{t("Use your local account to open your Bots. Connect Gmail later from Connect apps.")}</p>}
        {error && devLogin && <div className="card__error signin__error">{error}</div>}
        <p className="signin__foot">{t("Your own space to think, create and get things done.")}</p>
        {!isMacDesktop() && <a className="signin__back" href="/">{t("Back to the Fino home page")}</a>}
      </div>
    </div>
  );
}
