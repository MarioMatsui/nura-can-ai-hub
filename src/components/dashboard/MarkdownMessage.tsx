import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { cn } from '@/lib/utils';

interface MarkdownMessageProps {
  content: string;
  className?: string;
}

const MarkdownMessageInner = ({ content, className }: MarkdownMessageProps) => {
  // Remove o sidecar JSON do Receituário+ antes do render. O bloco fica dentro
  // de um comentário HTML, mas o ```json``` interno seria interpretado como bloco
  // de código pelo react-markdown — o strip garante invisibilidade total.
  const visible = (content ?? '')
    .replace(/<!--RX_JSON_START-->[\s\S]*?<!--RX_JSON_END-->/g, '')
    .trimEnd();

  return (
    <div className={cn('markdown-content', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
        // Cabeçalhos
        h1: ({ children }) => (
          <h1 className="text-2xl font-bold mt-6 mb-4 pb-2 border-b">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-xl font-bold mt-5 mb-3">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-lg font-semibold mt-4 mb-2">{children}</h3>
        ),
        h4: ({ children }) => (
          <h4 className="text-base font-semibold mt-3 mb-2">{children}</h4>
        ),
        
        // Parágrafos
        p: ({ children }) => (
          <p className="mb-3 leading-relaxed">{children}</p>
        ),
        
        // Listas
        ul: ({ children }) => (
          <ul className="list-disc list-outside ml-5 mb-3 space-y-1">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-outside ml-5 mb-3 space-y-1">{children}</ol>
        ),
        li: ({ children }) => (
          <li className="leading-relaxed">{children}</li>
        ),
        
        // Tabelas
        table: ({ children }) => (
          <div className="overflow-x-auto mb-4">
            <table className="min-w-full border-collapse border border-border">
              {children}
            </table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-muted">{children}</thead>
        ),
        tbody: ({ children }) => (
          <tbody>{children}</tbody>
        ),
        tr: ({ children }) => (
          <tr className="border-b border-border">{children}</tr>
        ),
        th: ({ children }) => (
          <th className="border border-border px-3 py-2 text-left font-semibold">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border border-border px-3 py-2">{children}</td>
        ),
        
        // Negrito e Itálico
        strong: ({ children }) => (
          <strong className="font-bold">{children}</strong>
        ),
        em: ({ children }) => (
          <em className="italic">{children}</em>
        ),
        
        // Código
        code: ({ children, ...props }) => {
          const isInline = !props.className;
          return isInline ? (
            <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">
              {children}
            </code>
          ) : (
            <code className="block bg-muted p-3 rounded my-3 overflow-x-auto text-sm font-mono">
              {children}
            </code>
          );
        },
        pre: ({ children }) => (
          <pre className="bg-muted p-3 rounded my-3 overflow-x-auto">
            {children}
          </pre>
        ),
        
        // Links
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline hover:text-primary/80 transition-colors"
          >
            {children}
          </a>
        ),
        
        // Citações
        blockquote: ({ children }) => (
          <blockquote className="border-l-4 border-primary pl-4 italic my-3 text-muted-foreground">
            {children}
          </blockquote>
        ),
        
        // Linha horizontal
        hr: () => (
          <hr className="my-4 border-t border-border" />
        ),
      }}
      >
        {visible}
      </ReactMarkdown>
    </div>
  );
};

export const MarkdownMessage = memo(MarkdownMessageInner);
