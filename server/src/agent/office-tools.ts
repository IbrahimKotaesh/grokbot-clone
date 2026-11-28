// Work tools for the bot's own computer, in the spirit of Claude Code's: read and edit files precisely,
// search them, analyse data in Python with charts, make real Excel / Word / PowerPoint files, and compare
// files. Cheap models (DeepSeek, Qwen) get them wrong far less often than long shell one-liners, and each
// one replaces several shell steps, so they also save tokens.
//
// Everything runs on the bot's computer (local desktop or Orgo) through one Python helper. File tools are
// confined to the bot's Library folder; Python libraries install themselves on first use.
import { publishAttachment } from '../attachments.js';
import { orgo } from '../orgo.js';
import { screenFor } from '../computer.js';

/** A safe file name: the one asked for, else the document's title, else the first heading, else a plain default. */
function fileName(a: any, fallback: string): string {
  const ext = fallback.slice(fallback.lastIndexOf('.'));
  const heading = Array.isArray(a?.blocks) ? a.blocks.find((b: any) => b?.type === 'heading' && b?.text)?.text : undefined;
  const raw = [a?.filename, a?.title, heading].find((v) => typeof v === 'string' && v.trim() && v.trim() !== 'undefined');
  if (!raw) return fallback;
  const name = String(raw).trim().replace(/[^\w.\- ؀-ۿ/]/g, '_').replace(/_+/g, '_').slice(0, 110);
  return /\.[a-z0-9]{3,4}$/i.test(name) ? name : name + ext;
}

export interface OfficeCtx { userId: string; botId: string }
export interface OfficeResult { output: string; summary?: string }

const libraryOf = (botId: string) => `/root/grokbot/files/${botId}`;

// Module → [Debian package, pip package]
const PY_LIBS: Record<string, [string, string]> = {
  openpyxl: ['python3-openpyxl', 'openpyxl'],
  pandas: ['python3-pandas', 'pandas'],
  matplotlib: ['python3-matplotlib', 'matplotlib'],
  docx: ['python3-docx', 'python-docx'],
  pptx: ['python3-pptx', 'python-pptx'],
  reportlab: ['python3-reportlab', 'reportlab'],
  pypdf: ['python3-pypdf', 'pypdf'],
  bs4: ['python3-bs4', 'beautifulsoup4'],
  requests: ['python3-requests', 'requests'],
  PIL: ['python3-pil', 'pillow'],
  numpy: ['python3-numpy', 'numpy'],
};
/** Libraries a piece of Python code imports that Badr knows how to install (its own pip install would fail). */
export function importedLibs(code: string): string[] {
  const found = new Set<string>();
  for (const m of code.matchAll(/^\s*(?:from\s+([A-Za-z_]\w*)|import\s+([A-Za-z_][\w, .]*))/gm)) {
    for (const name of (m[1] ?? m[2] ?? '').split(',').map((x) => x.trim().split(/[ .]/)[0])) if (PY_LIBS[name]) found.add(name);
  }
  return [...found];
}

/** Shell that makes sure the given Python modules import, installing them once if needed. */
function ensureLibs(mods: string[]): string {
  if (!mods.length) return '';
  const check = `python3 -c "import ${mods.join(',')}" 2>/dev/null`;
  const apt = mods.map((m) => PY_LIBS[m][0]).join(' ');
  const pip = mods.map((m) => PY_LIBS[m][1]).join(' ');
  return `${check} || { (apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ${apt}) >/tmp/fino-pylibs.log 2>&1; ${check} || python3 -m pip install -q --break-system-packages ${pip} >>/tmp/fino-pylibs.log 2>&1 || (DEBIAN_FRONTEND=noninteractive apt-get install -y -qq python3-pip >>/tmp/fino-pylibs.log 2>&1 && python3 -m pip install -q --break-system-packages ${pip} >>/tmp/fino-pylibs.log 2>&1); }\n`;
}

