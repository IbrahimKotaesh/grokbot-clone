// Employee rules that hold in every permission mode, Autonomous included:
//  1. Never pay or move money (blocked outright).
//  2. Final, hard-to-undo actions (submit an application, send, order, delete) wait for the owner's approval.
// They are enforced here, in code, by looking at the bot's real browser, not only by asking the model nicely.
import { orgo } from '../orgo.js';
import { screenFor } from '../computer.js';
import { env } from '../env.js';
import { isReadOnlySlug } from '../composio.js';
import { cdp } from './browser-tools.js';

export type Guard = { block?: string; decide?: string; title?: string };

/** Debugging port of the bot's own Chrome, one per screen, reachable only inside its computer. */
export const cdpPort = (screenId: string) => 9300 + (screenId === 'default' ? 0 : Number(screenId.replace('screen-', '')) || 0);

// Money words in connected-app actions (Stripe, PayPal, banks, shops, crypto…). Reading payments stays allowed.
const MONEY_SLUG = /(?:^|_)(?:PAY|PAYS|PAYMENT|PAYMENTS|PAYOUT|PAYOUTS|CHARGE|CHARGES|REFUND|TRANSFER|TRANSFERS|PURCHASE|CHECKOUT|BUY|SELL|TRADE|ORDER|ORDERS|INVOICE_PAY|SEND_MONEY|WITHDRAW|WITHDRAWAL|DEPOSIT|SUBSCRIBE|SUBSCRIPTION|DONATE|TIP|WIRE|SWAP)(?:_|$)/;
export function moneySlug(slug: string): boolean {
  const s = slug.toUpperCase();
  return MONEY_SLUG.test(s) && !isReadOnlySlug(slug) && !/(?:^|_)(?:LIST|GET|FETCH|SEARCH|RETRIEVE|FIND|READ)(?:_|$)/.test(s);
}

const luhn = (digits: string) => {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
};
/** Card numbers, IBANs and CVV-looking codes never get typed by a bot. */
export function moneyText(text: string): string | undefined {
  for (const m of text.matchAll(/(?:\d[ -]?){13,19}/g)) {
    const digits = m[0].replace(/\D/g, '');
    if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) return 'a payment card number';
  }
  if (/\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/.test(text.toUpperCase().replace(/\s+/g, ' ')) && /\d{6}/.test(text.replace(/\s/g, ''))) return 'a bank account number (IBAN)';
  return undefined;
}

// Pages where money changes hands.
const PAY_PAGE = /checkout|payment|\/pay\b|\bpay\.|billing|\/cart\b|winkelwagen|afrekenen|betalen|betaling|kassa|ideal|klarna|paypal\.|stripe\.com|checkout\.stripe|adyen|mollie|buckaroo|sumup|bunq\.me|tikkie/i;
// Unmistakably final buttons, wherever they are.
const STRONG_FINAL = /\b(submit application|send application|apply now|solliciteer( nu)?|sollicitatie versturen|place order|order now|buy now|complete purchase|confirm (purchase|order|payment|booking)|pay( now)?|betaal|afrekenen|bestel(len)?|delete( account)?|verwijder(en)?|cancel subscription|opzeggen)\b|إرسال الطلب|ادفع|احذف/i;
// Words that finish something when they sit on a form's submit button: an application, a message, an order, a deletion.
const FINAL_WORDS = /\b(submit|send|apply|solliciteer|sollicitatie versturen|verstuur|versturen|verzenden|bevestig|confirm|place order|order now|buy|purchase|pay|betaal|bestel|bestellen|book|boek|reserve|reserveer|register|sign up|aanmelden|inschrijven|delete|verwijder|remove account|cancel subscription|opzeggen|finish|complete|finaliseren|afronden|publish|publiceer|post)\b|إرسال|ارسال|تقديم|تأكيد|ادفع|اشتر|احذف/i;

