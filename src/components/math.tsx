import katex from "katex";

import { cn } from "@/lib/utils";

interface MathProps {
  children: string;
  className?: string;
}

/**
 * Renders TeX to HTML on the server, so formulas cost nothing on the client.
 */
export function MathBlock({ children, className }: MathProps) {
  const html = katex.renderToString(children, {
    displayMode: true,
    throwOnError: false,
    output: "html",
  });
  return (
    <div
      className={cn(
        "overflow-x-auto py-1 text-slate-100 [&_.katex]:text-[1.05rem]",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function MathInline({ children, className }: MathProps) {
  const html = katex.renderToString(children, {
    displayMode: false,
    throwOnError: false,
    output: "html",
  });
  return (
    <span
      className={cn("text-slate-100", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
