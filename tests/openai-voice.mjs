// Trial voice relay: a tool name repeated by the host stays one valid name, a broken step in the history is repaired
// so the call carries on, and captions follow the voice instead of arriving all at once. OpenRouter is faked.
//   DB_PATH=:memory: node --env-file=.env tests/openai-voice.mjs
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
process.env.OPENROUTER_API_KEY ||= 'test';
const { OpenAIVoiceCall } = await import('../server/dist/openai-voice.js');

class FakeWs extends EventEmitter { readyState = 1; sent = []; send(s) { this.sent.push(JSON.parse(s)); } close() { this.readyState = 3; } }
const sse = (chunks) => new Response(new ReadableStream({ start(c) { for (const ch of chunks) c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(ch)}\n\n`)); c.enqueue(new TextEncoder().encode('data: [DONE]\n\n')); c.close(); } }), { status: 200 });
const d = (delta) => ({ choices: [{ delta }] });
const audio = (ms) => Buffer.alloc(Math.round(48 * ms)).toString('base64'); // pcm16 @ 24 kHz
let requests = [];
let script = [];
globalThis.fetch = async (_url, init) => { requests.push(JSON.parse(init.body)); return script.shift()(); };
const tools = [{ type: 'function', name: 'send_task', description: 'hand off', parameters: { type: 'object', properties: { request: { type: 'string' } } } }];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 1) The host repeats the tool name in a later chunk; text arrives long before the audio finishes.
const ws = new FakeWs();
const call = new OpenAIVoiceCall(ws, 'u1', 'b1');
ws.emit('message', Buffer.from(JSON.stringify({ type: 'session.update', session: { instructions: 'Be Badr.', voice: 'cedar', tools } })), false);
script.push(() => sse([
  d({ audio: { transcript: 'تمام، رح جهزلك السيرة الذاتية هلأ.' } }),
  d({ audio: { data: audio(1500) } }),
  { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'send_task', arguments: '' } }] } }] },
  { choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'send_task', arguments: '{"request":"Write a CV"}' } }] } }] },
  { ...d({ audio: { data: audio(1500) } }), usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0 } },
]));
const t0 = Date.now();
ws.emit('message', Buffer.from(JSON.stringify({ type: 'response.create' })), false);
await wait(400);
const early = ws.sent.filter((e) => e.type === 'response.output_audio_transcript.delta').map((e) => e.delta).join('');
const full = 'تمام، رح جهزلك السيرة الذاتية هلأ.';
assert.ok(early.length < full.length, `captions follow the voice, not all at once (shown ${early.length}/${full.length} after 0.4 s)`);
const done = ws.sent.find((e) => e.type === 'response.done');
assert.equal(done.response.output.length, 1);
assert.equal(done.response.output[0].name, 'send_task', 'the repeated name is taken once');
assert.equal(done.response.output[0].arguments, '{"request":"Write a CV"}');
await wait(3400);
assert.equal(ws.sent.find((e) => e.type === 'response.output_audio_transcript.done')?.transcript, full, 'the whole caption lands by the end of the audio');
assert.ok(Date.now() - t0 >= 2500, 'and not before the voice has had time to say it');

// 2) A broken step from an older build sits in the history; OpenAI rejects it. The relay repairs and carries on.
ws.emit('message', Buffer.from(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: 'call_1', output: 'Handed off.' } })), false);
call['history'].push({ role: 'assistant', content: null, tool_calls: [{ id: 'call_bad', type: 'function', function: { name: 'send_tasksend_tasksend_task', arguments: '{}' } }] });
script.push(() => new Response(JSON.stringify({ error: { message: "Invalid 'messages[5].tool_calls[0].function.name'" } }), { status: 400 }));
script.push(() => sse([d({ audio: { transcript: 'جاهز.', data: audio(300) } })]));
ws.sent = [];
requests = [];
ws.emit('message', Buffer.from(JSON.stringify({ type: 'response.create' })), false);
await wait(1500);
assert.equal(requests.length, 2, 'one retry after the rejection');
assert.ok(!JSON.stringify(requests[1].messages).includes('send_tasksend_task'), 'the broken step is gone from the retry');
assert.ok(JSON.stringify(requests[1].messages).includes('call_1'), 'the good hand-off and its result stay');
assert.equal(ws.sent.filter((e) => e.type === 'response.done').at(-1).response.status, 'completed', 'the call carries on');
assert.ok(!ws.sent.some((e) => e.type === 'error'), 'no error reaches the caller');
ws.emit('close');
console.log('PASS: trial voice keeps one valid tool name, repairs a broken history and carries on, captions follow the voice');
process.exit(0);