/** Shared Python prelude: payload in, a FINO_RESULT line out, and Library path checks. */
const PRELUDE = String.raw`
import sys, os, json, base64, pathlib
_raw = open(sys.argv[1]).read(); os.remove(sys.argv[1])
A = json.loads(base64.b64decode(_raw))
ROOT = pathlib.Path(A["_root"]).resolve()
ROOT.mkdir(parents=True, exist_ok=True)
def done(**kw):
    print("FINO_RESULT:" + json.dumps(kw, ensure_ascii=False)); sys.exit(0)
def fail(msg):
    print("FINO_RESULT:" + json.dumps({"error": msg}, ensure_ascii=False)); sys.exit(0)
def lib_path(p, must_exist=False):
    p = str(p or "").strip()
    if not p: fail("Give a file path inside your Library.")
    q = pathlib.Path(p)
    q = (q if q.is_absolute() else ROOT / q).resolve()
    if q != ROOT and ROOT not in q.parents: fail("Use a path inside your Library folder " + str(ROOT))
    if must_exist and not q.exists(): fail("No such file: " + str(q))
    return q
`;

/** Runs a Python script on the bot's computer with a JSON payload and returns its FINO_RESULT. */
export async function runPy(ctx: OfficeCtx, script: string, payload: Record<string, unknown>, opts: { libs?: string[]; timeout?: number } = {}): Promise<any> {
  const { computerId, screenId } = await screenFor(ctx.userId, ctx.botId);
  const b64 = Buffer.from(JSON.stringify({ ...payload, _root: libraryOf(ctx.botId) }), 'utf8').toString('base64');
  const tmp = `/tmp/fino-py-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.b64`;
  await orgo.bash(computerId, screenId, `: > ${tmp}`, 30);
  for (let i = 0; i < b64.length; i += 60000) await orgo.bash(computerId, screenId, `printf '%s' '${b64.slice(i, i + 60000)}' >> ${tmp}`, 30);
  const cmd = `${ensureLibs(opts.libs ?? [])}cd ${libraryOf(ctx.botId)} 2>/dev/null || mkdir -p ${libraryOf(ctx.botId)}; cd ${libraryOf(ctx.botId)}; MPLBACKEND=Agg python3 - ${tmp} <<'FINOPY'\n${PRELUDE}\n${script}\nFINOPY`;
  const r = await orgo.bash(computerId, screenId, cmd, Math.min(opts.timeout ?? 180, 290));
  const out = String(r.output ?? '');
  const line = out.split('\n').reverse().find((l) => l.startsWith('FINO_RESULT:'));
  if (!line) throw new Error(`The tool didn't finish: ${out.trim().slice(-600) || `exit ${r.exit_code}`}`);
  const res = JSON.parse(line.slice('FINO_RESULT:'.length));
  if (res?.error) throw new Error(res.error);
  // Anything the script printed before its result (run_python's stdout) is returned too.
  res._stdout = out.slice(0, out.lastIndexOf('FINO_RESULT:')).trim();
  return res;
}

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false });
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + `\n…(${s.length - n} more characters)` : s);

function sendFile(ctx: OfficeCtx, name: string, b64: string | undefined, caption: unknown) {
  if (!b64) return null;
  return publishAttachment(ctx.userId, ctx.botId, name, Buffer.from(b64, 'base64'), typeof caption === 'string' ? caption.slice(0, 2000) : '');
}

// ---------------------------------------------------------------------------------------------

const VIEW = String.raw`
p = lib_path(A.get("path"), True)
if p.is_dir():
    items = sorted(p.iterdir())[:300]
    done(kind="folder", path=str(p), entries=[(i.name + ("/" if i.is_dir() else "")) for i in items])
data = p.read_bytes()
if b"\x00" in data[:4096]: fail("This is a binary file (" + p.suffix + "). Use run_python to read it, e.g. pandas for .xlsx.")
lines = data.decode("utf-8", "replace").splitlines()
start = max(1, int(A.get("offset") or 1)); limit = min(max(1, int(A.get("limit") or 400)), 2000)
chunk = lines[start-1:start-1+limit]
text = "\n".join("%6d\t%s" % (start+i, l[:2000]) for i, l in enumerate(chunk))
done(kind="file", path=str(p), total_lines=len(lines), shown=[start, start+len(chunk)-1], text=text)
`;

