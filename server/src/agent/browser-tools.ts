// Browser tools that work inside the page, like Claude in Chrome: read a page as a list of numbered
// elements, then click, fill whole forms, upload files and navigate by those numbers. No screenshot per
// step, so web work is several times faster and cheaper than driving the screen, and clicks never miss.
//
// They talk to the bot's own Chrome over its local debugging port (the same one the employee rules use),
// with a small standard-library Python client on the bot's computer. The screen tools stay for pages
// that need eyes (canvas, CAPTCHAs, odd widgets).
import { orgo } from '../orgo.js';
import { screenFor } from '../computer.js';
import { cdpPort } from './employee-rules.js';

export interface BrowserCtx { userId: string; botId: string; desktopTarget?: unknown }
export interface BrowserResult { output: string; summary?: string }

/** Python CDP client: picks the active tab, runs a list of steps, returns one JSON result line. */
const CDP = String.raw`
import sys, json, socket, base64, os, time, urllib.request
A = json.loads(base64.b64decode(open(sys.argv[1]).read())); os.remove(sys.argv[1])
PORT = int(A["port"])
def out(**kw):
    print("FINO_RESULT:" + json.dumps(kw, ensure_ascii=False)); sys.exit(0)
def tabs():
    try: return [p for p in json.load(urllib.request.urlopen("http://127.0.0.1:%d/json" % PORT, timeout=2)) if p.get("type") == "page" and not p.get("url", "").startswith("devtools:")]
    except Exception: return None
class Tab:
    def __init__(self, t):
        self.t = t; self.n = 0; self.connect()
    def connect(self):
        path = "/" + self.t["webSocketDebuggerUrl"].split("/", 3)[3]
        self.s = socket.create_connection(("127.0.0.1", PORT), timeout=20)
        k = base64.b64encode(os.urandom(16)).decode()
        self.s.send(("GET %s HTTP/1.1\r\nHost: 127.0.0.1:%d\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n\r\n" % (path, PORT, k)).encode())
        h = b""
        while b"\r\n\r\n" not in h: h += self.s.recv(1)
    def _rx(self, n):
        b = b""
        while len(b) < n:
            c = self.s.recv(n - len(b))
            if not c: raise EOFError
            b += c
        return b
    def _recv(self):
        while True:
            a, b = self._rx(2); n = b & 127
            if n == 126: n = int.from_bytes(self._rx(2), "big")
            elif n == 127: n = int.from_bytes(self._rx(8), "big")
            data = self._rx(n)
            if a & 0x0F in (1, 2): return data
    def call(self, method, params=None):
        self.n += 1; i = self.n
        d = json.dumps({"id": i, "method": method, "params": params or {}}).encode(); m = os.urandom(4); n = len(d)
        hd = bytes([0x81]) + (bytes([0x80 | n]) if n < 126 else bytes([0xFE]) + n.to_bytes(2, "big") if n < 65536 else bytes([0xFF]) + n.to_bytes(8, "big"))
        self.s.send(hd + m + bytes(b ^ m[j % 4] for j, b in enumerate(d)))
        while True:
            r = json.loads(self._recv())
            if r.get("id") == i:
                if "error" in r: raise RuntimeError(r["error"].get("message", "CDP error"))
                return r.get("result", {})
    def js(self, expr, by_value=True):
        r = self.call("Runtime.evaluate", {"expression": expr, "returnByValue": by_value, "awaitPromise": True})
        if r.get("exceptionDetails"): raise RuntimeError(r["exceptionDetails"].get("exception", {}).get("description", "script error")[:400])
        return r["result"].get("value") if by_value else r["result"]
def settle(tab, wait=8.0):
    time.sleep(0.35); end = time.time() + wait
    while time.time() < end:
        try:
            if tab.js("document.readyState") == "complete": break
        except Exception:
            time.sleep(0.4)
            try: tab.connect()
            except Exception: pass
        time.sleep(0.25)
    time.sleep(0.3)

SNAP = r"""(opts) => {
  const vis = (el) => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; const s = getComputedStyle(el); return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0'; };
  const clean = (t) => String(t || '').replace(/\s+/g, ' ').trim();
  const labelOf = (el) => {
    let t = el.getAttribute('aria-label') || '';
    if (!t && el.labels && el.labels[0]) { t = el.labels[0].innerText; if (el.tagName === 'SELECT' && el.labels[0].contains(el)) t = t.replace(el.innerText, ''); }
    if (!t && el.getAttribute('aria-labelledby')) t = el.getAttribute('aria-labelledby').split(' ').map((i) => document.getElementById(i)?.innerText || '').join(' ');
    if (!t && el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA' && el.tagName !== 'SELECT') t = el.innerText;
    if (!t) t = el.placeholder || el.title || el.getAttribute('name') || el.querySelector?.('img[alt]')?.alt || el.value || '';
    return clean(t).slice(0, 90);
  };
  let n = window.__finoRef || 0;
  const sel = 'a[href],button,input,select,textarea,summary,[role=button],[role=link],[role=checkbox],[role=radio],[role=tab],[role=menuitem],[role=option],[role=switch],[role=combobox],[contenteditable=""],[contenteditable=true],[onclick]';
  const q = clean(opts.query).toLowerCase();
  const els = [];
  for (const el of document.querySelectorAll(sel)) {
    if (el.type === 'hidden' || !vis(el)) continue;
    let ref = el.getAttribute('data-fino-ref');
    if (!ref) { ref = String(++n); el.setAttribute('data-fino-ref', ref); }
    const tag = el.tagName.toLowerCase(), role = el.getAttribute('role');
    const kind = tag === 'a' ? 'link' : tag === 'input' ? 'input:' + (el.type || 'text') : role || tag;
    const label = labelOf(el);
    if (q && !(label.toLowerCase().includes(q) || String(el.value || '').toLowerCase().includes(q) || String(el.getAttribute('href') || '').toLowerCase().includes(q))) continue;
    const e = { ref: +ref, kind, label };
    if (tag === 'input' || tag === 'textarea') { if (['checkbox', 'radio'].includes(el.type)) e.checked = el.checked; else if (el.type !== 'password') e.value = clean(el.value).slice(0, 80); else e.value = el.value ? '••••' : ''; if (el.required) e.required = true; }
    if (tag === 'select') { e.value = clean(el.options[el.selectedIndex]?.text); e.options = [...el.options].slice(0, 25).map((o) => clean(o.text)); }
    if (tag === 'a') { const h = el.getAttribute('href') || ''; if (h && !h.startsWith('javascript:')) e.href = h.slice(0, 120); }
    if (el.disabled) e.disabled = true;
    const r = el.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) e.offscreen = true;
    els.push(e);
    if (els.length >= opts.max) break;
  }
  window.__finoRef = n;
  let text = '';
  if (opts.text) {
    const body = clean(document.body ? document.body.innerText : '');
    if (q) { const i = body.toLowerCase().indexOf(q); text = i < 0 ? '' : body.slice(Math.max(0, i - 400), i + 1200); }
    else text = body.slice(0, opts.chars);
  }
  const pay = !!document.querySelector('input[autocomplete^="cc-"],input[name*="cardnumber" i],input[name*="card_number" i],input[name*="cvc" i],input[name*="cvv" i],iframe[src*="stripe"],iframe[src*="adyen"],iframe[src*="mollie"],iframe[src*="paypal"],iframe[src*="braintree"]');
  return { url: location.href, title: document.title, elements: els, text, pay, scroll: Math.round(scrollY), height: document.documentElement.scrollHeight, viewport: innerHeight };
}"""
def snapshot(tab, query="", text=True, chars=6000, mx=150):
    return tab.js("(%s)(%s)" % (SNAP, json.dumps({"query": query, "text": text, "chars": chars, "max": mx})))
def el(ref):
    return "document.querySelector('[data-fino-ref=\"%d\"]')" % int(ref)
def center(tab, ref):
    r = tab.js("(() => { const e = %s; if (!e) return null; e.scrollIntoView({block: 'center', inline: 'center'}); const b = e.getBoundingClientRect(); const x = b.left + b.width / 2, y = b.top + b.height / 2; return {x, y, sx: Math.round(window.screenX + Math.max(0, (window.outerWidth - window.innerWidth) / 2) + x), sy: Math.round(window.screenY + (window.outerHeight - window.innerHeight) + y)}; })()" % el(ref))
    if not r: out(error="Element [%s] is gone. Call browser_read again to get fresh numbers." % ref)
    POINTS.append({"x": r["sx"], "y": r["sy"]})
    return r
def click(tab, ref):
    c = center(tab, ref); time.sleep(0.15)
    for t in ("mouseMoved", "mousePressed", "mouseReleased"):
        tab.call("Input.dispatchMouseEvent", {"type": t, "x": c["x"], "y": c["y"], "button": "left", "clickCount": 1})
def key(tab, k):
    codes = {"Enter": (13, "\r"), "Tab": (9, ""), "Escape": (27, ""), "Backspace": (8, ""), "ArrowDown": (40, ""), "ArrowUp": (38, "")}
    vk, txt = codes.get(k, (0, ""))
    down = {"type": "keyDown" if txt else "rawKeyDown", "key": k, "code": k, "windowsVirtualKeyCode": vk}
    if txt: down["text"] = txt
    tab.call("Input.dispatchKeyEvent", down)
    tab.call("Input.dispatchKeyEvent", {"type": "keyUp", "key": k, "code": k, "windowsVirtualKeyCode": vk})

POINTS = []
ts = tabs()
op = A["op"]
if ts is None:
    if op == "navigate": out(need_browser=True)
    out(error="Your browser isn't open. Use browser_navigate with a URL first.")
if not ts:
    if op == "navigate": out(need_browser=True)
    out(error="No open tab. Use browser_navigate with a URL.")
if A.get("tab") is not None:
    i = int(A["tab"])
    if i < 0 or i >= len(ts): out(error="There is no tab %d. Open tabs: %s" % (i, [t.get("title", "")[:40] for t in ts]))
    urllib.request.urlopen("http://127.0.0.1:%d/json/activate/%s" % (PORT, ts[i]["id"]), timeout=2); ts = [ts[i]] + [t for j, t in enumerate(ts) if j != i]
tab = Tab(ts[0])
tab_list = [{"index": i, "title": t.get("title", "")[:60], "url": t.get("url", "")[:100]} for i, t in enumerate(ts)] if len(ts) > 1 else None

if op == "read":
    if A.get("scroll"):
        tab.js("window.scrollBy(0, %d)" % (int(A["scroll"]) * int(tab.js("innerHeight") * 0.85))); time.sleep(0.4)
    s = snapshot(tab, A.get("query") or "", True, int(A.get("chars") or 6000))
    out(page=s, tabs=tab_list)
if op == "navigate":
    url = A["url"]
    if url in ("back", "forward"): tab.js("history.%s()" % url)
    else: tab.call("Page.navigate", {"url": url})
    settle(tab, 15)
    out(page=snapshot(tab, "", True, 4000), tabs=tab_list)
if op == "click":
    click(tab, A["ref"]); settle(tab)
    out(page=snapshot(tab, "", True, 2500), points=POINTS)
if op == "fill":
    last = None
    for f in A.get("fields") or []:
        ref = int(f["ref"]); last = ref
        info = tab.js("(() => { const e = %s; if (!e) return null; return {tag: e.tagName, type: e.type || '', ce: e.isContentEditable}; })()" % el(ref))
        if not info: out(error="Element [%s] is gone. Call browser_read again." % ref)
        if f.get("files"):
            center(tab, ref)
            # Many sites hide the real file field behind a styled "Select files" button or drop zone:
            # find the field that button belongs to, so the file goes in without the system file window.
            node = tab.js("(() => { const e = %s; if (!e) return null; const isFile = (x) => x && x.tagName === 'INPUT' && x.type === 'file';"
                          " if (isFile(e)) return e; if (isFile(e.control)) return e.control; const lab = e.closest('label'); if (lab && isFile(lab.control)) return lab.control;"
                          " for (let p = e; p; p = p.parentElement) { const f = p.querySelector && p.querySelector('input[type=file]'); if (f) return f; }"
                          " return document.querySelector('input[type=file]'); })()" % el(ref), False)
            if not node or not node.get("objectId"): out(error="There is no file upload field on this page near [%s]." % ref)
            tab.call("DOM.setFileInputFiles", {"files": f["files"], "objectId": node["objectId"]})
            continue
        v = f.get("value")
        if info["tag"] == "SELECT":
            center(tab, ref)
            ok = tab.js("(() => { const e = %s, v = %s.toLowerCase(); const o = [...e.options].find((o) => o.value.toLowerCase() === v || o.text.trim().toLowerCase() === v) || [...e.options].find((o) => o.text.toLowerCase().includes(v)); if (!o) return false; e.value = o.value; e.dispatchEvent(new Event('input', {bubbles: true})); e.dispatchEvent(new Event('change', {bubbles: true})); return true; })()" % (el(ref), json.dumps(str(v))))
            if not ok: out(error="Option %r not found in [%s]." % (v, ref))
            continue
        if info["type"] in ("checkbox", "radio"):
            want = v if isinstance(v, bool) else str(v).lower() in ("true", "1", "yes", "on", "checked")
            if tab.js("%s.checked" % el(ref)) != want: click(tab, ref)
            continue
        center(tab, ref)
        tab.js("(() => { const e = %s; e.focus(); if (e.select) e.select(); else if (e.isContentEditable) { const r = document.createRange(); r.selectNodeContents(e); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } })()" % el(ref))
        if str(v or ""): tab.call("Input.insertText", {"text": str(v)})
        else: key(tab, "Backspace")
        tab.js("(() => { const e = %s; e.dispatchEvent(new Event('change', {bubbles: true})); })()" % el(ref))
    if A.get("press_enter") and last is not None:
        key(tab, "Enter"); settle(tab)
    elif A.get("click_ref") is not None:
        click(tab, A["click_ref"]); settle(tab)
    out(page=snapshot(tab, "", True, 2500), points=POINTS)
if op == "js":
    v = tab.js("(async () => { %s })()" % A["code"] if "return" in A["code"] else A["code"])
    out(value=v, url=tab.js("location.href"))
if op == "probe":
    out(info=tab.js("(() => { const e = %s; if (!e) return null; const b = e.closest('button,input[type=submit],input[type=button],input[type=image],a,[role=button],summary,label') || e; const text = (b.innerText || b.value || b.getAttribute('aria-label') || b.title || '').trim().replace(/\\s+/g, ' ').slice(0, 80); const submit = (b.tagName === 'BUTTON' && !!b.form && (b.getAttribute('type') || 'submit') === 'submit') || (b.tagName === 'INPUT' && ['submit', 'image'].includes(b.type)); const form = e.form || e.closest?.('form'); const s = form && form.querySelector('button[type=submit],button:not([type]),input[type=submit]'); return {text, submit, formSubmit: s ? (s.innerText || s.value || '').trim().slice(0, 80) : ''}; })()" % el(A["ref"])), url=tab.js("location.href"), title=tab.js("document.title"), pay=bool(tab.js("!!document.querySelector('input[autocomplete^=\"cc-\"],input[name*=\"cvc\" i],input[name*=\"cvv\" i],iframe[src*=\"stripe\"],iframe[src*=\"adyen\"],iframe[src*=\"paypal\"]')")))
out(error="unknown op")
`;

