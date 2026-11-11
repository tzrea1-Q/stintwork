// SPDX-License-Identifier: Apache-2.0

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./CodeBlock";
import { cn } from "./cn";

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div
      className={cn(
        "markdown min-w-0 text-sm leading-relaxed [overflow-wrap:anywhere] [&_h1]:my-5 [&_h1]:text-xl [&_h2]:my-5 [&_h2]:text-lg [&_h3]:my-5 [&_h3]:text-base [&_h4]:my-5 [&_h5]:my-5 [&_h6]:my-5 [&_:is(h1,h2,h3,h4,h5,h6)]:font-semibold [&_:is(p,ul,ol,pre,blockquote,table)]:my-3 [&_:is(ul,ol)]:pl-5 [&_ul]:list-disc [&_ol]:list-decimal [&_.contains-task-list]:list-none [&_input[type=checkbox]]:mr-2 [&_input[type=checkbox]]:accent-primary [&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1 [&_code]:text-xs [&_table]:w-full [&_table]:border-collapse [&_:is(th,td)]:border [&_:is(th,td)]:border-input [&_:is(th,td)]:px-3 [&_:is(th,td)]:py-2 [&_:is(th,td)]:text-left [&_blockquote]:border-l-2 [&_blockquote]:border-ring [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_a]:text-accent-foreground [&_a]:underline [&_a]:underline-offset-4",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