const EDIT = String.raw`
p = lib_path(A.get("path"))
old = A.get("old_text") or ""; new = A.get("new_text") or ""
if not p.exists():
    if old: fail("File not found: " + str(p) + ". To create it, leave old_text empty.")
    p.parent.mkdir(parents=True, exist_ok=True); p.write_text(new, encoding="utf-8")
    done(created=True, path=str(p), lines=len(new.splitlines()))
text = p.read_text(encoding="utf-8")
if not old: fail("old_text is empty. Give the exact text to replace (copy it from view_file, without the line numbers).")
n = text.count(old)
if n == 0: fail("old_text was not found in the file. View the file again and copy the exact text, including spaces and line breaks.")
if n > 1 and not A.get("replace_all"): fail("old_text appears %d times. Add more surrounding lines so it is unique, or set replace_all." % n)
text = text.replace(old, new) if A.get("replace_all") else text.replace(old, new, 1)
p.write_text(text, encoding="utf-8")
at = text.find(new) if new else -1
line = text[:at].count("\n") + 1 if at >= 0 else 0
ctx_lines = text.splitlines()[max(0, line-3):line+len(new.splitlines())+2] if line else []
done(path=str(p), replaced=(n if A.get("replace_all") else 1), around_line=line, preview="\n".join(ctx_lines)[:3000])
`;

const FIND = String.raw`
import re, fnmatch
pat = A.get("pattern") or "**/*"
query = A.get("query") or ""
mx = min(max(1, int(A.get("max_results") or 100)), 500)
files = [f for f in ROOT.glob(pat) if f.is_file()][:5000]
if not query:
    done(files=[str(f.relative_to(ROOT)) for f in sorted(files)[:mx]], total=len(files))
try: rx = re.compile(query, 0 if A.get("case_sensitive") else re.I)
except re.error: rx = re.compile(re.escape(query), 0 if A.get("case_sensitive") else re.I)
hits = []
for f in sorted(files):
    try:
        b = f.read_bytes()
        if b"\x00" in b[:4096] or len(b) > 20_000_000: continue
        for i, l in enumerate(b.decode("utf-8", "replace").splitlines(), 1):
            if rx.search(l):
                hits.append("%s:%d: %s" % (f.relative_to(ROOT), i, l.strip()[:300]))
                if len(hits) >= mx: done(matches=hits, truncated=True)
    except Exception: pass
done(matches=hits, truncated=False)
`;

const PYTHON = String.raw`
import io, contextlib, traceback, glob
code = A["code"]
buf = io.StringIO(); err = None
before = set(glob.glob(str(ROOT / "**" / "*"), recursive=True))
g = {"__name__": "__main__", "LIBRARY": str(ROOT)}
try:
    import matplotlib; matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    plt.rcParams["font.family"] = ["Noto Sans", "DejaVu Sans"]
except Exception: plt = None
with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
    try: exec(compile(code, "analysis.py", "exec"), g)
    except SystemExit: pass
    except Exception: err = traceback.format_exc(limit=4)
charts = []
if plt is not None:
    for n, num in enumerate(plt.get_fignums()):
        fig = plt.figure(num); out = ROOT / ("chart-%d.png" % (n + 1)) if not A.get("chart_name") else ROOT / ("%s-%d.png" % (A["chart_name"], n + 1))
        fig.savefig(out, dpi=150, bbox_inches="tight"); charts.append({"path": str(out), "b64": base64.b64encode(out.read_bytes()).decode()})
    plt.close("all")
after = set(glob.glob(str(ROOT / "**" / "*"), recursive=True))
new_files = sorted(f for f in after - before if os.path.isfile(f) and not any(f == c["path"] for c in charts))
done(stdout=buf.getvalue()[-20000:], error=err, charts=charts[:6], new_files=new_files[:50])
`;