const CDP_PY = String.raw`import sys,json,socket,base64,os,urllib.request
port=int(sys.argv[1]);expr=base64.b64decode(sys.argv[2]).decode()
try:pages=[p for p in json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json",timeout=2)) if p.get("type")=="page"]
except Exception:print(json.dumps({"ok":False,"why":"no-browser"}));sys.exit(0)
if not pages:print(json.dumps({"ok":False,"why":"no-page"}));sys.exit(0)
p=pages[0];u=p["webSocketDebuggerUrl"].split("/",3);path="/"+u[3]
s=socket.create_connection(("127.0.0.1",port),timeout=4);k=base64.b64encode(os.urandom(16)).decode()
s.send(f"GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {k}\r\nSec-WebSocket-Version: 13\r\n\r\n".encode())
h=b""
while b"\r\n\r\n" not in h:h+=s.recv(1)
def send(o):
 d=json.dumps(o).encode();m=os.urandom(4);n=len(d)
 hd=bytes([0x81])+(bytes([0x80|n]) if n<126 else bytes([0xFE])+n.to_bytes(2,"big") if n<65536 else bytes([0xFF])+n.to_bytes(8,"big"))
 s.send(hd+m+bytes(b^m[i%4] for i,b in enumerate(d)))
def rx(n):
 b=b""
 while len(b)<n:
  c=s.recv(n-len(b))
  if not c:raise EOFError
  b+=c
 return b
def recv():
 a,b=rx(2);n=b&127
 if n==126:n=int.from_bytes(rx(2),"big")
 elif n==127:n=int.from_bytes(rx(8),"big")
 return rx(n)
send({"id":1,"method":"Runtime.evaluate","params":{"expression":expr,"returnByValue":True}})
while True:
 r=json.loads(recv())
 if r.get("id")==1:break
v=r.get("result",{}).get("result",{}).get("value")
print(json.dumps({"ok":True,"url":p.get("url",""),"title":p.get("title",""),"value":v}))`;

/** What the page under the bot's mouse is: url, title, payment fields, and the element at a screen point. */
const PROBE = (x?: number, y?: number) => `(()=>{
  const left=window.screenX+Math.max(0,(window.outerWidth-window.innerWidth)/2), top=window.screenY+(window.outerHeight-window.innerHeight);
  const pay=!!document.querySelector('input[autocomplete^="cc-"],input[name*="cardnumber" i],input[name*="card_number" i],input[name*="cvc" i],input[name*="cvv" i],iframe[src*="stripe"],iframe[src*="adyen"],iframe[src*="mollie"],iframe[src*="paypal"],iframe[src*="braintree"]');
  const describe=(el)=>{ if(!el) return null; const b=el.closest('button,input[type=submit],input[type=button],input[type=image],a,[role=button],summary,label')||el;
    const text=(b.innerText||b.value||b.getAttribute('aria-label')||b.title||'').trim().replace(/\\s+/g,' ').slice(0,80);
    const submit=(b.tagName==='BUTTON'&&!!b.form&&(b.getAttribute('type')||'submit')==='submit')||(b.tagName==='INPUT'&&['submit','image'].includes(b.type));
    return {tag:b.tagName,text,submit}; };
  let at=null; ${x === undefined ? '' : `at=describe(document.elementFromPoint(${x}-left,${y}-top));`}
  const a=document.activeElement, f=a&&a.form; let enter=null;
  if(f){ const s=f.querySelector('button[type=submit],button:not([type]),input[type=submit]'); enter={field:a.tagName,text:s?(s.innerText||s.value||'').trim().slice(0,80):'',submit:true}; }
  return {pay, at, enter, focused: document.hasFocus()};
})()`;

async function probe(userId: string, botId: string, x?: number, y?: number): Promise<{ url: string; title: string; pay: boolean; at: any; enter: any; focused: boolean } | null> {
  const { computerId, screenId } = await screenFor(userId, botId);
  const script = Buffer.from(CDP_PY).toString('base64');
  const expr = Buffer.from(PROBE(x, y)).toString('base64');
  const r = await orgo.bash(computerId, screenId, `mkdir -p /root/grokbot/bin && f=/root/grokbot/bin/fino-cdp.py; echo '${script}' | base64 -d > $f.new && mv $f.new $f; timeout 8 python3 $f ${cdpPort(screenId)} '${expr}'`, 20);
  try {
    const out = JSON.parse((r.output ?? '').trim().split('\n').pop() ?? '');
    if (!out.ok) return null;
    return { url: out.url, title: out.title, pay: !!out.value?.pay, at: out.value?.at ?? null, enter: out.value?.enter ?? null, focused: out.value?.focused !== false };
  } catch { return null; }
}

const isEnter = (keys: string) => /(^|\+)(return|enter|kp_enter)$/i.test(keys.trim());

