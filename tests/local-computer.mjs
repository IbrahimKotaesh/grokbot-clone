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
const shot = await localComputer.screenshot(c.id, 'default');
const png = Buffer.from(shot.image, 'base64');
assert.equal(png.subarray(1, 4).toString(), 'PNG');
assert.equal(png.readUInt32BE(16), 1280);
assert.equal(png.readUInt32BE(20), 800);
// Quotes, substitutions and Unicode must survive the shell transport literally.
const literal = "مرحبا ' \" $HOME $(uname) `id`";
const encoded = Buffer.from(literal).toString('base64');
const roundtrip = await localShell(`printf %s '${encoded}' | base64 -d`);
assert.equal(roundtrip.output, literal);
await assert.rejects(() => localComputer.exportFile(c.id, '/root/grokbot/files/../../etc/passwd'), /Only Library/);
const exported = await localComputer.exportFile(c.id, '/root/grokbot/files/../files/does-not-exist').catch(e => e);
assert.ok(exported instanceof Error);
console.log('PASS: Linux shell, isolation, error status, screen validation, PNG screenshot, Unicode quoting, missing file handling');
