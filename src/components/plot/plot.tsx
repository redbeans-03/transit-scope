"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type PlotSeries =
  | {
      kind: "points";
      x: number[];
      y: number[];
      color: string;
      size?: number;
      alpha?: number;
      label?: string;
    }
  | {
      kind: "line";
      x: number[];
      y: number[];
      color: string;
      width?: number;
      dash?: number[];
      label?: string;
    }
  | {
      kind: "errorbars";
      x: number[];
      y: number[];
      err: number[];
      color: string;
      size?: number;
      label?: string;
    }
  | { kind: "vline"; at: number; color: string; dash?: number[]; label?: string }
  | { kind: "hline"; at: number; color: string; dash?: number[]; label?: string };

export interface PlotProps {
  series: PlotSeries[];
  xLabel: string;
  yLabel: string;
  height?: number;
  xDomain?: [number, number];
  yDomain?: [number, number];
  formatX?: (value: number) => string;
  formatY?: (value: number) => string;
  /** Screen-reader description of what the plot shows. */
  description: string;
  className?: string;
}

const PADDING = { top: 14, right: 16, bottom: 42, left: 68 };
const AXIS_COLOR = "#475569";
const GRID_COLOR = "rgba(148, 163, 184, 0.14)";
const LABEL_COLOR = "#94a3b8";
const READOUT_BG = "rgba(2, 6, 23, 0.92)";

/** Tick positions on a "nice" 1/2/5 x 10^n grid covering [min, max]. */
function niceTicks(min: number, max: number, count = 6): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return [min];
  const span = max - min;
  const rawStep = span / Math.max(count - 1, 1);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const step =
    (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) *
    magnitude;
  const first = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let value = first; value <= max + step * 1e-6; value += step) {
    ticks.push(Math.abs(value) < step * 1e-9 ? 0 : value);
  }
  return ticks;
}

function seriesExtent(series: PlotSeries[], axis: "x" | "y"): [number, number] {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const item of series) {
    if (item.kind === "vline") {
      if (axis === "x") {
        min = Math.min(min, item.at);
        max = Math.max(max, item.at);
      }
      continue;
    }
    if (item.kind === "hline") {
      if (axis === "y") {
        min = Math.min(min, item.at);
        max = Math.max(max, item.at);
      }
      continue;
    }
    const values = axis === "x" ? item.x : item.y;
    const errors = item.kind === "errorbars" && axis === "y" ? item.err : null;
    for (let i = 0; i < values.length; i += 1) {
      const value = values[i];
      if (!Number.isFinite(value)) continue;
      const spread = errors ? (errors[i] ?? 0) : 0;
      min = Math.min(min, value - spread);
      max = Math.max(max, value + spread);
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) return [min - 1, max + 1];
  return [min, max];
}

