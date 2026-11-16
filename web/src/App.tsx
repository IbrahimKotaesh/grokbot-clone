import { useEffect, useRef } from 'react';
import { startEvents } from './lib/events';
import { useStore } from './store';
import { ChatView } from './components/ChatView';
import { ComputerViewer } from './components/ComputerViewer';
import { DetailsPanel } from './components/DetailsPanel';
import { Sidebar } from './components/Sidebar';
import { SignIn } from './components/SignIn';
import { ConnectAppsModal } from './components/modals/ConnectAppsModal';
import { CreateBotModal } from './components/modals/CreateBotModal';
import { CreateGroupModal } from './components/modals/CreateGroupModal';
import { SearchModal } from './components/modals/SearchModal';
import { ConfigLayer } from './components/config/ConfigLayer';
import { TasksView } from './components/config/TasksView';
import { useConfigUI } from './configStore';
import { Icon } from './components/Icon';

function Shell() {
  const detailsOpen = useStore((s) => s.detailsOpen);
  const modal = useStore((s) => s.modal);
  const viewerOpen = useStore((s) => s.viewerOpen);
  const collapsed = useStore((s) => s.sidebarCollapsed);
  const hasBot = useStore((s) => !!s.selectedBotId);
  const navOpen = useStore((s) => s.mobileNavOpen);
  const navButton = useRef<HTMLButtonElement>(null);
  const view = useConfigUI((s) => s.view);

  useEffect(() => {
    const st = useStore.getState();
    st.loadBots().catch(console.error);
    st.loadComputer().catch(console.error);
    const stop = startEvents();
    // OAuth popups post back here; refresh connection-dependent views and the open transcript.
    const onMsg = (e: MessageEvent) => {
      if ((e.data as { type?: string })?.type !== 'grokbot-connected') return;
      const s = useStore.getState();
      s.set({ connectionsVersion: s.connectionsVersion + 1 });
      if (s.selectedBotId) s.loadRows(s.selectedBotId).catch(() => {});
    };
    const onNotification=(event:MessageEvent)=>{
      if(event.data?.type!=='fino-open-notification')return;
      try{const url=new URL(event.data.url,location.origin);if(url.origin!==location.origin)return;const botId=url.searchParams.get('bot'),id=url.searchParams.get('notification');
        if(botId&&useStore.getState().bots.some(b=>b.id===botId)){useStore.getState().selectBot(botId);useConfigUI.getState().closeAppSettings();useConfigUI.getState().setView('chat');useStore.getState().set({viewerOpen:false});}
        if(id)void fetch('/api/push/notifications/read',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});
      }catch{/* Ignore malformed notification links. */}
    };
    window.addEventListener('message', onMsg);
    navigator.serviceWorker?.addEventListener('message',onNotification);
    return () => { stop(); window.removeEventListener('message', onMsg);navigator.serviceWorker?.removeEventListener('message',onNotification); };
  }, []);

  useEffect(() => {
    useStore.getState().set({ mobileNavOpen: false });
  }, [view, modal]);

  useEffect(() => {
    if (!navOpen) return;
    const sidebar = document.querySelector<HTMLElement>('.sidebar');
    const items = () => Array.from(sidebar?.querySelectorAll<HTMLElement>('button, a, input, [tabindex="0"]') ?? []).filter(el => el.getClientRects().length);
    items()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useStore.getState().set({ mobileNavOpen: false });
      if (e.key === 'Tab') {
        const all = items(), first = all[0], last = all.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); navButton.current?.focus(); };
  }, [navOpen]);

  // Global shortcuts: ⌘K search, ⌘B sidebar, ⇧⌘, details, ⌘N new bot.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const st = useStore.getState();
      const key = e.key.toLowerCase();
      if (key === 'k') { e.preventDefault(); st.setModal(st.modal === 'search' ? null : 'search'); }
      else if (key === 'b') { e.preventDefault(); st.set({ sidebarCollapsed: !st.sidebarCollapsed }); }
      else if (e.shiftKey && (key === ',' || key === '<')) { e.preventDefault(); st.set({ detailsOpen: !st.detailsOpen }); }
      else if (key === ',') { e.preventDefault(); useConfigUI.getState().openAppSettings(); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  return (
    <div className={`app${collapsed ? ' is-sidebar-collapsed' : ''}${navOpen ? ' is-nav-open' : ''}${detailsOpen && hasBot && view === 'chat' ? ' has-details' : ''}`}>
      <div className="mobile-topbar">
        <button ref={navButton} type="button" className="icon-btn" aria-label="Open conversations" aria-expanded={navOpen} aria-controls="workspace-sidebar" onClick={() => useStore.getState().set({ mobileNavOpen: true, sidebarCollapsed: false })}><Icon name="sidebar" size={22} /></button>
        <span className="mobile-brand"><img src="/icons/fino-mascot.png" alt="" />Fino</span>
        <button type="button" className="icon-btn" aria-label="Search conversations" onClick={() => useStore.getState().setModal('search')}><Icon name="search" size={21} /></button>
      </div>
      {navOpen && <button className="nav-backdrop" aria-label="Close conversations" onClick={() => useStore.getState().set({ mobileNavOpen: false })} />}
      <Sidebar />
      {view === 'tasks' ? <TasksView /> : <ChatView />}
      {detailsOpen && hasBot && view === 'chat' && <><button className="details-backdrop" aria-label="Close conversation details" onClick={() => useStore.getState().set({ detailsOpen: false })} /><DetailsPanel /></>}
      {modal === 'create' && <CreateBotModal />}
      {modal === 'group' && <CreateGroupModal />}
      {modal === 'search' && <SearchModal />}
      {modal === 'apps' && <ConnectAppsModal />}
      {viewerOpen && <ComputerViewer />}
      <ConfigLayer />
    </div>
  );
}

export function App() {
  const authChecked = useStore((s) => s.authChecked);
  const user = useStore((s) => s.user);
  useEffect(() => { useStore.getState().checkAuth(); }, []);
  if (!authChecked) return <div className="boot" />;
  return user ? <Shell /> : <SignIn />;
}
