import { ActivityIndicator, Text, View } from "react-native";
import { palette as p } from "../theme";
export function StartupScreen() {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: p.background,
        gap: 16,
      }}
    >
      <ActivityIndicator color={p.blue} />
      <Text style={{ color: p.muted, fontSize: 16 }}>
        Opening your workspace…
      </Text>
    </View>
  );
}
