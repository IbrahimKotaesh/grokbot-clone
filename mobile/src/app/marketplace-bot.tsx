import { router, useLocalSearchParams } from "expo-router";
import { useWorkspace } from "../lib/store";
import { MarketplaceBotScreen } from "../screens/MarketplaceScreen";
export default function Screen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <MarketplaceBotScreen
      id={String(id ?? "")}
      done={() => router.back()}
      openChat={(botId) =>
        void useWorkspace
          .getState()
          .select(botId)
          .then(() => {
            router.dismissAll();
            router.push("/chat");
          })
      }
    />
  );
}
