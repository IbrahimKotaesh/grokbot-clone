import { create } from "zustand";
import { router } from "expo-router";
import { client, qaEnabled } from "./session";

export type PlanId = "starter" | "pro" | "max" | "enterprise";
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

/**
 * Starts a purchase. The App Store build plugs RevenueCat in here (Purchases.purchasePackage);
 * the store then tells the server through its webhook, and the server changes the plan.
 * Local development switches plans directly so every plan can be tried.
 */
export async function purchase(plan: PlanId): Promise<"done" | "unavailable"> {
  if (qaEnabled()) {
    await client.request("POST", "/billing/dev-plan", { plan });
    await useBilling.getState().load();
    return "done";
  }
  return "unavailable";
}