/** Runs one browser operation on the bot's computer. */
export async function cdp(ctx: BrowserCtx, payload: Record<string, unknown>): Promise<any> {
  const { computerId, screenId } = await screenFor(ctx.userId, ctx.botId);
  const b64 = Buffer.from(JSON.stringify({ ...payload, port: cdpPort(screenId) }), 'utf8').toString('base64');
  const tmp = `/tmp/fino-cdp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.b64`;
  await orgo.bash(computerId, screenId, `: > ${tmp}`, 20);
  for (let i = 0; i < b64.length; i += 60000) await orgo.bash(computerId, screenId, `printf '%s' '${b64.slice(i, i + 60000)}' >> ${tmp}`, 20);
  const r = await orgo.bash(computerId, screenId, `timeout -k 3 70 python3 - ${tmp} <<'FINOPY'\n${CDP}\nFINOPY`, 80);
  const out = String(r.output ?? '');
  const line = out.split('\n').reverse().find((l) => l.startsWith('FINO_RESULT:'));
  if (!line) throw new Error(`The browser didn't answer: ${out.trim().slice(-400) || `exit ${r.exit_code}`}`);
  const res = JSON.parse(line.slice('FINO_RESULT:'.length));
  if (res?.error) throw new Error(res.error);
  return res;
}

