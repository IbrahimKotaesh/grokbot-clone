import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { fetch as nativeFetch } from "expo/fetch";
import { createClient } from "../../../packages/client/src";
const server =
  process.env.EXPO_PUBLIC_API_URL ?? "https://grokbot.89-167-54-211.sslip.io";
const key = "fino.native.session.v1." + new URL(server).hostname;
let session = "",
  access = "";
export const client = createClient(
  server,
  ((url, options) =>
    nativeFetch(url, { ...options, credentials: "omit" })) as typeof fetch,
  () => ({
    ...(session ? { Authorization: `Bearer ${session}` } : {}),
    ...(access ? { Cookie: access } : {}),
  }),
);
export const authHeaders = () => ({
  ...(session ? { Authorization: `Bearer ${session}` } : {}),
  ...(access ? { Cookie: access } : {}),
});
export async function restoreSession() {
  try {
    const data = await SecureStore.getItemAsync(key);
    if (data) {
      const saved = JSON.parse(data);
      session = typeof saved.session === "string" ? saved.session : "";
      access = typeof saved.access === "string" ? saved.access : "";
    }
  } catch {
    session = "";
    access = "";
  }
}
async function persist() {
  await SecureStore.setItemAsync(key, JSON.stringify({ session, access }), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}
export async function unlock(code: string) {
  const response = await nativeFetch(`${client.base}/api/access/unlock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!response.ok) {
    const data = await response.json();
    throw Error(data.error ?? "Unable to unlock.");
  }
  const cookie = response.headers
    .get("set-cookie")
    ?.match(/fino_access=([^;]+)/)?.[1];
  if (!cookie) throw Error("The server did not return an access session.");
  access = `fino_access=${cookie}`;
  await persist();
}
export async function googleLogin() {
  const random = Crypto.getRandomBytes(32);
  const verifier = Array.from(random, (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  const challenge = (
    await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      verifier,
      { encoding: Crypto.CryptoEncoding.BASE64 },
    )
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const result = await WebBrowser.openAuthSessionAsync(
    `${client.base}/api/auth/google/start?native_challenge=${challenge}`,
    "fino://auth",
  );
  if (result.type !== "success") return false;
  const callback = new URL(result.url);
  if (
    callback.protocol !== "fino:" ||
    callback.hostname !== "auth" ||
    !callback.searchParams.get("code")
  )
    throw Error("The sign-in callback was not valid.");
  const data = await client.request<{ session: string }>(
    "POST",
    "/auth/native/session",
    { code: callback.searchParams.get("code"), verifier },
  );
  session = data.session;
  await persist();
  return true;
}
/** Sign in with Apple: the server verifies Apple's identity token and returns a session. */
export async function appleLogin(): Promise<boolean> {
  const AppleAuthentication = await import("expo-apple-authentication");
  let credential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
    });
  } catch (e) {
    if ((e as { code?: string }).code === "ERR_REQUEST_CANCELED") return false;
    throw e;
  }
  if (!credential.identityToken) throw Error("Apple didn't return a sign-in token. Please try again.");
  const fullName = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(" ");
  const data = await client.request<{ session: string }>("POST", "/auth/apple", { identityToken: credential.identityToken, fullName });
  session = data.session;
  await persist();
  return true;
}
// Dev only: a debug build pointed at a loopback server with EXPO_PUBLIC_MOBILE_QA=1.
export function qaEnabled() {
  return (
    __DEV__ &&
    process.env.EXPO_PUBLIC_MOBILE_QA === "1" &&
    ["127.0.0.1", "localhost", "10.0.2.2"].includes(
      new URL(client.base).hostname,
    )
  );
}
export async function qaLogin() {
  if (!qaEnabled()) throw Error("Unavailable");
  const data = await client.request<{ session: string }>("POST", "/auth/dev", {
    email: process.env.EXPO_PUBLIC_MOBILE_QA_EMAIL || "mobile-qa@fino.local",
    name: "Mobile QA",
    native: true,
  });
  session = data.session;
  await persist();
}
export async function logout() {
  try {
    await client.request("POST", "/auth/logout");
  } finally {
    session = "";
    access = "";
    await SecureStore.deleteItemAsync(key);
  }
}

export async function connectApp(
  slug: string,
  context: { botId?: string; seq?: number; generation?: number } = {},
) {
  const { redirectUrl } = await client.request<{ redirectUrl: string }>(
    "POST",
    `/apps/${encodeURIComponent(slug)}/connect`,
    { ...context, native: true },
  );
  const result = await WebBrowser.openAuthSessionAsync(
    redirectUrl,
    "fino://connected",
  );
  if (result.type !== "success") return false;
  const url = new URL(result.url);
  if (
    url.protocol !== "fino:" ||
    url.hostname !== "connected" ||
    url.searchParams.get("slug") !== slug ||
    url.searchParams.get("status") !== "complete"
  )
    throw Error("The account connection could not finish. Please try again.");
  return true;
}
