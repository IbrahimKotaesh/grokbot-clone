import { router } from "expo-router";
import { AlertsScreen } from "../../screens/UtilityScreens";
export default function Updates() {
  return <AlertsScreen openChat={() => router.navigate("/(tabs)/chat")} />;
}
