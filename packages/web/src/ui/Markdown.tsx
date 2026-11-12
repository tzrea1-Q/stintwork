// SPDX-License-Identifier: Apache-2.0

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./CodeBlock";
import { cn } from "./cn";

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div
      className={cn(
        "markdown min-w-0 text-sm leading-relaxed [overflow-wrap:anywhere] [&_[data-markdown-heading]]:my-5 [&_[data-markdown-heading]]:font-semibold [&_[data-markdown-heading=h1]]:text-xl [&_[data-markdown-heading=h2]]:text-lg [&_[data-markdown-heading=h3]]:text-base [&_:is(p,ul,ol,pre,blockquote,table)]:my-3 [&_:is(ul,ol)]:pl-5 [&_ul]:list-disc [&_ol]:list-decimal [&_.contains-task-list]:list-none [&_input[type=checkbox]]:mr-2 [&_input[type=checkbox]]:accent-primary [&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1 [&_code]:text-xs [&_table]:w-full [&_table]:border-collapse [&_:is(th,td)]:border [&_:is(th,td)]:border-input [&_:is(th,td)]:px-3 [&_:is(th,td)]:py-2 [&_:is(th,td)]:text-left [&_blockquote]:border-l-2 [&_blockquote]:border-ring [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_a]:text-accent-foreground [&_a]:underline [&_a]:underline-offset-4",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          h1: ({ children }) => <h3 data-markdown-heading="h1">{children}</h3>,
          h2: ({ children }) => <h4 data-markdown-heading="h2">{children}</h4>,
          h3: ({ children }) => <h5 data-markdown-heading="h3">{children}</h5>,
          h4: ({ children }) => <h6 data-markdown-heading="h4">{children}</h6>,
          h5: ({ children }) => <h6 data-markdown-heading="h5">{children}</h6>,
          h6: ({ children }) => <h6 data-markdown-heading="h6">{children}</h6>,
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
