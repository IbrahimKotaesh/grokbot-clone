import { router } from "expo-router";
import { ChatScreen } from "../../screens/ChatScreen";
export default function Chat() {
  return (
    <ChatScreen
      openTeam={() => router.navigate("/(tabs)/team")}
      openSettings={() => router.push("/bot-settings")}
      openChats={() => router.push("/conversations")}
      openModels={() => router.push("/model")}
    />
  );
}
