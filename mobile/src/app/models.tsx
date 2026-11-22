import { router } from "expo-router";
import { ModelsScreen } from "../screens/ModelsScreen";
export default function Screen() {
  return <ModelsScreen done={() => router.back()} />;
}
