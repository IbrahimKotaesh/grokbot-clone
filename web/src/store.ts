import { t } from './lib/i18n';
import { create } from 'zustand';
import type { Bot, BotChat, ComputerState, LiveState, Routine, Row, ServerEvent, User } from '@shared/types';
import { api } from './lib/api';

export type ModalKind = 'create' | 'search' | 'apps' | 'group' | null;

interface Transcript { generation: number; bySeq: Record<number, Row>; loaded: boolean }

interface State {
  user: User | null;
  devLogin: boolean;
  googleLogin: boolean;
  localAccount: {email:string;name:string} | null;
  authChecked: boolean;
  accessLocked: boolean;

  bots: Bot[];
  live: Record<string, LiveState>;
  selectedBotId: string | null;
  transcripts: Record<string, Transcript>;
  chats:Record<string,BotChat[]>;
  selectedChats:Record<string,number>;
  routines: Record<string, Routine[]>;
  computer: ComputerState | null;
  /** Bumped on every `connections` event so open views can refetch. */
  connectionsVersion: number;
  sseConnected: boolean;

  detailsOpen: boolean;
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  modal: ModalKind;
  viewerOpen: boolean;

  checkAuth(): Promise<void>;
  loadBots(): Promise<void>;
  selectBot(id: string): void;
  loadRows(id: string,generation?:number): Promise<void>;
  loadChats(id:string):Promise<void>;
  selectChat(id:string,generation:number):void;
  newChat(id:string):Promise<BotChat>;
  loadRoutines(id: string): Promise<void>;
  loadComputer(): Promise<void>;
  upsertRows(botId: string, generation: number, rows: Row[]): void;
  handleEvent(ev: ServerEvent): void;
  setModal(m: ModalKind): void;
  set(p: Partial<State>): void;
}

export const transcriptKey=(botId:string,generation:number)=>`${botId}:${generation}`;
const LS_CHATS='fino.selectedChats';
const LS_SELECTED = 'grokbot.selectedBot';
const LS_DETAILS = 'fino.computerPanel'; // the right-side computer panel: open unless hidden
const LS_SIDEBAR = 'grokbot.sidebarCollapsed';
const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

