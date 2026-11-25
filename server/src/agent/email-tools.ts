// Email the way a person does it: write a draft in the owner's Gmail (with files from the Library attached),
// show it, and send it only when the owner says so. Drafts need no OK; sending always waits for the owner,
// even on Autonomous (employee-rules.ts). Gmail is reached through the owner's own connection, never through
// the bot's browser, and attachments go straight from the bot's computer into the draft.
import { composio, connectionsDetail } from '../composio.js';
import { env } from '../env.js';
import { runPy, type OfficeCtx } from './office-tools.js';

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const MAX_ATTACH_MB = 10;

async function gmailAccount(userId: string): Promise<string> {
  if (env.composioKey === 'disabled') throw new Error('App connections are not set up on this server.');
  const c = (await connectionsDetail(userId)).find((x: { toolkit: string; status: string }) => x.toolkit === 'gmail' && x.status === 'ACTIVE');
  if (!c) throw new Error('Gmail is not connected. Call request_app_connection for gmail, then try again. Never open Gmail in your browser instead.');
  return c.id;
}

/** One call to the Gmail API with the owner's connection. Throws a plain-words error the bot can act on. */
export async function gmailApi(userId: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<any> {
  const connectedAccountId = await gmailAccount(userId);
  const r: any = await composio.tools.proxyExecute({ endpoint: `${GMAIL}${path}`, method, body, connectedAccountId, userId } as any);
  const data = r?.data ?? r;
  const status = Number(r?.status ?? data?.error?.code ?? 200);
  if (status === 401 || status === 403) throw new Error('The Gmail connection is missing permission for drafts. Ask the owner to reconnect Gmail (request_app_connection for gmail).');
  if (status === 404) throw new Error('Gmail could not find that draft or email. It may have been sent or deleted.');
  if (status >= 400 || data?.error) throw new Error(`Gmail did not accept it: ${String(data?.error?.message ?? JSON.stringify(data).slice(0, 200))}`);
  return data;
}

// Builds the email (text + attachments from the Library) on the bot's computer, where the files are.
const BUILD = String.raw`
from email.message import EmailMessage
import mimetypes
m = EmailMessage()
m["To"] = A["to"]
if A.get("cc"): m["Cc"] = A["cc"]
if A.get("bcc"): m["Bcc"] = A["bcc"]
m["Subject"] = A["subject"]
if A.get("in_reply_to"):
    m["In-Reply-To"] = A["in_reply_to"]; m["References"] = A.get("references") or A["in_reply_to"]
m.set_content(A["body"])
total, names = 0, []
for p in A.get("attachments") or []:
    q = lib_path(p, True)
    if q.is_dir(): fail("That is a folder, not a file: " + str(q))
    data = q.read_bytes(); total += len(data)
    if total > A["_max"]: fail("The attachments are too big together (over %d MB). Attach fewer or smaller files." % (A["_max"] // 1048576))
    ctype = mimetypes.guess_type(q.name)[0] or "application/octet-stream"
    main, sub = ctype.split("/", 1)
    m.add_attachment(data, maintype=main, subtype=sub, filename=q.name)
    names.append(q.name)
done(raw=base64.urlsafe_b64encode(m.as_bytes()).decode(), names=names, size=total)
`;

const header = (msg: any, name: string) => (msg?.payload?.headers ?? []).find((h: any) => String(h.name).toLowerCase() === name.toLowerCase())?.value ?? '';
const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : typeof v === 'string' && v.trim() ? v.split(',') : []).map((s) => s.trim()).filter(Boolean);

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false });

