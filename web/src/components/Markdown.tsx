import { SheetLink, sheetId } from './SheetLink';
import { createContext, memo, isValidElement, useContext, type ReactNode } from 'react';
import {ChatChart} from './ChatChart';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { remarkCitations, remarkBidiRanges } from '../lib/remark-citations';

/* Direction, line by line. In an Arabic message every line with Arabic in it reads right-to-left (even one that
   starts with an English name), and only lines with no Arabic at all, like a quoted English email, read
   left-to-right. In an English message a line reads right-to-left only when it is mostly Arabic. */
const AR = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;
const LATIN = /[A-Za-z\u00C0-\u024F]/g;
const arabicShare = (t: string) => { const a = (t.match(AR) ?? []).length, l = (t.match(LATIN) ?? []).length; return a + l ? a / (a + l) : 0; };
export function messageIsRtl(text: string) {
  const plain = text.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ').replace(/\]\([^)]*\)/g, ']').replace(/https?:\/\/\S+/g, ' ');
  const first = /[A-Za-z\u00C0-\u024F\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.exec(plain)?.[0] ?? '';
  return new RegExp(AR.source).test(first) || arabicShare(plain) > 0.3;
}
const startsArabic = (t: string) => new RegExp(AR.source).test(/[A-Za-z\u00C0-\u024F\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.exec(t)?.[0] ?? '');
/** Arabic lines read right-to-left and English lines left-to-right, each on its own side. */
export function lineDir(text: string, rtlMessage: boolean): 'rtl' | 'ltr' {
  const share = arabicShare(text);
  if (!/[A-Za-z\u00C0-\u024F\u0600-\u06FF]/.test(text)) return rtlMessage ? 'rtl' : 'ltr'; // numbers, emoji only
  if (startsArabic(text)) return share > 0.15 || rtlMessage ? 'rtl' : 'ltr';
  // Starts in English: stays left-to-right unless it is mostly Arabic.
  return share > 0.5 ? 'rtl' : 'ltr';
}
/* A single newline in a chat reply is a new line, as the bot wrote it ("To: …", "Subject: …"), not a space. */
type Md = { type: string; value?: string; children?: Md[] };
function remarkLineBreaks() {
  const walk = (n: Md) => {
    if (!n.children) return;
    if (n.type === 'paragraph' || n.type === 'heading' || n.type === 'strong' || n.type === 'emphasis') {
      n.children = n.children.flatMap((c) => c.type === 'text' && c.value?.includes('\n')
        ? c.value.split('\n').flatMap((part, i) => (i ? [{ type: 'break' }, { type: 'text', value: part }] : [{ type: 'text', value: part }]))
        : [c]);
    }
    n.children.forEach(walk);
  };
  return (tree: Md) => walk(tree);
}
const RtlMessage = createContext(false);
type Hast = { type?: string; value?: string; tagName?: string; children?: Hast[] };
// A block's own words: nested lists decide for themselves.
const ownText = (n: Hast | undefined): string => !n ? '' : n.type === 'text' ? n.value ?? '' : (n.children ?? []).filter((c) => c.tagName !== 'ul' && c.tagName !== 'ol').map(ownText).join('');
function Dir({ as: Tag, node, children, ...props }: { as: any; node?: Hast; children?: ReactNode; [k: string]: unknown }) {
  const rtl = useContext(RtlMessage);
  return <Tag {...props} dir={lineDir(ownText(node), rtl)}>{children}</Tag>;
}
const dirOf = (tag: string) => ({ node, ...props }: any) => <Dir as={tag} node={node} {...props} />;

const components: Components = {
  p: dirOf('p'), h1: dirOf('h1'), h2: dirOf('h2'), h3: dirOf('h3'), h4: dirOf('h4'), h5: dirOf('h5'), h6: dirOf('h6'), blockquote: dirOf('blockquote'),
  ul: dirOf('ul'), ol: dirOf('ol'),
  pre: ({children,node:_node,...props}) => isValidElement<{className?:string}>(children)&&children.props.className==='language-fino-chart' ? <>{children}</> : <pre {...props}>{children}</pre>,
  code: ({className,children,node:_node,...props}) => className==='language-fino-chart' ? <ChatChart raw={String(children)}/> : <code className={className} {...props}>{children}</code>,
  // External image URLs can carry private data in their path/query. Do not issue
  // automatic requests chosen by model output; generated/uploaded local images remain inline.
  img: ({src,alt}) => src && /^\/api\/bots\/[A-Za-z0-9_-]+\/images\/[A-Za-z0-9_-]+$/.test(src)
    ? <img src={src} alt={alt??''} loading="lazy" />
    : <a href={src} target="_blank" rel="noreferrer noopener">{alt?`Open external image: ${alt}`:'Open external image'}</a>,
  li: dirOf('li'),
  a: ({ node: _n, ...props }) => sheetId(props.href) ? <SheetLink href={props.href!}>{props.children}</SheetLink> : <a {...props} target="_blank" rel="noreferrer noopener" />,
  td: ({node:_n,...props}) => <td {...props} dir="auto" />,
  th: ({node:_n,...props}) => <th {...props} dir="auto" />,
  table: ({ node: _n, ...props }) => (
    <div className="md-table" role="region" aria-label="Scrollable table" tabIndex={0}><table {...props} /></div>
  ),
};

/** Assistant message markdown: paragraphs, lists, blockquotes, inline code, code blocks (screen 02), tables. */
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="md" dir={messageIsRtl(text) ? 'rtl' : 'ltr'}>
      <RtlMessage.Provider value={messageIsRtl(text)}><ReactMarkdown remarkPlugins={[remarkGfm, remarkLineBreaks, remarkCitations, remarkBidiRanges]} components={components}>{text}</ReactMarkdown></RtlMessage.Provider>
    </div>
  );
});
