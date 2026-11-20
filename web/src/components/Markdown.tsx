import { SheetLink, sheetId } from './SheetLink';
import { memo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { remarkCitations, remarkBidiRanges } from '../lib/remark-citations';

const components: Components = {
  // External image URLs can carry private data in their path/query. Do not issue
  // automatic requests chosen by model output; generated/uploaded local images remain inline.
  img: ({src,alt}) => src && /^\/api\/bots\/[A-Za-z0-9_-]+\/images\/[A-Za-z0-9_-]+$/.test(src)
    ? <img src={src} alt={alt??''} loading="lazy" />
    : <a href={src} target="_blank" rel="noreferrer noopener">{alt?`Open external image: ${alt}`:'Open external image'}</a>,
  li: ({node:_n,...props}) => <li {...props} dir="auto" />,
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
    <div className="md" dir="auto">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkCitations, remarkBidiRanges]} components={components}>{text}</ReactMarkdown>
    </div>
  );
});
