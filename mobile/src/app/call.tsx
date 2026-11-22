import { router } from "expo-router";
import { CallScreen } from "../screens/CallScreen";
export default function Screen() {
  return <CallScreen done={() => router.back()} />;
}
