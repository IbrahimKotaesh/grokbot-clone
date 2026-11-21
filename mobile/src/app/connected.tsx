import { Redirect } from "expo-router";
import { useAuth } from "../lib/auth-context";
import { StartupScreen } from "../components/StartupScreen";
export default function Callback() {
  const { ready, signedIn } = useAuth();
  if (!ready) return <StartupScreen />;
  return <Redirect href={signedIn ? "/(tabs)/apps" : "/login"} />;
}
