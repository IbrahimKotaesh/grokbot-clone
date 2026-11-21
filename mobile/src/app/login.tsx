import { LoginScreen } from "../screens/LoginScreen";
import { useAuth } from "../lib/auth-context";
export default function Login() {
  const { finishLogin,error } = useAuth();
  return <LoginScreen onLogin={finishLogin} initialError={error}/>;
}
