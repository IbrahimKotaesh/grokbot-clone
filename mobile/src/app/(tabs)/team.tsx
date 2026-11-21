import { router } from "expo-router";
import { TeamScreen } from "../../screens/TeamScreen";
export default function Team() {
  return (
    <TeamScreen
      openChat={() => router.navigate("/(tabs)/chat")}
      openCreate={() => router.push("/create-bot")}
    />
  );
}
