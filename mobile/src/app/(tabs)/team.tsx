import { useEffect } from "react";
import { router } from "expo-router";
import { TeamScreen } from "../../screens/TeamScreen";
import { useWorkspace } from "../../lib/store";
import { needsOnboarding } from "../../lib/install";
import { useBilling, hasComputer, openUpgrade } from "../../lib/billing";
export default function Team() {
  const user = useWorkspace((x) => x.user);
  const bots = useWorkspace((x) => x.bots);
  useEffect(() => {
    if (user) void useBilling.getState().load().catch(() => {});
  }, [user?.id]);
  // First launch on a fresh account: walk through setup once.
  useEffect(() => {
    if (!user || !bots.length) return;
    let alive = true;
    void needsOnboarding(user, bots).then((need) => alive && need && router.push("/onboarding"));
    return () => {
      alive = false;
    };
  }, [user?.id, bots.length > 0]);
  return (
    <TeamScreen
      openChat={() => router.navigate("/chat")}
      openCreate={() => router.push("/create-bot")}
      openMarketplace={() => router.navigate("/market")}
      openCall={() => router.push("/call")}
      openComputer={() => (hasComputer(useBilling.getState().summary) ? router.push("/computer") : openUpgrade("computer"))}
    />
  );
}
