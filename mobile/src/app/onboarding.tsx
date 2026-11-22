import { router } from "expo-router";
import { OnboardingScreen } from "../screens/OnboardingScreen";
export default function Screen() {
  return <OnboardingScreen done={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/team"))} />;
}
