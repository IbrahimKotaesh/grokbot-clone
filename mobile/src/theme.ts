export const palette = {
  background: "#101820",
  surface: "#19242e",
  raised: "#23323f",
  text: "#f4f7fb",
  muted: "#9cadbd",
  blue: "#64a7ff",
  line: "#31414f",
  red: "#ff6c6c",
};
export const chatColors: Record<string, string> = {
  black: "#526b85",
  brown: "#a87548",
  red: "#d74953",
  orange: "#ce751a",
  yellow: "#ad8814",
  green: "#3b8c54",
  cyan: "#167d91",
  blue: "#316dc4",
  violet: "#8650bd",
  magenta: "#b8428c",
  gray: "#5e7185",
};
export type Fruit = "watermelon" | "orange" | "olive" | "fig";
export const fruits: Fruit[] = ["watermelon", "orange", "olive", "fig"];
export const fruitColor = {
  watermelon: "red",
  orange: "orange",
  olive: "green",
  fig: "violet",
} as const;
export const fruitAssets = {
  watermelon: require("../assets/fruits/watermelon.webp"),
  orange: require("../assets/fruits/orange.webp"),
  olive: require("../assets/fruits/olive.webp"),
  fig: require("../assets/fruits/fig.webp"),
};
export function fruitFor(shape: string): Fruit {
  if (fruits.includes(shape as Fruit)) return shape as Fruit;
  if (
    ["arch", "tablet", "capsule", "cylinder", "bean", "teardrop"].includes(
      shape,
    )
  )
    return "orange";
  if (["ghost", "cloud", "dome", "flower", "star", "sparkle"].includes(shape))
    return "olive";
  if (["dino", "leaf", "clover", "house", "shield"].includes(shape))
    return "fig";
  return "watermelon";
}
