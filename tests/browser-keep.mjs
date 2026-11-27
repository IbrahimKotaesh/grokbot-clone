// Keeping site logins: the profile setting and the clean-close command are valid shell, and the setting is written.
//   node tests/browser-keep.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const { keepLoginsPrefs, closeBrowsersCleanly } = await import('../server/dist/lib/browser-keep.js');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keep-'));
const profile = path.join(dir, 'bot_1');
fs.mkdirSync(path.join(profile, 'Default'), { recursive: true });
fs.writeFileSync(path.join(profile, 'Default', 'Preferences'), JSON.stringify({ profile: { exit_type: 'Crashed', name: 'Bot' }, other: 1 }));

// Both commands must work as one step in a longer command line, the way the server sends them.
const line = `${keepLoginsPrefs(profile)}; ${closeBrowsersCleanly(profile)}; echo done`;
execFileSync('bash', ['-n', '-c', line]);
const out = execFileSync('bash', ['-c', line], { encoding: 'utf8' }).trim().split('\n');
assert.deepEqual(out, ['0', 'done'], 'no browser to close, and the rest of the line still runs');

const prefs = JSON.parse(fs.readFileSync(path.join(profile, 'Default', 'Preferences'), 'utf8'));
assert.equal(prefs.session.restore_on_startup, 1, 'continue where you left off: session logins are kept');
assert.equal(prefs.profile.exit_type, 'Normal');
assert.equal(prefs.profile.name, 'Bot', 'other settings stay');
assert.equal(prefs.other, 1);

assert.throws(() => keepLoginsPrefs("/root/x'; rm -rf /"), /Invalid profile/);
assert.throws(() => closeBrowsersCleanly('/root/$(id)'), /Invalid profile/);
fs.rmSync(dir, { recursive: true, force: true });
console.log('PASS: logins kept across restarts (profile setting written, clean close is safe one-line shell)');
