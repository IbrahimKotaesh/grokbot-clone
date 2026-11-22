// App Store subscriptions through RevenueCat.
//
// Setup (once): in RevenueCat create entitlements `starter`, `pro`, `max`, attach the App Store
// products to them, put the three packages in the current offering, and set the webhook to
// <server>/api/billing/webhook with REVENUECAT_WEBHOOK_SECRET as its Authorization header.
// The app identifies each buyer by their Fino user id, so the webhook knows whose plan to change.
import { Platform } from "react-native";
import Purchases, { LOG_LEVEL, type PurchasesPackage } from "react-native-purchases";
import { t } from "./i18n";

const KEY = Platform.OS === "ios" ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
let configuredFor: string | null = null;

export const purchasesAvailable = () => !!KEY;

export async function configurePurchases(userId: string) {
  if (!KEY) return false;
  if (configuredFor === userId) return true;
  if (configuredFor === null) {
    if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.WARN);
    Purchases.configure({ apiKey: KEY, appUserID: userId });
  } else await Purchases.logIn(userId);
  configuredFor = userId;
  return true;
}

export async function resetPurchases() {
  if (configuredFor === null) return;
  await Purchases.logOut().catch(() => {});
  configuredFor = null;
}

/** The package for a plan: identified by package id, entitlement-style product id, or product id containing the plan. */
async function packageFor(plan: string): Promise<PurchasesPackage | null> {
  const offerings = await Purchases.getOfferings();
  const all = offerings.current?.availablePackages ?? [];
  return (
    all.find((p) => p.identifier.toLowerCase() === plan) ??
    all.find((p) => p.product.identifier.toLowerCase().split(/[._-]/).includes(plan)) ??
    null
  );
}

/** Localised price string per plan, from the App Store. */
export async function storePrices(): Promise<Record<string, string>> {
  if (!configuredFor) return {};
  try {
    const out: Record<string, string> = {};
    for (const plan of ["starter", "pro", "max"]) {
      const pkg = await packageFor(plan);
      if (pkg) out[plan] = pkg.product.priceString;
    }
    return out;
  } catch {
    return {};
  }
}

/** Returns "done", "cancelled", or throws with a readable message. */
export async function buyPlan(plan: string): Promise<"done" | "cancelled"> {
  const pkg = await packageFor(plan);
  if (!pkg) throw Error(t("This plan isn't available in the App Store yet."));
  try {
    await Purchases.purchasePackage(pkg);
    return "done";
  } catch (e) {
    if ((e as { userCancelled?: boolean }).userCancelled) return "cancelled";
    throw Error((e as Error).message || t("The purchase didn't go through."));
  }
}

export async function restorePurchases() {
  const info = await Purchases.restorePurchases();
  return Object.keys(info.entitlements.active);
}
