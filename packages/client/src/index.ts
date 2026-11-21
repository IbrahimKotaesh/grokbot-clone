import type {
  Bot,
  BotChat,
  LiveState,
  Row,
  ServerEvent,
  User,
} from "../../contracts/src/types";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}
export interface Attachment {
  name: string;
  dataUrl: string;
}
export function createClient(
  baseUrl: string,
  transport: typeof fetch,
  headers: () => Record<string, string>,
) {
  const base = new URL(baseUrl);
  if (
    base.protocol !== "https:" &&
    !["127.0.0.1", "localhost", "10.0.2.2"].includes(base.hostname)
  )
    throw Error("Use an HTTPS server.");
  const request = async <T>(
    method: string,
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> => {
    const controller=new AbortController();
    const timeout=signal?null:setTimeout(()=>controller.abort(),45_000);
    try{
      const response=await transport(`${base.origin}/api${path}`,{method,headers:{...headers(),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:signal??controller.signal});
      if(!response.ok){const data=await response.json().catch(()=>({}));throw new ApiError(response.status,data.error??'Unable to complete this request.',data.code);}
      return response.status===204?undefined as T:await response.json();
    }catch(error){if(controller.signal.aborted)throw new ApiError(0,'The server took too long to respond. Check your connection and try again.');throw error;}
    finally{if(timeout)clearTimeout(timeout);}

  };
  return {
    base: base.origin,
    request,
    me: () =>
      request<{ user: User | null; devLogin: boolean; googleLogin: boolean }>(
        "GET",
        "/auth/me",
      ),
    bots: () => request<{ bots: Bot[]; live: LiveState[] }>("GET", "/bots"),
    rows: (id: string, generation: number) =>
      request<{ generation: number; rows: Row[] }>(
        "GET",
        `/bots/${id}/rows?generation=${generation}`,
      ),
    chats: (id: string) =>
      request<{ chats: BotChat[] }>("GET", `/bots/${id}/chats`),
    createChat: (id: string) =>
      request<{ chat: BotChat }>("POST", `/bots/${id}/chats`, {}),
    send: (
      id: string,
      generation: number,
      text: string,
      images: Attachment[] = [],
      files: Attachment[] = [],
    ) =>
      request<{ row: Row }>("POST", `/bots/${id}/messages`, {
        text,
        generation,
        images,
        files,
      }),
    patchBot: (id: string, patch: Partial<Bot>) =>
      request<{ bot: Bot }>("PATCH", `/bots/${id}`, patch),
    stream: (signal: AbortSignal) =>
      transport(`${base.origin}/api/events`, {
        headers: { ...headers(), Accept: "text/event-stream" },
        signal,
      }),
  };
}
/** Incremental, CRLF-safe SSE decoder. Chunks can split JSON and UTF-8 anywhere. */
export class EventDecoder {
  private pending = "";
  push(chunk: string): ServerEvent[] {
    this.pending += chunk;
    const events: ServerEvent[] = [];
    let match: RegExpExecArray | null;
    while ((match = /\r?\n\r?\n/.exec(this.pending))) {
      const block = this.pending.slice(0, match.index);
      this.pending = this.pending.slice(match.index + match[0].length);
      const data = block
        .split(/\r?\n/)
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart())
        .join("\n");
      if (data)
        try {
          events.push(JSON.parse(data));
        } catch {
          /* Ignore a malformed event, not the connection. */
        }
    }
    return events;
  }
}
export function mergeRows(previous: Row[], incoming: Row[]): Row[] {
  const map = new Map(previous.map((r) => [r.seq, r]));
  for (const row of incoming) {
    const old = map.get(row.seq);
    if (!old || row.updatedSeq > old.updatedSeq) map.set(row.seq, row);
  }
  return [...map.values()].sort((a, b) => a.seq - b.seq);
}
