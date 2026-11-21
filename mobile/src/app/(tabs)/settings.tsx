import { AccountScreen } from "../../screens/UtilityScreens";
import { useAuth } from "../../lib/auth-context";
export default function Settings() {
  const { signedOut } = useAuth();
  return <AccountScreen onLogout={signedOut} />;
}
