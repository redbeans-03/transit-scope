import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string;
  unit?: string;
  hint?: ReactNode;
  emphasis?: boolean;
  className?: string;
}

export function MetricCard({
  label,
  value,
  unit,
  hint,
  emphasis = false,
  className,
}: MetricCardProps) {
  return (
    <Card
      className={cn(
        "gap-0 p-5",
        emphasis && "border-primary/40 bg-primary/[0.06]",
        className,
      )}
    >
      <p className="font-mono text-[0.7rem] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 flex items-baseline gap-1.5">
        <span
          className={cn(
            "font-mono text-2xl font-semibold tabular-nums",
            emphasis && "text-primary",
          )}
        >
          {value}
        </span>
        {unit && (
          <span className="text-sm text-muted-foreground">{unit}</span>
        )}
      </p>
      {hint && (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
      )}
    </Card>
  );
}