const SHEET = String.raw`
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
name = A["filename"] if A["filename"].lower().endswith(".xlsx") else A["filename"] + ".xlsx"
p = lib_path(name); p.parent.mkdir(parents=True, exist_ok=True)
wb = Workbook(); wb.remove(wb.active)
head_fill = PatternFill("solid", fgColor="1F4E79"); thin = Side(style="thin", color="D0D7E2")
def num(v):
    if isinstance(v, str):
        s = v.strip().replace(",", "")
        if s.startswith("="): return v
        # Keep codes like invoice numbers or phone numbers with a leading zero as text.
        if len(s) > 1 and s.startswith("0") and not s.startswith("0."): return v
        try: return int(s) if s.lstrip("-").isdigit() else float(s)
        except ValueError: return v
    return v
for sh in A["sheets"][:20]:
    ws = wb.create_sheet((sh.get("name") or "Sheet")[:31])
    cols = sh.get("columns") or []; rows = sh.get("rows") or []
    rtl = any(any("؀" <= ch <= "ۿ" for ch in str(c)) for c in cols)
    if rtl: ws.sheet_view.rightToLeft = True
    ws.append(cols)
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF"); c.fill = head_fill; c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    for r in rows[:100000]: ws.append([num(v) for v in r])
    last = ws.max_row
    if sh.get("totals") and rows:
        tot = ["Total" if not rtl else "المجموع"] + [""] * (len(cols) - 1)
        for j in range(len(cols)):
            vals = [num(r[j]) for r in rows if j < len(r)]
            if j > 0 and vals and all(isinstance(v, (int, float)) for v in vals if v not in ("", None)) and any(isinstance(v, (int, float)) for v in vals):
                L = get_column_letter(j + 1); tot[j] = "=SUM(%s2:%s%d)" % (L, L, last)
        ws.append(tot)
        for c in ws[ws.max_row]: c.font = Font(bold=True); c.border = Border(top=Side(style="medium"))
    fmt = sh.get("number_format")
    for row in ws.iter_rows(min_row=2):
        for c in row:
            c.border = Border(bottom=thin)
            if isinstance(c.value, float) or (isinstance(c.value, str) and c.value.startswith("=")): c.number_format = fmt or "#,##0.00"
    for j, col in enumerate(cols, 1):
        width = max([len(str(col))] + [len(str(r[j-1])) for r in rows[:500] if j-1 < len(r)]) + 2
        ws.column_dimensions[get_column_letter(j)].width = min(max(width, 8), 60)
    ws.freeze_panes = "A2"
    if cols: ws.auto_filter.ref = "A1:%s%d" % (get_column_letter(len(cols)), last)
wb.save(p)
done(path=str(p), name=p.name, sheets=[s.title for s in wb.worksheets], b64=base64.b64encode(p.read_bytes()).decode())
`;

const DOC = String.raw`
name = A["filename"]; kind = "pptx" if name.lower().endswith(".pptx") else "docx"
if not name.lower().endswith("." + kind): name += "." + kind
p = lib_path(name); p.parent.mkdir(parents=True, exist_ok=True)
def is_ar(s): return any("؀" <= ch <= "ۿ" for ch in str(s))
if kind == "docx":
    from docx import Document
    from docx.shared import Pt
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement
    d = Document()
    def rtl(par, text):
        if is_ar(text):
            par.alignment = WD_ALIGN_PARAGRAPH.RIGHT
            pPr = par._p.get_or_add_pPr(); b = OxmlElement("w:bidi"); b.set(qn("w:val"), "1"); pPr.append(b)
            for r in par.runs: r.font.rtl = True
        return par
    if A.get("title"): rtl(d.add_heading(A["title"], 0), A["title"])
    for b in A.get("blocks") or []:
        t = b.get("type"); text = b.get("text") or ""
        if t == "heading": rtl(d.add_heading(text, min(max(int(b.get("level") or 1), 1), 4)), text)
        elif t == "bullets":
            for it in b.get("items") or []: rtl(d.add_paragraph(str(it), style="List Bullet"), it)
        elif t == "numbered":
            for it in b.get("items") or []: rtl(d.add_paragraph(str(it), style="List Number"), it)
        elif t == "table":
            cols = b.get("columns") or []; rows = b.get("rows") or []
            tb = d.add_table(rows=1, cols=max(1, len(cols))); tb.style = "Light Grid Accent 1"
            for i, c in enumerate(cols): tb.rows[0].cells[i].text = str(c)
            for r in rows[:2000]:
                cells = tb.add_row().cells
                for i, v in enumerate(r[:len(cols)]): cells[i].text = str(v)
        elif t == "page_break": d.add_page_break()
        else: rtl(d.add_paragraph(text), text)
    d.save(p)
else:
    from pptx import Presentation
    from pptx.util import Pt
    pr = Presentation()
    if A.get("title"):
        s = pr.slides.add_slide(pr.slide_layouts[0]); s.shapes.title.text = A["title"]
        if A.get("subtitle"): s.placeholders[1].text = A["subtitle"]
    for sl in A.get("slides") or []:
        s = pr.slides.add_slide(pr.slide_layouts[1]); s.shapes.title.text = sl.get("title") or ""
        body = s.placeholders[1].text_frame; body.clear()
        for i, it in enumerate(sl.get("bullets") or []):
            para = body.paragraphs[0] if i == 0 else body.add_paragraph(); para.text = str(it); para.font.size = Pt(20)
        if sl.get("notes"): s.notes_slide.notes_text_frame.text = sl["notes"]
    pr.save(p)
done(path=str(p), name=p.name, b64=base64.b64encode(p.read_bytes()).decode())
`;

