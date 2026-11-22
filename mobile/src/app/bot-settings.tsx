import { router } from "expo-router";
import { BotSettingsScreen } from "../screens/BotScreens";
export default function Screen() {
  return (
    <BotSettingsScreen
      done={() => router.back()}
      openModel={() => router.push("/model")}
    />
  );
}
