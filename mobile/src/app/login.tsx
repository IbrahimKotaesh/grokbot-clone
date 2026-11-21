import { StartupScreen } from "../components/StartupScreen";
import { LoginScreen } from "../screens/LoginScreen";
import { useAuth } from "../lib/auth-context";
export default function Login() {
  const { finishLogin, error, ready } = useAuth();
  if (!ready) return <StartupScreen />;
  return <LoginScreen onLogin={finishLogin} initialError={error} />;
}
