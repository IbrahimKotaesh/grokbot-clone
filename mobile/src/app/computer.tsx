import { router } from "expo-router";
import { ComputerScreen } from "../screens/ComputerScreen";
export default function Screen() {
  return <ComputerScreen done={() => router.back()} openClaudeCode={() => router.push("/claude-code")} />;
}
