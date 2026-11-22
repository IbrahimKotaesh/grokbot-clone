import { router } from "expo-router";
import { useWorkspace } from "../lib/store";
import { ChatScreen } from "../screens/ChatScreen";
import { useBilling, hasComputer, openUpgrade } from "../lib/billing";
export default function Chat() {
  const selected = useWorkspace((x) => x.selected);
  const generation = useWorkspace((x) => (selected ? (x.generations[selected] ?? 1) : 1));
  return (
    <ChatScreen
      key={`${selected}:${generation}`}
      openTeam={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/team"))}
      openSettings={() => router.push("/bot-settings")}
      openChats={() => router.push("/conversations")}
      openCall={() => router.push("/call")}
      openComputer={() => (hasComputer(useBilling.getState().summary) ? router.push("/computer") : openUpgrade("computer"))}
    />
  );
}
