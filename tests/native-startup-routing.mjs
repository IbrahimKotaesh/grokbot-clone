import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import ts from "../mobile/node_modules/typescript/lib/typescript.js";
const mobileRequire = createRequire(
  new URL("../mobile/package.json", import.meta.url),
);
const React = mobileRequire("react");
const Stack = () => null;
Stack.Screen = () => null;
Stack.Protected = () => null;
const Redirect = () => null,
  Loading = () => null,
  Login = () => null;
let auth = { ready: false, signedIn: false };
function load(path, extra = "") {
  const source =
    (process.env.FINO_TEST_BASELINE === "1"
      ? execFileSync("git", ["show", `HEAD:${path}`], { encoding: "utf8" })
      : fs.readFileSync(path, "utf8")) + extra;
  const code = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const exports = {};
  const mocks = {
    react: React,
    "react/jsx-runtime": mobileRequire("react/jsx-runtime"),
    "react-native": {
      View: "View",
      Text: "Text",
      ActivityIndicator: "Spinner",
    },
    "expo-router": { Tabs: Stack, Stack, Redirect, router: { back() {} } },
    "@react-navigation/native": {
      ThemeProvider: () => null,
      DarkTheme: { colors: {} },
    },
    "react-native-safe-area-context": {
      SafeAreaProvider: () => null,
      SafeAreaView: () => null,
    },
    "expo-status-bar": { StatusBar: () => null },
    "../lib/auth-context": { AuthProvider: () => null, useAuth: () => auth },
    "../components/UI": {
      IconButton: () => null,
      Button: () => null,
      styles: { screen: {}, muted: {} },
    },
    "../theme": { palette: {} },
    "../../theme": { palette: {} },
    "@expo/vector-icons": { Ionicons: () => null },
    "../components/StartupScreen": { StartupScreen: Loading },
    "../screens/LoginScreen": { LoginScreen: Login },
  };
  vm.runInNewContext(code, {
    exports,
    require: (name) => {
      assert.ok(name in mocks, `Unexpected dependency: ${name}`);
      return mocks[name];
    },
  });
  return exports;
}
const root = load(
  "mobile/src/app/_layout.tsx",
  "\nexport {Routes as TestRoutes};",
);
const leaves = {
  index: load("mobile/src/app/index.tsx").default,
  auth: load("mobile/src/app/auth.tsx").default,
  connected: load("mobile/src/app/connected.tsx").default,
  login: load("mobile/src/app/login.tsx").default,
};
function screens() {
  const navigator = root.TestRoutes();
  assert.ok(
    navigator.type === Stack,
    "Root navigator must remain mounted while session storage/network loads",
  );
  const map = new Map();
  function walk(children, blocked = false, target) {
    for (const node of React.Children.toArray(children)) {
      if (node.type === Stack.Protected)
        walk(
          node.props.children,
          blocked || !node.props.guard,
          !node.props.guard ? node.props.redirectTo : target,
        );
      else if (node.type === Stack.Screen)
        map.set(node.props.name, { blocked, target });
    }
  }
  walk(navigator.props.children);
  return map;
}
const name = (path) =>
  path === "/"
    ? "index"
    : path.startsWith("/(tabs)")
      ? "(tabs)"
      : path.slice(1);
function resolve(start) {
  const map = screens(),
    seen = new Set();
  let path = start;
  for (let hops = 0; hops < 8; hops++) {
    if (seen.has(path)) throw Error(`Navigation cycle from ${start}`);
    seen.add(path);
    const screen = map.get(name(path));
    assert.ok(screen, `Unknown route: ${path}`);
    if (screen.blocked) {
      assert.ok(
        screen.target,
        "Every protected route needs an explicit destination, never a callback fallback",
      );
      path = screen.target;
      continue;
    }
    const component = leaves[name(path)];
    if (!component) return { path, hops };
    const element = component();
    if (element.type !== Redirect)
      return { path, hops, loading: element.type === Loading };
    path = element.props.href;
  }
  throw Error("Too many startup redirects");
}
for (const state of [
  { ready: false, signedIn: false },
  { ready: true, signedIn: false },
  { ready: true, signedIn: true },
]) {
  auth = state;
  for (const entry of [
    "/",
    "/auth",
    "/connected",
    "/login",
    "/model",
    "/bot-settings",
    "/create-bot",
    "/conversations",
    "/chat",
    "/apps",
  ]) {
    const result = resolve(entry);
    assert.ok(
      result.hops <= 2,
      "Opening an app must settle, not animate through a stack of pages",
    );
    if (!state.ready) assert.equal(result.loading, true);
    else if (!state.signedIn) assert.equal(result.path, "/login");
  }
}
console.log(
  "PASS: cold start, slow session hydration, signed-out callback/deep links and signed-in startup settle without navigation cycles",
);

const tabs = load("mobile/src/app/(tabs)/_layout.tsx").default();
assert.deepEqual(
  React.Children.toArray(tabs.props.children).map((x) => [
    x.props.name,
    x.props.options.title,
  ]),
  [
    ["team", "Bots"],
    ["updates", "Inbox"],
    ["settings", "Settings"],
  ],
);
assert.equal(tabs.props.backBehavior, "initialRoute");
console.log(
  "PASS: exactly three mobile tabs; chats and connected apps remain protected stack screens",
);