/** The page as compact lines the model reads easily: header, numbered elements, then text. */
export function formatPage(page: any, tabs?: any[] | null): string {
  if (!page) return 'No page.';
  const lines = [`URL: ${String(page.url).length > 200 ? String(page.url).slice(0, 200) + '…' : page.url}`, `Title: ${page.title}`];
  if (tabs) lines.push(`Tabs: ${tabs.map((t: any) => `[tab ${t.index}] ${t.title}`).join(' | ')}`);
  if (page.pay) lines.push('NOTE: this is a billing page. You may browse, sign in and get everything ready, but never press the button that pays, and ask the owner before you cancel anything.');
  lines.push(`Scrolled ${page.scroll}px of ${page.height}px (window ${page.viewport}px).`, '', 'Elements (use the number in brackets):');
  for (const e of page.elements ?? []) {
    let s = `[${e.ref}] ${e.kind} "${e.label}"`;
    if (e.value !== undefined && e.value !== '') s += ` = "${e.value}"`;
    if (e.checked !== undefined) s += e.checked ? ' (checked)' : ' (unchecked)';
    if (e.options) s += ` options: ${e.options.join(' / ')}`;
    if (e.href) s += ` → ${e.href}`;
    if (e.required) s += ' (required)';
    if (e.disabled) s += ' (disabled)';
    if (e.offscreen) s += ' (scroll to see)';
    lines.push(s);
  }
  if (!(page.elements ?? []).length) lines.push('(none found)');
  if (page.text) lines.push('', 'Page text:', page.text);
  return lines.join('\n');
}

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false });
const notLocal = (ctx: BrowserCtx) => {
  if (ctx.desktopTarget) throw new Error("The browser_* tools work in your own Linux browser. While you're driving the owner's device, use the computer_* tools.");
};
const host = (u: string) => { try { return new URL(u).host; } catch { return u.slice(0, 60); } };

