import type { Row } from "../../../packages/contracts/src/types";
export type ChatItem = { key: string; row: Row } | { key: string; work: Row[] };
// Keep messages and decisions in order; collapse only adjacent work telemetry.
export function chatTimeline(rows: Row[]): ChatItem[] {
  const items: ChatItem[] = [];
  for (const row of rows) {
    if ((row.body as { replaced?: boolean }).replaced) continue; // a reply the person asked to try again
    // The bot thinks first (the line under the chat shows it); its reply appears whole when it is done.
    if (row.body.type === "message" && row.body.role === "assistant" && row.body.streaming) continue;
    if (row.body.type === "tool-call" && (row.body.name === "update_plan" || row.body.name === "react_to_message")) continue;
    const key = `${row.generation}:${row.seq}`;
    if (["tool-call", "event", "notice"].includes(row.body.type)) {
      const previous = items[items.length - 1];
      if (previous && "work" in previous) previous.work.push(row);
      else items.push({ key, work: [row] });
    } else items.push({ key, row });
  }
  return items;
}
