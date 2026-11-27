import * as SecureStore from "expo-secure-store";
import type { Bot, User } from "../../../packages/contracts/src/types";
import { client } from "./session";
import type { BotTemplate } from "./catalog";

export const isInstalled = (t: BotTemplate, bots: Bot[]) => bots.some((b) => b.label === t.label);

/** Creates the bot, then adds each of its skills. Calls onSkill after every skill for progress UI. */
export async function installTemplate(t: BotTemplate, onSkill?: (done: number, total: number) => void) {
  const { bot } = await client.request<{ bot: Bot }>("POST", "/bots", {
    name: t.name,
    label: t.label,
    description: t.description,
    instructions: t.instructions,
    avatarShape: t.shape,
    avatarColor: t.color,
    mode: "personal",
  });
  let done = 0;
  for (const skill of t.skills) {
    await client.request("POST", `/bots/${bot.id}/skills`, skill);
    onSkill?.(++done, t.skills.length);
  }
  return bot;
}

// ---------- first-launch onboarding ----------
const key = (userId: string) => `fino.onboarded.${userId.replace(/[^\w.-]/g, "_")}`;

/** New accounts (only the primary bot, never onboarded on this device) get the setup flow. */
export async function needsOnboarding(user: User | null, bots: Bot[]) {
  if (!user || bots.length > 1) return false;
  try {
    return (await SecureStore.getItemAsync(key(user.id))) !== "1";
  } catch {
    return false;
  }
}
export async function markOnboarded(user: User | null) {
  if (!user) return;
  try {
    await SecureStore.setItemAsync(key(user.id), "1");
  } catch {
    /* Losing this flag only means the flow may show again. */
  }
}

export interface Profile {
  name: string;
  job: string;
  use: "personal" | "work";
  team?: string;
}
/** Tells the primary bot who the user is, so it can tailor its help from the first message. */
export async function rememberProfile(primary: Bot | undefined, p: Profile) {
  if (!primary) return;
  const parts = [
    p.name && `The user's name is ${p.name}.`,
    p.job && `They work as: ${p.job}.`,
    `They use Badr for ${p.use === "work" ? `work${p.team ? ` (${p.team} team)` : ""}` : "personal life"}.`,
  ].filter(Boolean);
  await client.request("POST", `/bots/${primary.id}/memories`, { text: parts.join(" ") }).catch(() => {});
}
