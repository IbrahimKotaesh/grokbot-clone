import { memo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { remarkCitations, remarkBidiRanges } from '../lib/remark-citations';

const components: Components = {
  a: ({ node: _n, ...props }) => <a {...props} target="_blank" rel="noreferrer noopener" />,
  table: ({ node: _n, ...props }) => (
    <div className="md-table"><table {...props} /></div>
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
