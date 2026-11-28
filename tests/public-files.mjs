// Temporary public links to a Bot's pictures (so Facebook/Instagram can fetch them): open without a session by
// token, only pictures and videos, wrong or expired tokens find nothing.   DB_PATH=:memory: node --env-file=.env tests/public-files.mjs
import assert from 'node:assert/strict';
const { db } = await import('../server/dist/db.js');
const { makePublicLink, publicFilesApi } = await import('../server/dist/public-files.js');
const { Hono } = await import('hono');
const app = new Hono().route('/api/public-files', publicFilesApi);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR5kAAAAASUVORK5CYII=', 'base64');
const link = makePublicLink('u1', 'b1', 'n1 post.png', png);
const path = new URL(link.url).pathname;
let r = await app.request(path);
assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'image/png');
assert.equal((await r.arrayBuffer()).byteLength, png.length);
assert.equal((await app.request('/api/public-files/wrongtoken/x.png')).status, 404);
assert.throws(() => makePublicLink('u1', 'b1', 'secret.pdf', Buffer.from('%PDF-1.4 secret')), /Only pictures/);
db.prepare('UPDATE public_files SET expires_at=0').run();
assert.equal((await app.request(path)).status, 404, 'expired links stop working');
console.log('PASS: public picture links open by token, pictures/videos only, wrong and expired tokens find nothing');
process.exit(0);
