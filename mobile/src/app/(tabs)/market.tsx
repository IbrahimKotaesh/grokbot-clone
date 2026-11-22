import { router } from "expo-router";
import { MarketplaceScreen } from "../../screens/MarketplaceScreen";
export default function Market() {
  return <MarketplaceScreen openBot={(id) => router.push({ pathname: "/marketplace-bot", params: { id } })} />;
}