const savedChats=():Record<string,number>=>{try{const raw=JSON.parse(lsGet(LS_CHATS)??'{}');return Object.fromEntries(Object.entries(raw).filter(([k,v])=>typeof k==='string'&&Number.isSafeInteger(v)&&Number(v)>0).map(([k,v])=>[k,Number(v)]));}catch{return {};}};
export const useStore = create<State>((set, get) => ({
  user: null,
  devLogin: false,
  googleLogin: false,
  localAccount: null,
  authChecked: false,
  accessLocked:false,
  bots: [],
  live: {},
  selectedBotId: lsGet(LS_SELECTED),
  transcripts: {},
  chats:{},selectedChats:savedChats(),
  routines: {},
  computer: null,
  connectionsVersion: 0,
  sseConnected: false,
  detailsOpen: !window.matchMedia('(max-width: 900px)').matches && lsGet(LS_DETAILS) !== '0',
  sidebarCollapsed: lsGet(LS_SIDEBAR) === '1',
  mobileNavOpen: false,
  modal: null,
  viewerOpen: false,

  async checkAuth() {
    try {
      const access=await fetch('/api/access/status',{credentials:'include'}).then(r=>r.json());
      if(access.required&&!access.unlocked){set({user:null,accessLocked:true,authChecked:true});return;}
      const { user, devLogin, googleLogin, localAccount } = await api.me();
      set({ user, devLogin, googleLogin, localAccount, authChecked: true,accessLocked:false });
    } catch {
      set({ user: null, authChecked: true });
    }
  },

  async loadBots() {
    const { bots, live } = await api.bots();
    const liveMap: Record<string, LiveState> = {};
    for (const l of live) liveMap[l.botId] = l;
    const params=new URLSearchParams(location.search);
    const sel = params.get('bot')??get().selectedBotId;const requestedChat=Number(params.get('chat'));
    if(sel&&params.has('chat')&&Number.isSafeInteger(requestedChat)&&requestedChat>0)get().selectChat(sel,requestedChat);
    if(params.has('notification')){void fetch('/api/push/notifications/read',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:params.get('notification')})});}
    if(params.has('bot')||params.has('notification')){params.delete('bot');params.delete('notification');params.delete('chat');history.replaceState(null,'',location.pathname+(params.size?'?'+params.toString():'')+location.hash);}
    const selectedBotId = sel && bots.some((b) => b.id === sel) ? sel : (bots.find((b) => b.isPrimary) ?? bots[0])?.id ?? null;
    set({ bots, live: liveMap });
    if (selectedBotId !== get().selectedBotId || !get().transcripts[transcriptKey(selectedBotId??'',get().selectedChats[selectedBotId??'']??bots.find(b=>b.id===selectedBotId)?.generation??1)]) {
      if (selectedBotId) get().selectBot(selectedBotId);
    }
  },

  selectBot(id) {
    set({ selectedBotId: id, mobileNavOpen: false });
    lsSet(LS_SELECTED, id);
    const generation=get().selectedChats[id]??get().bots.find(b=>b.id===id)?.generation??1;
    get().loadChats(id).catch(console.error);
    get().loadRows(id,generation).catch(console.error);
    get().loadRoutines(id).catch(console.error);
    const bot = get().bots.find((b) => b.id === id);
    if (bot?.unread) api.markRead(id).catch(() => {});
  },

  async loadRows(id,requestedGeneration) {
    const target=requestedGeneration??get().selectedChats[id]??get().bots.find(b=>b.id===id)?.generation;
    const { generation, rows } = await api.rows(id,target);
    const key=transcriptKey(id,generation);
    const bySeq: Record<number, Row> = {};
    for (const r of rows) bySeq[r.seq] = r;
    // Merge with anything that streamed in while we were fetching.
    const prev = get().transcripts[key];
    if (prev && prev.generation === generation) {
      for (const r of Object.values(prev.bySeq)) if (!bySeq[r.seq] || bySeq[r.seq].updatedSeq < r.updatedSeq) bySeq[r.seq] = r;
    }
    set((s) => ({ transcripts: { ...s.transcripts, [key]: { generation, bySeq, loaded: true } } }));
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('fixtures')) {
      import('./dev/fixtures').then((m) => m.injectFixtures());
    }
  },

  async loadChats(id){
    const {chats}=await api.chats(id);set(s=>({chats:{...s.chats,[id]:chats}}));
    const selected=get().selectedChats[id],fallback=chats.find(c=>c.isMain)??chats[0];
    if(fallback&&(!selected||!chats.some(c=>c.generation===selected)))get().selectChat(id,fallback.generation);
  },
  selectChat(id,generation){
    const selectedChats={...get().selectedChats,[id]:generation};set({selectedChats});lsSet(LS_CHATS,JSON.stringify(selectedChats));
    get().loadRows(id,generation).catch(console.error);
  },
  async newChat(id){const {chat}=await api.createChat(id);await get().loadChats(id);get().selectChat(id,chat.generation);return chat;},

  async loadRoutines(id) {
    const { routines } = await api.routines(id);
    set((s) => ({ routines: { ...s.routines, [id]: routines } }));
  },

  async loadComputer() {
    const { computer } = await api.computer();
    set({ computer });
  },

  upsertRows(botId,generation,rows){
    const key=transcriptKey(botId,generation);
    set(s=>{const base=s.transcripts[key]??{generation,bySeq:{},loaded:false},bySeq={...base.bySeq};
      for(const r of rows){const cur=bySeq[r.seq];if(!cur||r.updatedSeq>=cur.updatedSeq)bySeq[r.seq]=r;}
      return {transcripts:{...s.transcripts,[key]:{...base,bySeq}}};
    });
  },

  handleEvent(ev) {
    const s = get();
    switch (ev.type) {
      case 'hello':
      case 'ping':
        return;
      case 'rows':
        s.upsertRows(ev.botId, ev.generation, ev.rows);
        if(ev.rows.some(r=>r.body.type==='message'&&!r.body.streaming))void s.loadChats(ev.botId).catch(()=>{});
        return;
      case 'cleared':
        set((st) => ({bots:st.bots.map(b=>b.id===ev.botId?{...b,generation:ev.generation}:b), transcripts: { ...st.transcripts, [transcriptKey(ev.botId,ev.generation)]: { generation: ev.generation, bySeq: {}, loaded: true } } }));
        s.selectChat(ev.botId,ev.generation);void s.loadChats(ev.botId).catch(()=>{});
        return;
      case 'live':
        set((st) => ({ live: { ...st.live, [ev.state.botId]: ev.state } }));
        return;
      case 'roster':
        s.loadBots().catch(console.error);
        return;
      case 'bot': {
        const exists = s.bots.some((b) => b.id === ev.bot.id);
        // Opening a bot marks it read; keep the open bot at 0 unread.
        if (ev.bot.id === s.selectedBotId && ev.bot.unread > 0 && document.visibilityState === 'visible') api.markRead(ev.bot.id).catch(() => {});
        set((st) => ({ bots: exists ? st.bots.map((b) => (b.id === ev.bot.id ? ev.bot : b)) : [...st.bots, ev.bot] }));
        return;
      }
      case 'computer':
        set({ computer: ev.state });
        return;
      case 'routines':
        if (s.routines[ev.botId] || ev.botId === s.selectedBotId) s.loadRoutines(ev.botId).catch(console.error);
        return;
      case 'notifications':
      case 'tasks':
      case 'memories':
        // Picked up by configStore.ts (Tasks view, Library/Tasks tabs, bot settings).
        window.dispatchEvent(new CustomEvent('grokbot:event', { detail: ev }));
        return;
      case 'connections':
        set((st) => ({ connectionsVersion: st.connectionsVersion + 1 }));
        return;
    }
  },

  setModal(modal) { set({ modal }); },

  set(p) {
    if (p.detailsOpen !== undefined) lsSet(LS_DETAILS, p.detailsOpen ? '1' : '0');
    if (p.sidebarCollapsed !== undefined) lsSet(LS_SIDEBAR, p.sidebarCollapsed ? '1' : '0');
    set(p);
  },
}));

/** Rows for a bot, ordered by seq. */
export function sortedRows(t: Transcript | undefined): Row[] {
  if (!t) return [];
  return Object.values(t.bySeq).sort((a, b) => a.seq - b.seq);
}

export const displayName = (b: Pick<Bot, 'name' | 'label'>) => (b.label ? `${b.name} · ${t(b.label)}` : b.name);

export function useSelectedBot(): Bot | undefined {
  return useStore((s) => s.bots.find((b) => b.id === s.selectedBotId));
}
