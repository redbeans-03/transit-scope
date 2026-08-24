import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface SectionProps {
  id: string;
  eyebrow: string;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Section({
  id,
  eyebrow,
  title,
  intro,
  children,
  className,
}: SectionProps) {
  return (
    <section id={id} className={cn("scroll-mt-24 py-10 sm:py-14", className)}>
      <header className="mb-6 max-w-3xl">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
          {eyebrow}
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h2>
        {intro && (
          <div className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            {intro}
          </div>
        )}
      </header>
      {children}
    </section>
  );
}
