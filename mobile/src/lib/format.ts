import type { Bot, LiveState } from "../../../packages/contracts/src/types";

export function relativeTime(ts: number | null | undefined) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function botStatus(bot: Bot, live?: LiveState) {
  if (live?.awaiting) return "attention" as const;
  if (live?.isRunning) return "working" as const;
  if (bot.unread > 0) return "unread" as const;
  return null;
}

const activityLabels: Record<string, string> = {
  thinking: "Thinking…",
  working: "Working…",
  searching_web: "Searching the web",
  reading_web: "Reading the web",
  browsing_web: "Browsing the web",
  on_its_computer: "Using its computer",
  running_commands: "Running commands",
  waiting_on_command: "Waiting on a command",
  messaging_named: "Sending a message",
  connecting_service: "Connecting an app",
  waiting_for_you: "Waiting for you",
  drafting_file: "Drafting a file",
  remembering: "Remembering",
};
export const usesComputer = (live?: LiveState) =>
  !!live?.isRunning && ["on_its_computer", "browsing_web", "running_commands"].includes(live.activity?.kind ?? "");

export function statusLine(bot: Bot, live?: LiveState) {
  if (live?.awaiting) return "Needs your approval";
  if (live?.isRunning) {
    const kind = live.activity?.kind;
    return live.activity?.detail || (kind && activityLabels[kind]) || "Working…";
  }
  return bot.label || "Ready";
}

/** One clean line for list previews: no Markdown syntax (tables, headings, bold, links, code). */
export function plainPreview(text: string | null | undefined) {
  if (!text) return "";
  return text
    .split("\n")
    .filter((l) => !/^\s*\|?\s*:?-{2,}/.test(l)) // table separator rows
    .map((l) =>
      l
        .replace(/^\s*\|(.*)\|\s*$/, (_, row: string) => row.split("|").map((c) => c.trim()).filter(Boolean).join(" · "))
        .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/, ""),
    )
    .join(" ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|\*|_|~~|`{1,3})(.+?)\1/g, "$2")
    .replace(/\s+/g, " ")
    .trim();
}
