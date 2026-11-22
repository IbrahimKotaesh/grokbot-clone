import { router } from "expo-router";
import { AppsScreen } from "../screens/UtilityScreens";
export default function Screen() {
  return <AppsScreen done={() => router.back()} />;
}
