import { MessagesSquare } from 'lucide-react';
import { t } from '../lib/i18n';
import { useStore } from '../store';
import { GroupAvatar } from './GroupAvatar';
import { BlurWords } from '../lib/motion';

/** Groups with no group open: pick one, or start the first. */
export function GroupsEmpty() {
  const groups = useStore((s) => s.bots).filter((b) => b.kind === 'room').sort((a, b) => b.lastActivityAt - a.lastActivityAt);
  const st = useStore.getState();
  return (
    <main className="chat page-view groups-empty">
      <div className="groups-empty__inner">
        <span className="groups-empty__icon" aria-hidden><MessagesSquare size={30} strokeWidth={1.7} /></span>
        <BlurWords as="h1" className="groups-empty__title" text={t('Groups')} />
        <p className="groups-empty__sub">{groups.length ? t('Pick a group to talk to several Bots at once.') : t('Put 2 or more Bots in one chat. Write to everyone, or type @ to ask one Bot.')}</p>
        {groups.length > 0 && (
          <div className="groups-empty__list">
            {groups.map((g) => (
              <button key={g.id} type="button" className="groups-empty__item" onClick={() => st.selectBot(g.id)}>
                <GroupAvatar room={g} size={36} />
                <span className="groups-empty__name" dir="auto">{g.name}</span>
                {g.unread > 0 && <span className="home__dot" aria-label={t('Unread activity')} />}
              </button>
            ))}
          </div>
        )}
        <button type="button" className="btn btn--primary groups-empty__new" onClick={() => st.setModal('group')}>{t('New group chat')}</button>
      </div>
    </main>
  );
}
