import { router } from "expo-router";
import { ModelScreen } from "../screens/BotScreens";
export default function Screen() {
  return <ModelScreen done={() => router.back()} openModels={() => router.push("/models")} openClaudeCode={() => router.push("/claude-code")} />;
}