/** Built with a starter that opens Chrome when it isn't running yet (open_browser, from tools.ts). */
export type Pointer = (ctx: any, x: number, y: number, action: 'move' | 'click') => void;
/** Shows the bot's mouse gliding to each element it clicks or fills, so the owner sees the work happen. */
async function glide(ctx: any, points: { x: number; y: number }[] | undefined, pointer: Pointer, click: boolean) {
  for (const [i, p] of (points ?? []).entries()) {
    pointer(ctx, p.x, p.y, click && i === (points!.length - 1) ? 'click' : 'move');
    if (i < points!.length - 1) await new Promise((r) => setTimeout(r, 220));
  }
}

export function browserTools(startBrowser: (url: string, ctx: any) => Promise<unknown>, pointer: Pointer = () => {}) {
  return [
    {
      name: 'browser_navigate',
      description: 'Open a URL in your own Chrome (or "back" / "forward") and get the page as text: numbered buttons, links and form fields, plus the page text. Use the numbers with browser_click and browser_fill. Much faster and cheaper than screenshots; prefer it for any website. Use read_page instead when you only need to read a public page.',
      parameters: obj({ url: { type: 'string' } }, ['url']),
      activity: 'browsing_web' as const,
      label: 'Browsing a site',
      impl: async (a: any, ctx: any): Promise<BrowserResult> => {
        notLocal(ctx);
        let r = await cdp(ctx, { op: 'navigate', url: String(a.url) });
        if (r.need_browser) {
          await startBrowser(String(a.url), ctx);
          r = await cdp(ctx, { op: 'read', chars: 4000 });
        }
        return { output: formatPage(r.page, r.tabs), summary: `Opened ${host(r.page?.url ?? a.url)}` };
      },
    },
    {
      name: 'browser_read',
      description: 'Read the page open in your Chrome as text: numbered elements and the page text. Pass query to find a button, field or text on the page, scroll (1 = one screen down, -1 = up) to read further, or tab to switch to another open tab. Numbers stay the same while the page stays.',
      parameters: obj({ query: { type: 'string' }, scroll: { type: 'integer' }, tab: { type: 'integer' }, chars: { type: 'integer', description: 'Max page text characters (default 6000)' } }),
      activity: 'browsing_web' as const,
      label: 'Reading the page',
      impl: async (a: any, ctx: any): Promise<BrowserResult> => {
        notLocal(ctx);
        const r = await cdp(ctx, { op: 'read', query: a.query ?? '', scroll: a.scroll ?? 0, tab: a.tab ?? null, chars: Math.min(Math.max(Number(a.chars) || 6000, 500), 30000) });
        return { output: formatPage(r.page, r.tabs), summary: a.query ? `Found ${r.page?.elements?.length ?? 0} matches` : `Read ${host(r.page?.url ?? '')}` };
      },
    },
    {
      name: 'browser_click',
      description: 'Click an element by its number from browser_read / browser_navigate. Returns the page after the click. Final steps (submit an application, send, order) wait for the owner, and payments are never done.',
      parameters: obj({ ref: { type: 'integer' } }, ['ref']),
      activity: 'browsing_web' as const,
      label: 'Clicking',
      impl: async (a: any, ctx: any): Promise<BrowserResult> => {
        notLocal(ctx);
        const r = await cdp(ctx, { op: 'click', ref: Number(a.ref) });
        await glide(ctx, r.points, pointer, true);
        return { output: formatPage(r.page), summary: `Clicked [${a.ref}]` };
      },
    },
    {
      name: 'browser_fill',
      description: 'Fill a whole form in one step: fields is a list of {ref, value} (text, a select option, true/false for checkboxes) or {ref, files} to upload files from your Library (absolute paths; ref can be the file field or the site\'s own Select files / upload button, the file goes straight in). Never open the system file window to upload. Then optionally press_enter or click_ref (e.g. a Next button). Returns the page after. Never fill payment details.',
      parameters: obj({
        fields: { type: 'array', items: obj({ ref: { type: 'integer' }, value: { type: ['string', 'boolean', 'number'] }, files: { type: 'array', items: { type: 'string' } } }, ['ref']) },
        press_enter: { type: 'boolean' },
        click_ref: { type: 'integer' },
      }, ['fields']),
      activity: 'browsing_web' as const,
      label: 'Filling a form',
      impl: async (a: any, ctx: any): Promise<BrowserResult> => {
        notLocal(ctx);
        const lib = `/root/grokbot/files/${ctx.botId}/`;
        for (const f of a.fields ?? []) for (const p of f.files ?? []) if (!String(p).startsWith(lib) || String(p).includes('..')) throw new Error(`Upload files from your Library folder (${lib}) only.`);
        const r = await cdp(ctx, { op: 'fill', fields: a.fields ?? [], press_enter: !!a.press_enter, click_ref: a.click_ref ?? null });
        await glide(ctx, r.points, pointer, a.click_ref != null);
        return { output: formatPage(r.page), summary: `Filled ${(a.fields ?? []).length} field${(a.fields ?? []).length === 1 ? '' : 's'}` };
      },
    },
    {
      name: 'browser_run_js',
      description: 'Run JavaScript in the open page and get the result (e.g. extract a table as JSON: return [...document.querySelectorAll("tr")].map(r => r.innerText)). Use return for a value. Needs the owner\'s OK each time.',
      parameters: obj({ code: { type: 'string' }, purpose: { type: 'string', description: "One short sentence in the user's language: what this script does." } }, ['code', 'purpose']),
      activity: 'browsing_web' as const,
      label: 'Running a page script',
      impl: async (a: any, ctx: any): Promise<BrowserResult> => {
        notLocal(ctx);
        const r = await cdp(ctx, { op: 'js', code: String(a.code) });
        const v = JSON.stringify(r.value ?? null);
        return { output: JSON.stringify({ url: r.url, value: v.length > 30000 ? v.slice(0, 30000) + '…(truncated)' : r.value }), summary: 'Ran a page script' };
      },
    },
  ];
}

export const BROWSER_READS = ['browser_read'];
/** Every browser tool returns web content: untrusted text, never instructions. */
export const BROWSER_TOOL_NAMES = ['browser_navigate', 'browser_read', 'browser_click', 'browser_fill', 'browser_run_js'];
