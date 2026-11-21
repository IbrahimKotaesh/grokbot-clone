import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { AppState } from "react-native";
import { restoreSession, client } from "./session";
import { useWorkspace, watchEvents } from "./store";
interface AuthState {
  ready: boolean;
  signedIn: boolean;
  error: string | null;
  finishLogin(): Promise<void>;
  signedOut(): void;
}
const AuthContext = createContext<AuthState | null>(null);
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false),
    [signedIn, setSignedIn] = useState(false),
    [error, setError] = useState<string | null>(null);
  const refresh = useWorkspace((x) => x.refresh);
  const finishLogin = useCallback(async () => {
    await refresh();
    setSignedIn(true);
    setError(null);
  }, [refresh]);
  useEffect(() => {
    void restoreSession()
      .then(async () => {
        const result = await client.me();
        if (result.user) await finishLogin();
      })
      .catch((e) => {
        if (!String(e.message).includes("unauthenticated")) setError(e.message);
      })
      .finally(() => setReady(true));
  }, [finishLogin]);
  useEffect(() => {
    if (!signedIn) return;
    let controller: AbortController | null = null;
    const start = () => {
      controller?.abort();
      controller = new AbortController();
      void watchEvents(controller.signal);
      void refresh().catch(() => {});
    };
    start();
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") start();
      else {
        controller?.abort();
        useWorkspace.setState({ connected: false });
      }
    });
    return () => {
      controller?.abort();
      listener.remove();
    };
  }, [signedIn, refresh]);
  return (
    <AuthContext.Provider
      value={{
        ready,
        signedIn,
        error,
        finishLogin,
        signedOut: () => setSignedIn(false),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw Error("Auth provider is missing");
  return auth;
}
