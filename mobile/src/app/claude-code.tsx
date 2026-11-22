import { router } from "expo-router";
import { ClaudeCodeScreen } from "../screens/ClaudeCodeScreen";
export default function Screen() {
  return <ClaudeCodeScreen done={() => router.back()} />;
}
