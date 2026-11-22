import { router } from "expo-router";
import { AccountScreen } from "../../screens/UtilityScreens";
import { useAuth } from "../../lib/auth-context";
import { useBilling, hasComputer, openUpgrade } from "../../lib/billing";
export default function Settings() {
  const { signedOut } = useAuth();
  return (
    <AccountScreen onLogout={signedOut} openApps={() => router.push("/apps")} openPlan={() => router.push("/upgrade")} openModels={() => router.push("/models")} openClaudeCode={() => (hasComputer(useBilling.getState().summary) ? router.push("/claude-code") : openUpgrade("computer"))} />
  );
}
