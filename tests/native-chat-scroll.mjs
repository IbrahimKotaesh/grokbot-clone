import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "../mobile/node_modules/typescript/lib/typescript.js";
const require = createRequire(
  new URL("../mobile/package.json", import.meta.url),
);
const React = require("react"),
  refs = [];
const bot = { id: "one", generation: 1, name: "Test" };
const rows = Array.from({ length: 240 }, (_, i) => ({
  seq: i + 1,
  generation: 1,
  body: {
    type: "message",
    role: i % 2 ? "assistant" : "user",
    text: String(i),
  },
}));
const state = {
  selected: "one",
  bots: [bot],
  generations: { one: 1 },
  rows: { "one:1": rows },
  live: {},
};
const mocks = {
  react: {
    ...React,
    useMemo: (fn) => fn(),
    useRef: (value) => {
      const ref = { current: value };
      refs.push(ref);
      return ref;
    },
    useState: (value) => [value, () => {}],
  },
  "react/jsx-runtime": require("react/jsx-runtime"),
  "react-native": {
    View: "View",
    Text: "Text",
    FlatList: "FlatList",
    KeyboardAvoidingView: "Keyboard",
    Platform: { OS: "ios" },
    ActivityIndicator: "Spinner",
    Pressable: "Pressable",
  },
  "../lib/chat-timeline": {
    chatTimeline: (r) => r.map((row) => ({ key: String(row.seq), row })),
  },
  "../lib/store": {
    useWorkspace: (fn) => fn(state),
    rowKey: (id, g) => id + ":" + g,
  },
  "../lib/session": { client: {} },
  "../components/UI": {
    Avatar: "Avatar",
    IconButton: "IconButton",
    Button: "Button",
    ErrorText: "Error",
    styles: {},
  },
  "../components/WorkDetails": { WorkDetails: "WorkDetails" },
  "../components/MessageRow": { MessageRow: "MessageRow" },
  "../components/Composer": { Composer: "Composer" },
  "../theme": { palette: {} },
};
const exports = {};
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync("mobile/src/screens/ChatScreen.tsx", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    },
  ).outputText,
  {
    exports,
    require: (n) => {
      assert.ok(n in mocks, n);
      return mocks[n];
    },
  },
);
const screen = exports.ChatScreen({
  openTeam() {},
  openSettings() {},
  openChats() {},
});
const list = React.Children.toArray(screen.props.children).find(
  (x) => x.type === "FlatList",
);
assert.equal(list.props.inverted, true);
assert.equal(
  list.props.data[0].row.seq,
  240,
  "First mounted item is latest, no scroll through history",
);
assert.equal(list.props.data.at(-1).row.seq, 1);
assert.ok(
  list.props.ListFooterComponent,
  "History loader belongs at older end",
);
const calls = [];
refs[0].current = { scrollToOffset: (options) => calls.push(options) };
list.props.onContentSizeChange();
assert.equal(calls[0].offset, 0);
assert.equal(calls[0].animated, false);
list.props.onScroll({ nativeEvent: { contentOffset: { y: 500 } } });
list.props.onContentSizeChange();
assert.equal(
  calls.length,
  1,
  "Incoming text cannot pull user away from older messages",
);
list.props.onScroll({ nativeEvent: { contentOffset: { y: 0 } } });
list.props.onContentSizeChange();
assert.equal(calls.length, 2);
assert.equal(rows[0].seq, 1, "Display ordering cannot mutate stored history");
console.log(
  "PASS: 240-message chat opens at latest, follows live text only at bottom and preserves older reading position",
);
