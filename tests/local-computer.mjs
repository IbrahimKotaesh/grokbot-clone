// Run against the local Lima VM; no model or paid API calls.
// node --env-file=.env tests/local-computer.mjs (after npm run build)
import assert from 'node:assert/strict';
import { localComputer, localShell } from '../server/dist/local-computer.js';

const c = await localComputer.createComputer('test', 'test');
assert.equal(c.status, 'running');
assert.equal((await localComputer.bash(c.id, 'default', 'uname -s')).output.trim(), 'Linux');
const mounts = await localShell('findmnt -rn -t virtiofs || true');
assert.equal(mounts.output.trim(), '', 'The agent VM must not expose Mac folders');
const failed = await localShell('printf expected-error; exit 7');
assert.equal(failed.exit_code, 7);
assert.equal(failed.success, false);
await assert.rejects(() => localComputer.getScreen(c.id, 'screen-99'), /Invalid screen/);
// Screenshots are JPEG (much smaller than PNG, so each step reaches the AI faster).
const shot = await localComputer.screenshot(c.id, 'default');
const jpg = Buffer.from(shot.image, 'base64');
assert.equal(shot.mime_type, 'image/jpeg');
assert.equal(jpg[0], 0xff); assert.equal(jpg[1], 0xd8);
assert.equal(shot.width, 1280); assert.equal(shot.height, 800);
// Waiting for the screen to settle still returns one picture, and quickly on a still screen.
const t0 = Date.now();
const settled = await localComputer.screenshot(c.id, 'default', { minMs: 100, maxMs: 2000, stable: 2 });
assert.equal(Buffer.from(settled.image, 'base64')[0], 0xff);
assert.ok(Date.now() - t0 < 4000, 'a still screen settles fast');
// Quotes, substitutions and Unicode must survive the shell transport literally.
const literal = "مرحبا ' \" $HOME $(uname) `id`";
const encoded = Buffer.from(literal).toString('base64');
const roundtrip = await localShell(`printf %s '${encoded}' | base64 -d`);
assert.equal(roundtrip.output, literal);
await assert.rejects(() => localComputer.exportFile(c.id, '/root/grokbot/files/../../etc/passwd'), /Only Library/);
const exported = await localComputer.exportFile(c.id, '/root/grokbot/files/../files/does-not-exist').catch(e => e);
assert.ok(exported instanceof Error);
console.log('PASS: Linux shell, isolation, error status, screen validation, JPEG screenshot, settling screenshot, Unicode quoting, missing file handling');
