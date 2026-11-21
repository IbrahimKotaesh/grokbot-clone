import { router } from "expo-router";
import { ChatsScreen } from "../screens/BotScreens";
export default function Screen() {
  return <ChatsScreen done={() => router.back()} />;
}