export const EMAIL_TOOLS = [
  {
    name: 'draft_email',
    description: "Write an email as a draft in the owner's Gmail, with files from your Library attached (absolute paths or relative to the Library). Nothing is sent: the draft waits in Gmail's Drafts. Show the owner what you wrote; send it with send_email only when they tell you to. To change a draft, call this again with its draft_id. To reply, pass reply_to_message_id (from search_email): it goes in the same thread. body is plain text. Never open Gmail in your browser for this, and never upload files anywhere else to attach them.",
    parameters: obj({
      to: { type: 'string', description: 'Recipient email(s), comma-separated. For a reply it defaults to the sender.' },
      subject: { type: 'string' },
      body: { type: 'string', description: 'Plain text, with line breaks.' },
      cc: { type: 'string' },
      bcc: { type: 'string' },
      attachments: { type: 'array', items: { type: 'string' }, description: 'Files from your Library to attach.' },
      reply_to_message_id: { type: 'string' },
      draft_id: { type: 'string', description: 'Update this existing draft instead of making a new one.' },
    }, ['body']),
    activity: 'connecting_service',
    label: 'Writing a draft',
    impl: async (a: any, ctx: OfficeCtx) => {
      let to = list(a.to).join(', '), subject = String(a.subject ?? '').trim(), threadId: string | undefined, inReplyTo = '', references = '';
      if (a.reply_to_message_id) {
        const q = ['Message-ID', 'Subject', 'From', 'References', 'Reply-To'].map((h) => `metadataHeaders=${h}`).join('&');
        const orig = await gmailApi(ctx.userId, 'GET', `/messages/${encodeURIComponent(String(a.reply_to_message_id))}?format=metadata&${q}`);
        threadId = orig?.threadId;
        inReplyTo = header(orig, 'Message-ID');
        references = [header(orig, 'References'), inReplyTo].filter(Boolean).join(' ');
        if (!to) to = header(orig, 'Reply-To') || header(orig, 'From');
        if (!subject) { const s = header(orig, 'Subject'); subject = /^re:/i.test(s) ? s : `Re: ${s}`; }
      }
      if (!to) throw new Error('Who is it to? Give "to" (an email address).');
      if (!subject) throw new Error('Give the email a subject.');
      const built = await runPy(ctx, BUILD, { to, subject, body: String(a.body ?? ''), cc: list(a.cc).join(', '), bcc: list(a.bcc).join(', '), attachments: list(a.attachments), in_reply_to: inReplyTo, references, _max: MAX_ATTACH_MB * 1048576 }, { timeout: 90 });
      const message = { raw: built.raw, ...(threadId ? { threadId } : {}) };
      const draft = a.draft_id
        ? await gmailApi(ctx.userId, 'PUT', `/drafts/${encodeURIComponent(String(a.draft_id))}`, { id: String(a.draft_id), message })
        : await gmailApi(ctx.userId, 'POST', '/drafts', { message });
      const files = built.names?.length ? `\nAttached: ${built.names.join(', ')}` : '';
      return {
        output: `Draft ${a.draft_id ? 'updated' : 'saved'} in Gmail (not sent). draft_id: ${draft.id}\nTo: ${to}\nSubject: ${subject}${files}\nIt is in Gmail → Drafts: https://mail.google.com/mail/u/0/#drafts\nShow the owner the text and ask before sending; send with send_email and this draft_id only when they say so.`,
        summary: `Draft to ${to}${built.names?.length ? ` · ${built.names.length} file${built.names.length > 1 ? 's' : ''}` : ''}`,
      };
    },
  },
  {
    name: 'send_email',
    description: 'Send a Gmail draft you made with draft_email, by its draft_id. Only when the owner has told you to send it; the owner is always asked to confirm before it goes.',
    parameters: obj({ draft_id: { type: 'string' }, to: { type: 'string', description: 'Who it goes to, for the confirmation card.' }, subject: { type: 'string', description: 'Its subject, for the confirmation card.' } }, ['draft_id']),
    activity: 'connecting_service',
    label: 'Sending an email',
    impl: async (a: any, ctx: OfficeCtx) => {
      const sent = await gmailApi(ctx.userId, 'POST', '/drafts/send', { id: String(a.draft_id) });
      return { output: `Sent. Gmail message id: ${sent?.id ?? '?'}${a.to ? ` · to ${a.to}` : ''}`, summary: `Sent email${a.to ? ` to ${a.to}` : ''}` };
    },
  },
];
export const EMAIL_SAFE = ['draft_email'];
