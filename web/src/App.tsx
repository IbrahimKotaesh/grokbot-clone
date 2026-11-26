import { billingReturn } from './components/config/PlanSection';
import { Phone } from 'lucide-react';
import { isCallActive, startCall, useVoice } from './voice/call';
import { t } from './lib/i18n';
import {isMacDesktop,openDesktopComputer,notifyDesktopContext} from './lib/desktop';
import {AccessCodeGate} from './components/AccessCode';
import {BotAvatarFor} from './avatar/BotAvatar';
import { useEffect, useRef, useState } from 'react';
import { startEvents } from './lib/events';
import { useStore } from './store';
import { ChatView } from './components/ChatView';
import { ComputerViewer } from './components/ComputerViewer';
import { ComputerPanel } from './components/ComputerPanel';
import { Sidebar } from './components/Sidebar';
import { SignIn } from './components/SignIn';
import { ConnectAppsModal } from './components/modals/ConnectAppsModal';
import { CreateBotModal } from './components/modals/CreateBotModal';
import { CreateGroupModal } from './components/modals/CreateGroupModal';
import { SearchModal } from './components/modals/SearchModal';
import { ConfigLayer } from './components/config/ConfigLayer';
import { WorkflowView } from './components/WorkflowView';
import { CalendarView } from './components/CalendarView';
import { useConfigUI } from './configStore';
import { Icon } from './components/Icon';
import { Onboarding, onboardingDone } from './components/Onboarding';
import { Landing, MacOffer } from './components/Landing';
import { ResizeHandle, restoreColumnWidths } from './components/ResizeHandle';
import { FinishToast } from './components/FinishToast';
import { CallScreen } from './components/CallScreen';
import { PlanGate, cameFromGate } from './components/PlanGate';
import { Badr } from './components/Badr';
restoreColumnWidths();

