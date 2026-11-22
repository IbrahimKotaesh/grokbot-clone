import { create } from "zustand";
import { router } from "expo-router";
import { client, qaEnabled } from "./session";
import { useWorkspace } from "./store";
import { buyPlan, configurePurchases, restorePurchases } from "./purchases";

export type PlanId = "free" | "starter" | "pro" | "max" | "enterprise";
export interface Plan {
  id: PlanId;
  name: string;
  priceUsd: number | null;
  bots: number | null;
  computer: boolean;
  computerHours: number | null;
  voiceMinutes: number | null;
  marketplace: "personal" | "all";
  highlights: string[];
}
export interface BillingSummary {
  plan: PlanId;
  renewsAt: number | null;
  plans: Plan[];
  usage: { bots: number; computerMinutes: number };
}

interface State {
  summary: BillingSummary | null;
  load(): Promise<void>;
}
export const useBilling = create<State>((set) => ({
  summary: null,
  async load() {
    set({ summary: await client.request<BillingSummary>("GET", "/billing") });
  },
}));

export const currentPlan = (s: BillingSummary | null) => s?.plans.find((p) => p.id === s.plan) ?? null;
/** True until we know otherwise, so a slow load never locks a paying user out. */
export const hasComputer = (s: BillingSummary | null) => currentPlan(s)?.computer ?? true;

export function openUpgrade(feature?: "computer" | "bots" | "voice") {
  router.push({ pathname: "/upgrade", params: feature ? { feature } : {} });
}

/** Turns a server plan-limit error into the upgrade screen. Returns true if it handled the error. */
export function handlePlanLimit(e: unknown) {
  const err = e as { code?: string; message?: string };
  if (err?.code !== "plan_limit") return false;
  const feature = /computer/i.test(err.message ?? "") ? "computer" : /bot/i.test(err.message ?? "") ? "bots" : undefined;
  openUpgrade(feature);
  return true;
}

/** Waits for the store webhook to reach the server and change the plan (usually a few seconds). */
async function waitForPlan(plan: PlanId, timeoutMs = 20000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    await useBilling.getState().load().catch(() => {});
    if (useBilling.getState().summary?.plan === plan) return true;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

/**
 * Starts a purchase through the App Store (RevenueCat). The store tells the server through its
 * webhook and the server changes the plan. Local development switches plans directly.
 */
export async function purchase(plan: PlanId): Promise<"done" | "pending" | "cancelled" | "unavailable"> {
  if (qaEnabled()) {
    await client.request("POST", "/billing/dev-plan", { plan });
    await useBilling.getState().load();
    return "done";
  }
  const user = useWorkspace.getState().user;
  if (!user || !(await configurePurchases(user.id))) return "unavailable";
  const r = await buyPlan(plan);
  if (r === "cancelled") return "cancelled";
  return (await waitForPlan(plan)) ? "done" : "pending";
}

export async function restore(): Promise<"restored" | "none" | "unavailable"> {
  const user = useWorkspace.getState().user;
  if (!user || !(await configurePurchases(user.id))) return "unavailable";
  const active = await restorePurchases();
  await useBilling.getState().load().catch(() => {});
  return active.length ? "restored" : "none";
}
