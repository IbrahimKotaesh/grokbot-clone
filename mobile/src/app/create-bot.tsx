import { router } from "expo-router";
import { CreateBotScreen } from "../screens/BotScreens";
export default function Screen() {
  return <CreateBotScreen done={() => router.back()} />;
}
