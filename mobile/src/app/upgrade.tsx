import { router, useLocalSearchParams } from "expo-router";
import { UpgradeScreen } from "../screens/UpgradeScreen";
export default function Screen() {
  const { feature } = useLocalSearchParams<{ feature?: "computer" | "bots" | "voice" }>();
  return <UpgradeScreen done={() => router.back()} feature={feature} />;
}
