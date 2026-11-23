import { useState, type FormEvent } from 'react';
import { t } from '../lib/i18n';
import { useStore } from '../store';

type Mode = 'signin' | 'signup' | 'forgot' | 'sent' | 'reset';

const loginError = (status: string | null) => {
  if (status === 'not-allowed') return t('This account is not allowed on this server.');
  if (status === 'google-unavailable') return t('Google sign-in is not set up here. Use your email instead.');
  if (status === 'google-failed') return t('Google sign-in is unavailable right now. Try again, or use your email.');
  return status === 'failed' ? t('Sign-in didn’t finish. Try again.') : null;
};

async function post(path: string, body: unknown) {
  const r = await fetch('/api/auth/password/' + path, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error ?? t('Something went wrong. Try again.')), { code: data.code });
  return data;
}

/** Google plus email + password: sign in, create an account, and reset a forgotten password. */
export function AuthPanel({ initial = 'signin' }: { initial?: 'signin' | 'signup' }) {
  const googleLogin = useStore((s) => s.googleLogin);
  const checkAuth = useStore((s) => s.checkAuth);
  const params = new URLSearchParams(location.search);
  const resetToken = params.get('reset');
  const [mode, setMode] = useState<Mode>(resetToken ? 'reset' : initial);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() => loginError(params.get('login')));
  const [exists, setExists] = useState(false);

  const go = (m: Mode) => { setMode(m); setError(null); setExists(false); setPassword(''); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null); setExists(false);
    try {
      if (mode === 'forgot') { await post('forgot', { email }); setMode('sent'); return; }
      if (mode === 'reset') await post('reset', { token: resetToken, password });
      else await post(mode === 'signup' ? 'signup' : 'login', { email, password, name });
      history.replaceState(null, '', '/');
      await checkAuth();
    } catch (err) {
      setError((err as Error).message);
      setExists((err as { code?: string }).code === 'exists');
    } finally { setBusy(false); }
  };

  if (mode === 'sent') return (
    <div className="auth" aria-live="polite">
      <h2 className="auth__title">{t('Check your email')}</h2>
      <p className="auth__note">{t('If there is a Fino account for')} <b>{email}</b>{t(', a link to choose a new password is on its way. It works for one hour.')}</p>
      <button type="button" className="auth__link" onClick={() => go('signin')}>{t('Back to sign in')}</button>
    </div>
  );

  const title = { signin: t('Sign in to Fino'), signup: t('Create your account'), forgot: t('Reset your password'), reset: t('Choose a new password') }[mode];
  return (
    <div className="auth">
      <h2 className="auth__title">{title}</h2>
      {(mode === 'signin' || mode === 'signup') && googleLogin && <>
        <a className="auth__google" href="/api/auth/google/start"><GoogleG /> {t('Continue with Google')}</a>
        <div className="auth__or"><span>{t('or with email')}</span></div>
      </>}
      {mode === 'forgot' && <p className="auth__note">{t('Enter the email you signed up with and we’ll send you a link.')}</p>}
      <form className="auth__form" onSubmit={submit} noValidate>
        {mode === 'signup' && <label className="auth__field"><span>{t('Name')}</span>
          <input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></label>}
        {mode !== 'reset' && <label className="auth__field"><span>{t('Email')}</span>
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>}
        {mode !== 'forgot' && <label className="auth__field"><span>{mode === 'signin' ? t('Password') : t('New password')}</span>
          <input type="password" required minLength={8} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby={mode === 'signin' ? undefined : 'auth-pw-hint'} />
          {mode !== 'signin' && <small id="auth-pw-hint">{t('At least 8 characters.')}</small>}</label>}
        {mode === 'signin' && <button type="button" className="auth__link auth__forgot" onClick={() => go('forgot')}>{t('Forgot password?')}</button>}
        {error && <p role="alert" className="auth__error">{error}{exists && <> <button type="button" className="auth__link" onClick={() => go('signin')}>{t('Sign in')}</button></>}</p>}
        <button type="submit" className="auth__submit" disabled={busy}>
          {busy ? t('One moment…') : { signin: t('Sign in'), signup: t('Create account'), forgot: t('Send reset link'), reset: t('Save and sign in') }[mode]}
        </button>
      </form>
      <p className="auth__switch">
        {mode === 'signin' && <>{t('New to Fino?')} <button type="button" className="auth__link" onClick={() => go('signup')}>{t('Create an account')}</button></>}
        {mode === 'signup' && <>{t('Already have an account?')} <button type="button" className="auth__link" onClick={() => go('signin')}>{t('Sign in')}</button></>}
        {(mode === 'forgot' || mode === 'reset') && <button type="button" className="auth__link" onClick={() => { history.replaceState(null, '', location.pathname); go('signin'); }}>{t('Back to sign in')}</button>}
      </p>
    </div>
  );
}

export function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.300-.1-2.400-.4-3.500z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.300-.1-2.400-.4-3.500z" />
    </svg>
  );
}