export function Plot({
  series,
  xLabel,
  yLabel,
  height = 300,
  xDomain,
  yDomain,
  formatX = (v) => String(v),
  formatY = (v) => String(v),
  description,
  className,
}: PlotProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(720);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const element = wrapperRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (next && next > 0) setWidth(next);
    });
    observer.observe(element);
    setWidth(element.clientWidth || 720);
    return () => observer.disconnect();
  }, []);

  const domains = useMemo(() => {
    const [rawXMin, rawXMax] = xDomain ?? seriesExtent(series, "x");
    const [rawYMin, rawYMax] = yDomain ?? seriesExtent(series, "y");
    const yPad = yDomain ? 0 : (rawYMax - rawYMin) * 0.08;
    return {
      x: [rawXMin, rawXMax] as [number, number],
      y: [rawYMin - yPad, rawYMax + yPad] as [number, number],
    };
  }, [series, xDomain, yDomain]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    const plotWidth = Math.max(width - PADDING.left - PADDING.right, 10);
    const plotHeight = Math.max(height - PADDING.top - PADDING.bottom, 10);
    const [xMin, xMax] = domains.x;
    const [yMin, yMax] = domains.y;
    const toPx = (value: number) =>
      PADDING.left + ((value - xMin) / (xMax - xMin || 1)) * plotWidth;
    const toPy = (value: number) =>
      PADDING.top + (1 - (value - yMin) / (yMax - yMin || 1)) * plotHeight;

    // Grid and tick labels.
    context.font =
      "11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    context.lineWidth = 1;
    const xTicks = niceTicks(xMin, xMax, Math.max(3, Math.round(width / 130)));
    const yTicks = niceTicks(yMin, yMax, 5);

    context.strokeStyle = GRID_COLOR;
    context.fillStyle = LABEL_COLOR;
    context.textAlign = "center";
    context.textBaseline = "top";
    for (const tick of xTicks) {
      const px = Math.round(toPx(tick)) + 0.5;
      context.beginPath();
      context.moveTo(px, PADDING.top);
      context.lineTo(px, PADDING.top + plotHeight);
      context.stroke();
      context.fillText(formatX(tick), px, PADDING.top + plotHeight + 8);
    }
    context.textAlign = "right";
    context.textBaseline = "middle";
    for (const tick of yTicks) {
      const py = Math.round(toPy(tick)) + 0.5;
      context.beginPath();
      context.moveTo(PADDING.left, py);
      context.lineTo(PADDING.left + plotWidth, py);
      context.stroke();
      context.fillText(formatY(tick), PADDING.left - 10, py);
    }

    // Series.
    context.save();
    context.beginPath();
    context.rect(PADDING.left, PADDING.top, plotWidth, plotHeight);
    context.clip();

    for (const item of series) {
      if (item.kind === "vline" || item.kind === "hline") {
        context.strokeStyle = item.color;
        context.lineWidth = 1;
        context.setLineDash(item.dash ?? [4, 4]);
        context.beginPath();
        if (item.kind === "vline") {
          const px = toPx(item.at);
          context.moveTo(px, PADDING.top);
          context.lineTo(px, PADDING.top + plotHeight);
        } else {
          const py = toPy(item.at);
          context.moveTo(PADDING.left, py);
          context.lineTo(PADDING.left + plotWidth, py);
        }
        context.stroke();
        context.setLineDash([]);
        continue;
      }

      if (item.kind === "points") {
        const radius = item.size ?? 1.4;
        context.fillStyle = item.color;
        context.globalAlpha = item.alpha ?? 1;
        for (let i = 0; i < item.x.length; i += 1) {
          const x = item.x[i];
          const y = item.y[i];
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
          context.beginPath();
          context.arc(toPx(x), toPy(y), radius, 0, Math.PI * 2);
          context.fill();
        }
        context.globalAlpha = 1;
        continue;
      }

      if (item.kind === "errorbars") {
        const radius = item.size ?? 2.1;
        context.strokeStyle = item.color;
        context.fillStyle = item.color;
        context.lineWidth = 1;
        for (let i = 0; i < item.x.length; i += 1) {
          const x = item.x[i];
          const y = item.y[i];
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
          const px = toPx(x);
          const spread = item.err[i] ?? 0;
          context.beginPath();
          context.moveTo(px, toPy(y - spread));
          context.lineTo(px, toPy(y + spread));
          context.stroke();
          context.beginPath();
          context.arc(px, toPy(y), radius, 0, Math.PI * 2);
          context.fill();
        }
        continue;
      }

      context.strokeStyle = item.color;
      context.lineWidth = item.width ?? 2;
      context.setLineDash(item.dash ?? []);
      context.beginPath();
      let started = false;
      for (let i = 0; i < item.x.length; i += 1) {
        const x = item.x[i];
        const y = item.y[i];
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          started = false;
          continue;
        }
        const px = toPx(x);
        const py = toPy(y);
        if (started) context.lineTo(px, py);
        else {
          context.moveTo(px, py);
          started = true;
        }
      }
      context.stroke();
      context.setLineDash([]);
    }
    context.restore();

    // Frame.
    context.strokeStyle = AXIS_COLOR;
    context.lineWidth = 1;
    context.strokeRect(
      PADDING.left + 0.5,
      PADDING.top + 0.5,
      plotWidth,
      plotHeight,
    );

    // Axis titles.
    context.fillStyle = LABEL_COLOR;
    context.font = "12px ui-sans-serif, system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "bottom";
    context.fillText(xLabel, PADDING.left + plotWidth / 2, height - 6);
    context.save();
    context.translate(14, PADDING.top + plotHeight / 2);
    context.rotate(-Math.PI / 2);
    context.textBaseline = "top";
    context.fillText(yLabel, 0, 0);
    context.restore();

    // Hover crosshair and readout.
    if (
      cursor &&
      cursor.x >= PADDING.left &&
      cursor.x <= PADDING.left + plotWidth &&
      cursor.y >= PADDING.top &&
      cursor.y <= PADDING.top + plotHeight
    ) {
      const dataX = xMin + ((cursor.x - PADDING.left) / plotWidth) * (xMax - xMin);
      const dataY =
        yMin + (1 - (cursor.y - PADDING.top) / plotHeight) * (yMax - yMin);
      context.strokeStyle = "rgba(148, 163, 184, 0.5)";
      context.setLineDash([3, 3]);
      context.beginPath();
      context.moveTo(cursor.x, PADDING.top);
      context.lineTo(cursor.x, PADDING.top + plotHeight);
      context.moveTo(PADDING.left, cursor.y);
      context.lineTo(PADDING.left + plotWidth, cursor.y);
      context.stroke();
      context.setLineDash([]);

      const text = `${formatX(dataX)}, ${formatY(dataY)}`;
      context.font =
        "11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      const boxWidth = context.measureText(text).width + 14;
      const boxX = Math.min(cursor.x + 10, PADDING.left + plotWidth - boxWidth);
      const boxY = Math.max(cursor.y - 30, PADDING.top + 4);
      context.fillStyle = READOUT_BG;
      context.strokeStyle = AXIS_COLOR;
      context.beginPath();
      context.roundRect(boxX, boxY, boxWidth, 22, 5);
      context.fill();
      context.stroke();
      context.fillStyle = "#e2e8f0";
      context.textAlign = "left";
      context.textBaseline = "middle";
      context.fillText(text, boxX + 7, boxY + 11);
    }
  }, [
    cursor,
    domains,
    formatX,
    formatY,
    height,
    series,
    width,
    xLabel,
    yLabel,
  ]);

  useEffect(() => {
    draw();
  }, [draw]);

  const legend = series.filter((item) => item.label);

  return (
    <div className={cn("w-full", className)}>
      {legend.length > 0 && (
        <ul className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {legend.map((item, index) => (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-0.5 w-4 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              {item.label}
            </li>
          ))}
        </ul>
      )}
      <div ref={wrapperRef} className="w-full">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={description}
          className="block w-full touch-none"
          onPointerMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setCursor({
              x: event.clientX - rect.left,
              y: event.clientY - rect.top,
            });
          }}
          onPointerLeave={() => setCursor(null)}
        />
      </div>
    </div>
  );
}