const COMPARE = String.raw`
import difflib, csv

a = lib_path(A.get("file_a"), True); b = lib_path(A.get("file_b"), True)
def table(p):
    if p.suffix.lower() in (".xlsx", ".xlsm"):
        from openpyxl import load_workbook
        ws = load_workbook(p, data_only=True, read_only=True).worksheets[0]
        rows = [[("" if v is None else str(v)) for v in r] for r in ws.iter_rows(values_only=True)]
    else:
        with open(p, newline="", encoding="utf-8", errors="replace") as f: rows = [r for r in csv.reader(f)]
    return (rows[0] if rows else []), rows[1:]
if a.suffix.lower() in (".csv", ".xlsx", ".xlsm") and b.suffix.lower() in (".csv", ".xlsx", ".xlsm"):
    ha, ra = table(a); hb, rb = table(b)
    key = A.get("key_column")
    if key and key in ha and key in hb:
        ka, kb = ha.index(key), hb.index(key)
        ma = {r[ka]: r for r in ra if len(r) > ka}; mb = {r[kb]: r for r in rb if len(r) > kb}
        added = [k for k in mb if k not in ma]; removed = [k for k in ma if k not in mb]
        changed = []
        for k in ma:
            if k in mb:
                da = dict(zip(ha, ma[k])); db_ = dict(zip(hb, mb[k]))
                diffs = {c: [da.get(c, ""), db_.get(c, "")] for c in set(ha) | set(hb) if da.get(c, "") != db_.get(c, "")}
                if diffs: changed.append({key: k, "changes": diffs})
        done(mode="table_by_key", key=key, rows_a=len(ra), rows_b=len(rb), added=added[:200], removed=removed[:200], changed=changed[:200], columns_added=[c for c in hb if c not in ha], columns_removed=[c for c in ha if c not in hb])
    sa = set(tuple(r) for r in ra); sb = set(tuple(r) for r in rb)
    done(mode="table_rows", rows_a=len(ra), rows_b=len(rb), only_in_a=[list(r) for r in ra if tuple(r) not in sb][:200], only_in_b=[list(r) for r in rb if tuple(r) not in sa][:200], header_a=ha, header_b=hb, hint="Pass key_column (a column name in both) to see changed values row by row.")
ta = a.read_text(encoding="utf-8", errors="replace").splitlines(); tb = b.read_text(encoding="utf-8", errors="replace").splitlines()
diff = list(difflib.unified_diff(ta, tb, str(a.name), str(b.name), lineterm="", n=2))
done(mode="text", lines_a=len(ta), lines_b=len(tb), identical=not diff, diff="\n".join(diff)[:30000])
`;

