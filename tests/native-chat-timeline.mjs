import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "../mobile/node_modules/typescript/lib/typescript.js";
const source = fs.readFileSync(
  new URL("../mobile/src/lib/chat-timeline.ts", import.meta.url),
  "utf8",
);
const exports = {};
vm.runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  { exports },
);
const row = (seq, type, extra = {}) => ({
  seq,
  generation: 1,
  body: { type, ...extra },
});
const input = [
  row(1, "message", { role: "user" }),
  row(2, "tool-call"),
  row(3, "notice"),
  row(4, "card", { card: "approval", status: "pending" }),
  row(5, "tool-call", { status: "error" }),
  row(6, "message", { role: "assistant" }),
  row(7, "event"),
];
const out = exports.chatTimeline(input);
assert.equal(out.length, 6);
assert.equal(out[1].work.length, 2);
assert.equal(
  out[2].row,
  input[3],
  "Approval must remain visible between work groups",
);
assert.equal(out[3].work[0].body.status, "error");
assert.deepEqual(
  Array.from(out.flatMap((x) => x.work ?? [x.row])),
  input,
  "Every item remains accessible in chronological order",
);
assert.equal(input.length, 7, "Projection must not mutate source rows");
assert.equal(exports.chatTimeline([]).length, 0);
console.log(
  "PASS: adjacent commands collapse; messages, pending approvals and errors are preserved in order",
);
