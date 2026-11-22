import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "../mobile/node_modules/typescript/lib/typescript.js";
const require = createRequire(
  new URL("../mobile/package.json", import.meta.url),
);
const pending = new Map();
const client = {
  chats: (id) => new Promise((resolve) => pending.set(id, resolve)),
  rows: async () => ({ rows: [] }),
  request: async () => ({}),
};
const exports = {};
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync("mobile/src/lib/store.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  {
    exports,
    require: (name) => {
      if (name === "zustand") return require(name);
      if (name === "./session") return { client };
      if (name.includes("packages/client"))
        return { mergeRows: (a, b) => [...a, ...b], EventDecoder: class {} };
      throw Error(name);
    },
  },
);
const store = exports.useWorkspace;
const a = store.getState().select("A");
const b = store.getState().select("B");
pending.get("B")({ chats: [{ generation: 9, isMain: true }] });
await b;
pending.get("A")({ chats: [{ generation: 1, isMain: true }] });
await a;
assert.equal(
  store.getState().selected,
  "B",
  "Late A response must not steal B selection",
);
assert.equal(store.getState().generations.B, 9);
store.getState().event({ type: "cleared", botId: "A", generation: 4 });
assert.equal(
  store.getState().selected,
  "B",
  "Background clear must not switch open bot",
);
assert.equal(store.getState().generations.A, 4);
const stale = store.getState().select("C");
store.getState().reset();
pending.get("C")({ chats: [{ generation: 1, isMain: true }] });
await stale;
assert.equal(
  store.getState().selected,
  null,
  "Logout/reset must invalidate pending selection",
);
console.log(
  "PASS: rapid switching, background chat events and reset keep the intended conversation selected",
);