/** Checks a bot's next action against the employee rules. Fast: only browser-facing actions look at the page. */
export async function employeeGuard(userId: string, botId: string, name: string, args: any, opts: { pageCheck?: boolean } = {}): Promise<Guard> {
  // Connected apps: no money actions, ever.
  const slugs: string[] = name === 'COMPOSIO_MULTI_EXECUTE_TOOL'
    ? (args?.tools ?? args?.tool_calls ?? args?.actions ?? []).map((c: any) => String(c.tool_slug ?? c.slug ?? c.name ?? c.tool ?? ''))
    : [name];
  const money = slugs.find(moneySlug);
  if (money) return { block: `Fino never pays or moves money (${money}). Tell the owner what needs paying; they pay themselves.` };

  if (name === 'computer_type') {
    const what = moneyText(String(args?.text ?? ''));
    if (what) return { block: `Fino never types ${what}. Payments are always done by the owner themselves.` };
  }
  if (name === 'shell' && moneyText(String(args?.command ?? ''))) return { block: 'Fino never handles payment card or bank numbers. Payments are always done by the owner themselves.' };

  // In-page browser tools: the same rules, judged from the element itself.
  if (name === 'browser_click' || name === 'browser_fill') {
    if (name === 'browser_fill') {
      const what = (args?.fields ?? []).map((f: any) => moneyText(String(f?.value ?? ''))).find(Boolean);
      if (what) return { block: `Fino never types ${what}. Payments are always done by the owner themselves.` };
    }
    if (opts.pageCheck === false) return {};
    const fields = name === 'browser_fill' ? (args?.fields ?? []) : [];
    const ref = name === 'browser_click' ? args?.ref : args?.click_ref ?? (args?.press_enter ? fields[fields.length - 1]?.ref : fields[0]?.ref);
    if (ref === undefined || ref === null) return {};
    let p: any = null;
    try { p = await cdp({ userId, botId }, { op: 'probe', ref: Number(ref) }); } catch { p = null; }
    if (!p?.info) return {};
    const payPage = p.pay || PAY_PAGE.test(p.url) || PAY_PAGE.test(p.title);
    if (payPage && name === 'browser_fill') return { block: 'This is a payment page. Fino never types on payment pages; the owner pays themselves.' };
    // What actually gets pressed: the clicked element, or the form's submit button when Enter is pressed.
    const pressing = name === 'browser_click' || args?.click_ref != null ? { text: p.info.text, submit: p.info.submit } : args?.press_enter ? { text: p.info.formSubmit, submit: !!p.info.formSubmit } : null;
    if (!pressing) return {};
    const label = String(pressing.text ?? '');
    if (payPage && (pressing.submit || FINAL_WORDS.test(label))) return { block: `This button (“${label || 'pay'}”) is on a payment page. Fino never pays; the owner pays themselves.` };
    if ((pressing.submit && FINAL_WORDS.test(label)) || STRONG_FINAL.test(label)) {
      const host = (() => { try { return new URL(p.url).host || p.title; } catch { return p.title || String(p.url).slice(0, 60); } })();
      return { decide: `This is a final step: “${label}” on ${host}. Fino waits for your OK before finishing things like applications, orders and messages.`, title: `${label} on ${host}` };
    }
    return {};
  }

  const click = name === 'computer_click' && (!args?.button || args.button === 'left');
  // Typing only finishes something when it ends with Enter; a file path typed into the system file window never does.
  const typedEnter = name === 'computer_type' && !!args?.press_enter && !/^\/[^\s]*$/.test(String(args?.text ?? '').trim());
  const enter = (name === 'computer_key' && isEnter(String(args?.keys ?? ''))) || typedEnter;
  if (!click && !enter && name !== 'computer_type') return {};
  // Only the bot's own Linux browser can be inspected; a turn driving the owner's Mac browser skips the page check.
  if (opts.pageCheck === false || (env.computerProvider !== 'local' && env.computerProvider !== 'orgo')) return {};
  let page: Awaited<ReturnType<typeof probe>> = null;
  try { page = await probe(userId, botId, name === 'computer_click' ? Number(args.x) : undefined, name === 'computer_click' ? Number(args.y) : undefined); } catch { page = null; }
  if (!page) return {}; // No inspectable browser in front (desktop app, file dialog…): nothing to judge.

  const payPage = page.pay || PAY_PAGE.test(page.url) || PAY_PAGE.test(page.title);
  if (payPage && name !== 'computer_click') return { block: 'This is a payment page. Fino never types on payment pages; the owner pays themselves.' };
  // Keys go to whatever window is in front: when a system window (like the file picker) has focus, the page's form is not touched.
  const target = name === 'computer_click' ? page.at : enter && page.focused ? page.enter : null;
  const label = String(target?.text ?? '');
  if (payPage && target && (target.submit || FINAL_WORDS.test(label))) return { block: `This button (“${label || 'pay'}”) is on a payment page. Fino never pays; the owner pays themselves.` };
  if (target && ((target.submit && FINAL_WORDS.test(label)) || STRONG_FINAL.test(label))) {
    const host = (() => { try { return new URL(page!.url).host || page!.title; } catch { return page!.title || page!.url.slice(0, 60); } })();
    return { decide: `This is a final step: “${label}” on ${host}. Fino waits for your OK before finishing things like applications, orders and messages.`, title: `${label} on ${host}` };
  }
  return {};
}
