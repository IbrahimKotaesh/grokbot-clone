import { router } from "expo-router";
import { MarketplaceScreen } from "../screens/MarketplaceScreen";
export default function Screen() {
  return <MarketplaceScreen done={() => router.back()} openBot={(id) => router.push({ pathname: "/marketplace-bot", params: { id } })} />;
}
