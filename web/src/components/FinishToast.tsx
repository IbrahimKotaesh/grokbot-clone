import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { BotAvatarFor } from '../avatar/BotAvatar';
import { t } from '../lib/i18n';
import { useFinishNotices } from '../lib/finishNotices';

/** "Sol finished · View" at the bottom when a bot you're not looking at is done. Offers system notifications once. */
export function FinishToast() {
  const [notice, clear] = useFinishNotices();
  const bot = useStore((s) => (notice ? s.bots.find((b) => b.id === notice.botId) : undefined));
  const [askNotify, setAskNotify] = useState(false);
  useEffect(() => {
    if (!notice) return;
    setAskNotify('Notification' in window && Notification.permission === 'default');
    const timer = setTimeout(clear, 7000);
    return () => clearTimeout(timer);
  }, [notice?.at]);
  if (!notice || !bot) return null;
  const view = () => { useStore.getState().selectBot(bot.id); clear(); };
  const allow = () => { void Notification.requestPermission().then(() => setAskNotify(false)); };
  return (
    <div className="finish-toast" role="status" key={notice.at}>
      <BotAvatarFor bot={bot} size={26} />
      <span className="finish-toast__text"><b dir="auto">{t('{name} finished', { name: bot.name })}</b>{bot.lastPreview && <small dir="auto">{bot.lastPreview}</small>}</span>
      {askNotify && <button type="button" className="finish-toast__ghost" onClick={allow}>{t('Notify me')}</button>}
      <button type="button" className="finish-toast__view" onClick={view}>{t('View')}</button>
    </div>
  );
}