function Shell() {
  const detailsOpen = useStore((s) => s.detailsOpen);
  const calling = useVoice((s) => isCallActive(s));
  const modal = useStore((s) => s.modal);
  const viewerOpen = useStore((s) => s.viewerOpen);
  const collapsed = useStore((s) => s.sidebarCollapsed);
  const selectedBot = useStore(s=>s.bots.find(b=>b.id===s.selectedBotId));
  const hasBot = useStore((s) => !!s.selectedBotId);
  // The Mac app shows its own Fino Browser panel on the right, so the web panel stays out of it.
  const showPanel = detailsOpen && hasBot && selectedBot?.kind !== 'room' && !isMacDesktop();
  const navOpen = useStore((s) => s.mobileNavOpen);
  const navButton = useRef<HTMLButtonElement>(null);
  const [showOnboarding, setShowOnboarding] = useState(() => !onboardingDone());
  const [needsAI, setNeedsAI] = useState(false);
  const [aiChecked, setAiChecked] = useState(false);
  const bots = useStore((s) => s.bots);
  // A customer on a public server whose bots have no AI yet gets setup again, until they connect one.
  useEffect(() => {
    if (!bots.length) return;
    if (bots.some((b) => b.agentProvider === 'openrouter')) { setNeedsAI(false); setAiChecked(true); return; }
    fetch('/api/credentials', { credentials: 'include' }).then((r) => r.json())
      .then((r: { credentials: { connected: boolean }[]; sharedLogin: boolean }) => {
        const missing = !r.sharedLogin && !r.credentials.some((c) => c.connected);
        setNeedsAI(missing);
        if (missing) setShowOnboarding(true);
      }).catch(() => {}).finally(() => setAiChecked(true));
  }, [bots.length]);
  const view = useConfigUI((s) => s.view);
  // Back from Stripe Checkout: show the Plan page, which says whether the payment went through.
  // A first plan picked on the plan screen goes straight to the team instead.
  useEffect(() => { if (billingReturn && !cameFromGate) useConfigUI.getState().openAppSettings('plan'); }, []);
  const screenOnly=new URLSearchParams(location.search).get('desktop_view')==='1';
  useEffect(()=>notifyDesktopContext(selectedBot?.id),[selectedBot?.id]);
  useEffect(()=>{if(viewerOpen&&isMacDesktop()&&openDesktopComputer(selectedBot?.id))useStore.getState().set({viewerOpen:false});},[viewerOpen,selectedBot?.id]);

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
        if(botId&&useStore.getState().bots.some(b=>b.id===botId)){const generation=Number(url.searchParams.get('chat'));if(Number.isSafeInteger(generation)&&generation>0)useStore.getState().selectChat(botId,generation);useStore.getState().selectBot(botId);useConfigUI.getState().closeAppSettings();useConfigUI.getState().setView('chat');useStore.getState().set({viewerOpen:false});}
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

  if(screenOnly)return <div className="desktop-computer-shell"><ComputerViewer docked/></div>;
  return (
    <div className={`app${collapsed ? ' is-sidebar-collapsed' : ''}${navOpen ? ' is-nav-open' : ''}${showPanel && view === 'chat' ? ' has-computer' : ''}`}>
      <div className="mobile-topbar">
        <button ref={navButton} type="button" className="icon-btn" aria-label={t("Open conversations")} aria-expanded={navOpen} aria-controls="workspace-sidebar" onClick={() => useStore.getState().set({ mobileNavOpen: true, sidebarCollapsed: false })}><Icon name="sidebar" size={22} /></button>
        {view !== 'chat' ? <span className="mobile-brand"><span>{view === 'workflow' ? t('Workflow') : t('Calendar')}</span></span> : <button type="button" className="mobile-brand" onClick={()=>selectedBot&&useConfigUI.getState().openBotSettings(selectedBot.id)} aria-label={selectedBot?`${selectedBot.name} settings`:t("Conversations")}>{selectedBot&&<BotAvatarFor bot={selectedBot} size={28}/>}<span>{selectedBot?selectedBot.name:t("Conversations")}</span></button>}
        {view === 'chat' && selectedBot && selectedBot.kind !== 'room' ? <span className="mobile-topbar__right">
          {!calling && <button type="button" className="icon-btn" aria-label={t("Call {name}", { name: selectedBot.name })} onClick={() => startCall(selectedBot.id)}><Phone size={20} strokeWidth={1.9} /></button>}
          {!isMacDesktop() && <button type="button" className="icon-btn" aria-label={t("Show computer")} aria-pressed={detailsOpen} onClick={() => useStore.getState().set({detailsOpen:!detailsOpen})}><Icon name="monitor" size={21}/></button>}
        </span> : <span className="mobile-topbar__spacer" />}
      </div>
      <button className="nav-backdrop" tabIndex={navOpen?0:-1} aria-hidden={!navOpen} aria-label={t("Close conversations")} onClick={() => useStore.getState().set({ mobileNavOpen: false })} />
      <Sidebar />
      {!collapsed && <ResizeHandle edge="sidebar" />}
      {view === 'workflow' ? <WorkflowView /> : view === 'calendar' ? <CalendarView /> : <ChatView />}
      {showPanel && view === 'chat' && <ResizeHandle edge="panel" />}
      {showPanel && view === 'chat' && <ComputerPanel />}
      {modal === 'create' && <CreateBotModal />}
      {modal === 'group' && <CreateGroupModal />}
      {modal === 'search' && <SearchModal />}
      {modal === 'apps' && <ConnectAppsModal />}
      {viewerOpen && !isMacDesktop() && <ComputerViewer />}
      <ConfigLayer />
      <FinishToast />
      <CallScreen />
      {showOnboarding && aiChecked && <Onboarding requireAI={needsAI} onClose={() => { setShowOnboarding(false); setNeedsAI(false); }} />}
      {!showOnboarding && aiChecked && !isMacDesktop() && <MacOffer />}
    </div>
  );
}

export function App() {
  const authChecked = useStore((s) => s.authChecked);
  const accessLocked=useStore(s=>s.accessLocked);
  const user = useStore((s) => s.user);
  // The public landing page greets web visitors; the Mac app keeps its own sign-in screen.
  // A sign-in error from Google, or a password-reset link, opens the sign-in screen directly.
  const [signingIn, setSigningIn] = useState(() => (p => p.has('login') || p.has('reset'))(new URLSearchParams(location.search)));
  const [signInMode, setSignInMode] = useState<'signin' | 'signup'>('signin');
  useEffect(() => { useStore.getState().checkAuth(); }, []);
  if (!authChecked) return <div className="boot"><Badr mood="hop" size={64} /></div>;
  const web = !isMacDesktop();
  // /welcome shows the landing page to signed-in people too (its buttons then open the workspace).
  if (web && user && location.pathname === '/welcome') return <Landing signedIn onSignIn={() => {}} />;
  if (user) return <PlanGate><Shell /></PlanGate>;
  if (web && !signingIn) return <Landing signedIn={false} onSignIn={(mode) => {
    history.replaceState(null, '', '/');
    setSignInMode(mode);
    setSigningIn(true);
  }} />;
  return accessLocked ? <AccessCodeGate/> : <SignIn initial={signInMode} />;
}
