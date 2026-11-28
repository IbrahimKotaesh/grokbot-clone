// Hosts that cut the words before a tool call, or send DeepSeek's tool-call markup as text: both are mended before
// the owner sees them.   node tests/output-repair.mjs
import assert from 'node:assert/strict';
const { repairOutput, trimCutText, parseDsml } = await import('../server/dist/agent/output-repair.js');

// Cut words go back to the last whole sentence; with none left, the message is hidden.
assert.equal(trimCutText('تمام، هيدا أول ملف. هلق بجهز التاني والت'), 'تمام، هيدا أول ملف.');
assert.equal(trimCutText('هيني عم بفتحلك الملفات، واحد ورا الت'), '');
assert.equal(trimCutText('خلصت الملفين، هلق بجهز الثالث.'), 'خلصت الملفين، هلق بجهز الثالث.');
assert.equal(trimCutText('Here are the files 📄'), 'Here are the files 📄');

const msg = (text) => ({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] });
const updates = [];
let out = repairOutput([msg('رح أعمل ملفين. خليني أبلّش بالأول عن ريال'), { type: 'function_call', call_id: 'c1', name: 'make_document', arguments: '{}' }], [10], (seq, t) => updates.push([seq, t]));
assert.deepEqual(updates, [[10, 'رح أعمل ملفين.']]);
assert.equal(out[0].content[0].text, 'رح أعمل ملفين.'); assert.equal(out[1].name, 'make_document');

// A final answer (no tool call) is left alone, even without a full stop.
updates.length = 0;
out = repairOutput([msg('تفضل، هي الأفكار')], [11], (seq, t) => updates.push([seq, t]));
assert.equal(updates.length, 0); assert.equal(out[0].content[0].text, 'تفضل، هي الأفكار');

// DeepSeek markup becomes the real tool call, and never reaches the chat.
const leaked = 'الت:\n\n<｜DSML｜tool_calls>\n<｜DSML｜invoke name="make_document">\n<｜DSML｜parameter name="blocks" string="false">[{"type":"heading","text":"المخبر الاقتصادي"}]</｜DSML｜parameter>\n<｜DSML｜parameter name="filename" string="true">ستايل.docx</｜DSML｜parameter>\n</｜DSML｜invoke>\n</｜DSML｜tool_calls>';
const p = parseDsml(leaked);
assert.equal(p.calls.length, 1); assert.equal(p.calls[0].name, 'make_document');
assert.deepEqual(p.calls[0].args, { blocks: [{ type: 'heading', text: 'المخبر الاقتصادي' }], filename: 'ستايل.docx' });
updates.length = 0;
out = repairOutput([msg(leaked)], [12], (seq, t) => updates.push([seq, t]));
assert.deepEqual(updates, [[12, '']], 'the markup message is hidden');
assert.equal(out.length, 1); assert.equal(out[0].type, 'function_call'); assert.equal(JSON.parse(out[0].arguments).filename, 'ستايل.docx');
console.log('PASS: cut words trimmed to the last sentence or hidden, final answers untouched, DeepSeek markup turned into the real call');
