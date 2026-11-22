import { create } from "zustand";
import type {
  Bot,
  BotChat,
  Row,
  LiveState,
  ServerEvent,
  User,
} from "../../../packages/contracts/src/types";
import { EventDecoder, mergeRows } from "../../../packages/client/src";
import { client } from "./session";
import { t } from "./i18n";
const key = (id: string, generation: number) => `${id}:${generation}`;
let selectionRevision = 0;
interface State {
  user: User | null;
  bots: Bot[];
  live: Record<string, LiveState>;
  chats: Record<string, BotChat[]>;
  rows: Record<string, Row[]>;
  selected: string | null;
  generations: Record<string, number>;
  connected: boolean;
  error: string | null;
  refresh(): Promise<void>;
  select(id: string): Promise<void>;
  selectChat(id: string, generation: number): Promise<void>;
  newChat(id: string): Promise<void>;
  loadRows(id: string, generation: number): Promise<void>;
  event(event: ServerEvent): void;
  reset(): void;
}
export const useWorkspace = create<State>((set, get) => ({
  user: null,
  bots: [],
  live: {},
  chats: {},
  rows: {},
  selected: null,
  generations: {},
  connected: false,
  error: null,
  async refresh() {
    const [{ user }, { bots, live }] = await Promise.all([
      client.me(),
      client.bots(),
    ]);
    set({
      user,
      bots,
      live: Object.fromEntries(live.map((l) => [l.botId, l])),
      error: null,
    });
    const selected = get().selected;
    if (!selected || !bots.some((b) => b.id === selected)) {
      const bot = bots.find((b) => b.isPrimary) ?? bots[0];
      if (bot) await get().select(bot.id);
    } else await get().select(selected);
  },
  async select(id) {
    const revision = ++selectionRevision;
    set({ selected: id, error: null });
    const { chats } = await client.chats(id);
    if (revision !== selectionRevision) return;
    set((s) => ({ chats: { ...s.chats, [id]: chats } }));
    const generation =
      get().generations[id] ??
      chats.find((c) => c.isMain)?.generation ??
      chats[0]?.generation ??
      1;
    await get().selectChat(id, generation);
    void client.request("POST", `/bots/${id}/read`).catch(() => {});
  },
  async selectChat(id, generation) {
    ++selectionRevision;
    set((s) => ({
      selected: id,
      generations: { ...s.generations, [id]: generation },
    }));
    await get().loadRows(id, generation);
  },
  async newChat(id) {
    const { chat } = await client.createChat(id);
    const { chats } = await client.chats(id);
    set((s) => ({ chats: { ...s.chats, [id]: chats } }));
    await get().selectChat(id, chat.generation);
  },
  async loadRows(id, generation) {
    const result = await client.rows(id, generation);
    set((s) => ({
      rows: {
        ...s.rows,
        [key(id, generation)]: mergeRows(
          result.rows,
          s.rows[key(id, generation)] ?? [],
        ),
      },
    }));
  },
  event(event) {
    switch (event.type) {
      case "rows":
        set((s) => ({
          rows: {
            ...s.rows,
            [key(event.botId, event.generation)]: mergeRows(
              s.rows[key(event.botId, event.generation)] ?? [],
              event.rows,
            ),
          },
        }));
        if (
          event.rows.some(
            (row) => row.body.type === "message" && !row.body.streaming,
          )
        )
          void client
            .chats(event.botId)
            .then(({ chats }) =>
              set((s) => ({ chats: { ...s.chats, [event.botId]: chats } })),
            )
            .catch(() => {});
        break;
      case "live":
        set((s) => ({ live: { ...s.live, [event.state.botId]: event.state } }));
        break;
      case "bot":
        set((s) => ({
          bots: s.bots.some((b) => b.id === event.bot.id)
            ? s.bots.map((b) => (b.id === event.bot.id ? event.bot : b))
            : [...s.bots, event.bot],
        }));
        break;
      case "roster":
        void client
          .bots()
          .then(({ bots }) => set({ bots }))
          .catch(() => {});
        break;
      case "cleared":
        // A background bot starting a new chat must not steal the open chat.
        if (get().selected === event.botId)
          void get()
            .selectChat(event.botId, event.generation)
            .catch(() => {});
        else
          set((s) => ({
            generations: { ...s.generations, [event.botId]: event.generation },
          }));
        break;
    }
  },
  reset() {
    ++selectionRevision;
    set({
      user: null,
      bots: [],
      rows: {},
      live: {},
      chats: {},
      generations: {},
      selected: null,
      connected: false,
      error: null,
    });
  },
}));
export async function watchEvents(signal: AbortSignal) {
  let attempts = 0;
  while (!signal.aborted) {
    try {
      const response = await client.stream(signal);
      if (!response.ok) throw Error(t("Connection interrupted."));
      const reader = response.body?.getReader();
      if (!reader) throw Error(t("Streaming unavailable"));
      useWorkspace.setState({ connected: true });
      attempts = 0;
      const decoder = new TextDecoder(),
        events = new EventDecoder();
      try {
        while (!signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const event of events.push(
            decoder.decode(value, { stream: true }),
          ))
            useWorkspace.getState().event(event);
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
    } catch {
      if (signal.aborted) break;
    }
    useWorkspace.setState({ connected: false });
    if (signal.aborted) break;
    await new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", finish);
        resolve();
      };
      const timer = setTimeout(finish, Math.min(15000, 1000 * 2 ** attempts++));
      signal.addEventListener("abort", finish, { once: true });
    });
    if (!signal.aborted)
      await useWorkspace
        .getState()
        .refresh()
        .catch(() => {});
  }
}
export const rowKey = key;
