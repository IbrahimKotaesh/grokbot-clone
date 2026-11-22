import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const dir = await fs.mkdtemp(path.join(os.tmpdir(), "fino-inbox-"));
process.env.DB_PATH = path.join(dir, "test.db");
process.env.FINO_ACCESS_FILE = path.join(dir, "access.json");
process.env.FINO_ACCESS_REQUIRED = "0";
process.env.SESSION_SECRET = "isolated-inbox-regression-test-secret";
const { db } = await import("../server/dist/db.js");
const { Hono } = await import("hono");
const { requireUser } = await import("../server/dist/lib/auth.js");
const { pushApi } = await import("../server/dist/notifications.js");
const app = new Hono();
app.use("/api/*", requireUser);
app.route("/api/push", pushApi);
try {
  for (const id of ["owner", "other"]) {
    db.prepare(
      "INSERT INTO users(id,email,name,created_at) VALUES (?,?,?,?)",
    ).run(id, id + "@example.com", id, Date.now());
    db.prepare("INSERT INTO auth_sessions VALUES (?,?,?,?)").run(
      id,
      id,
      Date.now(),
      Date.now() + 60000,
    );
    db.prepare(
      "INSERT INTO notification_events(id,event_key,user_id,kind,title,body,created_at) VALUES (?,?,?,?,?,?,?)",
    ).run(
      id,
      id,
      id,
      "attention",
      "Important update",
      "Full message",
      Date.now(),
    );
  }
  const headers = { Authorization: "Bearer owner" };
  assert.equal((await app.request("/api/push/notifications")).status, 401);
  let r = await app.request("/api/push/notifications", { headers });
  assert.equal(r.status, 200);
  let data = await r.json();
  assert.equal(data.items.length, 1);
  assert.equal(data.items[0].id, "owner");
  assert.equal(data.items[0].body, "Full message");
  r = await app.request("/api/push/notifications/read", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ id: "owner" }),
  });
  assert.equal(r.status, 200);
  data = await (
    await app.request("/api/push/notifications", { headers })
  ).json();
  assert.equal(data.unread, 0);
  console.log(
    "PASS: native Bearer sessions load full inbox messages, isolate accounts and mark messages read",
  );
} finally {
  db.close();
  await fs.rm(dir, { recursive: true, force: true });
}