export const OFFICE_TOOLS = [
  {
    name: 'view_file',
    description: 'Read a text file (or list a folder) in your Library on your computer, with line numbers. Use it before edit_file. Paths are relative to your Library folder or absolute inside it. For .xlsx/.docx use run_python.',
    parameters: obj({ path: { type: 'string' }, offset: { type: 'integer', description: 'First line (default 1)' }, limit: { type: 'integer', description: 'How many lines (default 400)' } }, ['path']),
    activity: 'drafting_file' as const,
    label: 'Reading a file',
    impl: async (a: any, ctx: OfficeCtx): Promise<OfficeResult> => {
      const r = await runPy(ctx, VIEW, a);
      delete r._stdout;
      return { output: clip(JSON.stringify(r), 40000), summary: r.kind === 'folder' ? `Listed ${r.entries.length} items` : `Read ${r.path.split('/').pop()}` };
    },
  },
  {
    name: 'edit_file',
    description: 'Change a text file in your Library precisely: replaces old_text with new_text (exact match, must be unique unless replace_all). Leave old_text empty to create a new file. Far safer than editing with shell. Copy old_text from view_file without the line numbers.',
    parameters: obj({ path: { type: 'string' }, old_text: { type: 'string' }, new_text: { type: 'string' }, replace_all: { type: 'boolean' } }, ['path', 'old_text', 'new_text']),
    activity: 'drafting_file' as const,
    label: 'Editing a file',
    impl: async (a: any, ctx: OfficeCtx): Promise<OfficeResult> => {
      const r = await runPy(ctx, EDIT, a);
      delete r._stdout;
      return { output: JSON.stringify(r), summary: r.created ? `Created ${r.path.split('/').pop()}` : `Edited ${r.path.split('/').pop()}` };
    },
  },
  {
    name: 'find_in_files',
    description: 'Find files in your Library by name pattern (glob like "**/*.csv", "invoices/*.pdf"), and optionally search inside them for text or a regex (query). Returns file paths, or matching lines as path:line: text.',
    parameters: obj({ pattern: { type: 'string', description: 'Glob, default **/*' }, query: { type: 'string', description: 'Text or regex to look for inside the files' }, case_sensitive: { type: 'boolean' }, max_results: { type: 'integer' } }),
    activity: 'drafting_file' as const,
    label: 'Searching files',
    impl: async (a: any, ctx: OfficeCtx): Promise<OfficeResult> => {
      const r = await runPy(ctx, FIND, a);
      delete r._stdout;
      return { output: clip(JSON.stringify(r), 40000), summary: r.files ? `${r.files.length} files` : `${r.matches.length} matches` };
    },
  },
  {
    name: 'run_python',
    description: 'Run Python on your computer for data work: analysis, calculations, cleaning, reading Excel/CSV/PDF data, and charts. pandas, openpyxl, matplotlib are available, and reportlab, pypdf, bs4, requests, PIL, numpy, docx and pptx are installed for you when your code imports them (do not pip install anything yourself; it will not work). Runs in your Library folder (LIBRARY variable holds its path); print() what you need to see. Every matplotlib figure you create is saved as a PNG and shown in the chat automatically. Use make_spreadsheet for the final Excel file.',
    parameters: obj({ code: { type: 'string' }, purpose: { type: 'string', description: "One short sentence in the user's language: what this analysis does." }, chart_name: { type: 'string', description: 'Optional file name for charts, e.g. sales-by-month' }, send_charts: { type: 'boolean', description: 'Show charts in the chat (default true)' } }, ['code', 'purpose']),
    activity: 'running_commands' as const,
    label: 'Analysing data',
    impl: async (a: any, ctx: OfficeCtx): Promise<OfficeResult> => {
      const r = await runPy(ctx, PYTHON, { code: String(a.code), chart_name: a.chart_name ? String(a.chart_name).replace(/[^\w-]/g, '_').slice(0, 60) : '' }, { libs: [...new Set(['pandas', 'openpyxl', 'matplotlib', ...importedLibs(String(a.code))])], timeout: 280 });
      const sent = a.send_charts === false ? [] : (r.charts ?? []).map((c: any) => sendFile(ctx, c.path.split('/').pop(), c.b64, '')).filter(Boolean);
      const out = { stdout: clip(String(r.stdout ?? ''), 20000), error: r.error ?? undefined, charts: (r.charts ?? []).map((c: any) => c.path), charts_shown_in_chat: sent.length, new_files: r.new_files };
      return { output: JSON.stringify(out), summary: r.error ? 'Python error' : sent.length ? `Made ${sent.length} chart${sent.length > 1 ? 's' : ''}` : 'Ran the analysis' };
    },
  },
  {
    name: 'make_spreadsheet',
    description: 'Make a real Excel file (.xlsx) in your Library and send it into the chat: one or more sheets with a styled header, numbers stored as numbers, frozen header, filters and sensible column widths. Cells starting with "=" are Excel formulas (e.g. "=B2*C2"). Set totals to add a SUM row for numeric columns. Arabic headers make the sheet right-to-left.',
    parameters: obj({
      filename: { type: 'string', description: 'e.g. invoices-november.xlsx' },
      sheets: { type: 'array', items: obj({ name: { type: 'string' }, columns: { type: 'array', items: { type: 'string' } }, rows: { type: 'array', items: { type: 'array', items: { type: ['string', 'number', 'null'] } } }, totals: { type: 'boolean' }, number_format: { type: 'string', description: 'e.g. #,##0.00 or 0%' } }, ['name', 'columns', 'rows']) },
      send: { type: 'boolean', description: 'Send it into the chat (default true)' },
      caption: { type: 'string' },
    }, ['filename', 'sheets']),
    activity: 'drafting_file' as const,
    label: 'Making a spreadsheet',
    impl: async (a: any, ctx: OfficeCtx): Promise<OfficeResult> => {
      const r = await runPy(ctx, SHEET, { filename: fileName(a, 'sheet.xlsx'), sheets: a.sheets ?? [] }, { libs: ['openpyxl'] });
      const sent = a.send === false ? null : sendFile(ctx, r.name, r.b64, a.caption);
      return { output: JSON.stringify({ ok: true, path: r.path, sheets: r.sheets, sent_to_chat: !!sent }), summary: `Made ${r.name}` };
    },
  },
  {
    name: 'make_document',
    description: 'Make a Word document (.docx) or a PowerPoint deck (.pptx) in your Library and send it into the chat. For .docx pass title and blocks (heading, paragraph, bullets, numbered, table, page_break). For .pptx pass title, subtitle and slides (title, bullets, notes). Arabic text is set right-to-left. Use make_pdf when the user wants a PDF.',
    parameters: obj({
      filename: { type: 'string', description: 'Ends in .docx or .pptx' },
      title: { type: 'string' },
      subtitle: { type: 'string' },
      blocks: { type: 'array', items: obj({ type: { type: 'string', enum: ['heading', 'paragraph', 'bullets', 'numbered', 'table', 'page_break'] }, text: { type: 'string' }, level: { type: 'integer' }, items: { type: 'array', items: { type: 'string' } }, columns: { type: 'array', items: { type: 'string' } }, rows: { type: 'array', items: { type: 'array', items: { type: ['string', 'number', 'null'] } } } }, ['type']) },
      slides: { type: 'array', items: obj({ title: { type: 'string' }, bullets: { type: 'array', items: { type: 'string' } }, notes: { type: 'string' } }, ['title']) },
      send: { type: 'boolean' },
      caption: { type: 'string' },
    }, ['filename']),
    activity: 'drafting_file' as const,
    label: 'Making a document',
    impl: async (a: any, ctx: OfficeCtx): Promise<OfficeResult> => {
      const pptx = /\.pptx$/i.test(String(a.filename ?? ''));
      const r = await runPy(ctx, DOC, { ...a, filename: fileName(a, pptx ? 'presentation.pptx' : 'document.docx') }, { libs: [pptx ? 'pptx' : 'docx'] });
      const sent = a.send === false ? null : sendFile(ctx, r.name, r.b64, a.caption);
      return { output: JSON.stringify({ ok: true, path: r.path, sent_to_chat: !!sent }), summary: `Made ${r.name}` };
    },
  },
  {
    name: 'compare_files',
    description: 'Compare two files in your Library. For CSV/Excel: rows added, removed and changed (pass key_column, e.g. "Invoice number", to see which values changed per row). For text files: a line-by-line diff.',
    parameters: obj({ file_a: { type: 'string', description: 'The older or first file' }, file_b: { type: 'string', description: 'The newer or second file' }, key_column: { type: 'string' } }, ['file_a', 'file_b']),
    activity: 'drafting_file' as const,
    label: 'Comparing files',
    impl: async (a: any, ctx: OfficeCtx): Promise<OfficeResult> => {
      const xl = /\.xlsx?m?$/i.test(String(a.file_a)) || /\.xlsx?m?$/i.test(String(a.file_b));
      const r = await runPy(ctx, COMPARE, a, { libs: xl ? ['openpyxl'] : [] });
      delete r._stdout;
      const summary = r.mode === 'text' ? (r.identical ? 'Files are identical' : 'Compared the files') : `${(r.added ?? r.only_in_b ?? []).length} added, ${(r.removed ?? r.only_in_a ?? []).length} removed${r.changed ? `, ${r.changed.length} changed` : ''}`;
      return { output: clip(JSON.stringify(r), 40000), summary };
    },
  },
];

/** Read-only office tools: they never need the user's OK. */
export const OFFICE_READS = ['view_file', 'find_in_files', 'compare_files'];
