import type { Bot, LiveState } from "../../../packages/contracts/src/types";
import { t, lang } from "./i18n";

export function relativeTime(ts: number | null | undefined) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return t("now");
  if (min < 60) return t("{n}m", { n: min });
  const h = Math.round(min / 60);
  if (h < 24) return t("{n}h", { n: h });
  const d = Math.round(h / 24);
  if (d < 7) return t("{n}d", { n: d });
  return new Date(ts).toLocaleDateString(lang, { month: "short", day: "numeric" });
}

export function botStatus(bot: Bot, live?: LiveState) {
  if (live?.awaiting) return "attention" as const;
  if (live?.isRunning) return "working" as const;
  if (bot.unread > 0) return "unread" as const;
  return null;
}

const activityLabels: Record<string, string> = {
  thinking: t("Thinking…"),
  working: t("Working…"),
  searching_web: t("Searching the web"),
  reading_web: t("Reading the web"),
  browsing_web: t("Browsing the web"),
  on_its_computer: t("Using its computer"),
  running_commands: t("Running commands"),
  waiting_on_command: t("Waiting on a command"),
  messaging_named: t("Sending a message"),
  connecting_service: t("Connecting an app"),
  waiting_for_you: t("Waiting for you"),
  drafting_file: t("Drafting a file"),
  remembering: "Remembering",
};
export const usesComputer = (live?: LiveState) =>
  !!live?.isRunning && ["on_its_computer", "browsing_web", "running_commands"].includes(live.activity?.kind ?? "");

export function statusLine(bot: Bot, live?: LiveState) {
  if (live?.awaiting) return t("Needs your approval");
  if (live?.isRunning) {
    const kind = live.activity?.kind;
    return live.activity?.detail || (kind && activityLabels[kind]) || t("Working…");
  }
  return bot.label ? t(bot.label) : t("Ready");
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
