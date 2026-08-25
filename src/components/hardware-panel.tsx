"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Plot, type PlotSeries } from "@/components/plot/plot";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { asset, fixed } from "@/lib/format";
import { PLOT_COLORS } from "@/lib/palette";
import {
  analyseStream,
  parseSerialLine,
  type Sample,
  type StreamAnalysis,
} from "@/lib/photometer";
import { getSerial, type SerialPortLike } from "@/lib/serial";

const BAUD_RATE = 9600;
const SAMPLE_HZ = 10;
const WINDOW_SECONDS = 45;
const MAX_SAMPLES = SAMPLE_HZ * WINDOW_SECONDS;

/** Bead on an orbital arm: one dip per revolution, plus sensor noise. */
function simulateSample(elapsedMs: number, u1: number, u2: number): number {
  const baselineLux = 118;
  const revolutionMs = 6200;
  const beadRatio = 0.16;
  const transitFractionOfOrbit = 0.11;

  const phase =
    ((elapsedMs % revolutionMs) / revolutionMs + 0.5) % 1 - 0.5;
  const halfWidth = transitFractionOfOrbit / 2;
  let blocked = 0;
  if (Math.abs(phase) < halfWidth) {
    // Normalised chord position, so the bead ingresses and egresses smoothly.
    const x = phase / halfWidth;
    const overlap = Math.min(1, (1 - x * x) / 0.35);
    const mu = Math.sqrt(Math.max(1 - 0.45 * 0.45, 0));
    const intensity = 1 - u1 * (1 - mu) - u2 * (1 - mu) ** 2;
    blocked = beadRatio ** 2 * overlap * intensity;
  }
  const noise = (Math.random() - 0.5) * 0.22;
  return baselineLux * (1 - blocked) + noise;
}

type Mode = "idle" | "simulated" | "serial";

export function HardwarePanel({ u1, u2 }: { u1: number; u2: number }) {
  const [mode, setMode] = useState<Mode>("idle");
  const [samples, setSamples] = useState<Sample[]>([]);
  const [error, setError] = useState<string | null>(null);

  const portRef = useRef<SerialPortLike | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const startRef = useRef<number>(0);
  const stopRef = useRef<(() => void) | null>(null);

  const push = useCallback((lux: number) => {
    const t = performance.now() - startRef.current;
    setSamples((previous) => {
      const next = [...previous, { t, lux }];
      return next.length > MAX_SAMPLES ? next.slice(-MAX_SAMPLES) : next;
    });
  }, []);

  const stop = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    setMode("idle");
  }, []);

  useEffect(() => () => stopRef.current?.(), []);

  const startSimulation = useCallback(() => {
    stopRef.current?.();
    setError(null);
    setSamples([]);
    startRef.current = performance.now();
    const timer = window.setInterval(() => {
      push(simulateSample(performance.now() - startRef.current, u1, u2));
    }, 1000 / SAMPLE_HZ);
    stopRef.current = () => window.clearInterval(timer);
    setMode("simulated");
  }, [push, u1, u2]);

  const startSerial = useCallback(async () => {
    const serial = getSerial();
    if (!serial) {
      setError(
        "This browser has no Web Serial API. Chrome or Edge on desktop can talk to the photometer directly; other browsers can still run the simulation.",
      );
      return;
    }
    stopRef.current?.();
    setError(null);
    setSamples([]);

    try {
      const port = await serial.requestPort();
      await port.open({ baudRate: BAUD_RATE });
      portRef.current = port;
      startRef.current = performance.now();
      setMode("serial");

      let cancelled = false;
      stopRef.current = () => {
        cancelled = true;
        readerRef.current?.cancel().catch(() => {});
        portRef.current?.close().catch(() => {});
        readerRef.current = null;
        portRef.current = null;
      };

      const decoder = new TextDecoder();
      const reader = port.readable?.getReader();
      if (!reader) throw new Error("serial port is not readable");
      readerRef.current = reader;

      let buffer = "";
      while (!cancelled) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const lux = parseSerialLine(line);
          if (lux !== null) push(lux);
        }
      }
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "unknown serial error";
      if (!/No port selected/i.test(message)) {
        setError(`Serial connection failed: ${message}`);
      }
      stopRef.current?.();
      stopRef.current = null;
      setMode("idle");
    }
  }, [push]);

  const analysis: StreamAnalysis | null = useMemo(
    () => analyseStream(samples, { u1, u2 }),
    [samples, u1, u2],
  );

  const series = useMemo<PlotSeries[]>(() => {
    if (samples.length === 0) return [];
    const t0 = samples[0].t;
    const plotted: PlotSeries[] = [
      {
        kind: "line",
        x: samples.map((sample) => (sample.t - t0) / 1000),
        y: samples.map((sample) => sample.lux),
        color: PLOT_COLORS.live,
        width: 1.4,
        label: `Live illuminance, ${SAMPLE_HZ} Hz`,
      },
    ];
    if (analysis) {
      plotted.push({
        kind: "hline",
        at: analysis.baselineLux,
        color: PLOT_COLORS.guide,
        dash: [4, 4],
        label: "Baseline (90th percentile)",
      });
    }
    return plotted;
  }, [samples, analysis]);

  const streaming = mode !== "idle";

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader className="gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <CardTitle className="text-base">Live photometer stream</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              A bead on an orbital arm crossing an LED, read by a BH1750 over
              USB.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {streaming ? (
              <>
                <Badge
                  variant={mode === "serial" ? "default" : "secondary"}
                  className="font-mono text-[0.65rem]"
                >
                  <span className="mr-1.5 inline-block size-1.5 animate-pulse rounded-full bg-current" />
                  {mode === "serial" ? "Device connected" : "Simulating"}
                </Badge>
                <Button size="sm" variant="outline" onClick={stop}>
                  Stop
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" onClick={startSerial}>
                  Connect device
                </Button>
                <Button size="sm" variant="outline" onClick={startSimulation}>
                  Run simulation
                </Button>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>Could not open the serial port</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {samples.length === 0 ? (
            <div className="flex h-[300px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/80 px-6 text-center">
              <p className="text-sm text-muted-foreground">
                No stream yet. Connect the photometer over USB, or run the
                simulation to see what a bead transit looks like at 10 Hz.
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                Direct USB needs Web Serial (Chrome or Edge on desktop). The
                simulation runs in any browser.
              </p>
            </div>
          ) : (
            <Plot
              series={series}
              xLabel="Seconds"
              yLabel="Illuminance (lux)"
              formatX={(v) => `${v.toFixed(0)} s`}
              formatY={(v) => v.toFixed(1)}
              height={300}
              description="Live illuminance from the tabletop photometer, dipping each time the bead crosses the LED."
            />
          )}

          <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              {
                label: "Depth",
                value: analysis ? `${fixed(analysis.depthPercent, 2)}%` : "—",
              },
              {
                label: "Rp/R* (LD corrected)",
                value: analysis && analysis.depth > 0
                  ? fixed(analysis.radiusRatio, 3)
                  : "—",
              },
              {
                label: "Period",
                value: analysis?.periodSeconds
                  ? `${fixed(analysis.periodSeconds, 2)} s`
                  : "—",
              },
              {
                label: "Transits seen",
                value: analysis ? String(analysis.dips.length) : "—",
              },
            ].map((item) => (
              <div key={item.label}>
                <dt className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground">
                  {item.label}
                </dt>
                <dd className="mt-1 font-mono text-lg tabular-nums">
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
          {analysis && (
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              Sensor noise {fixed(analysis.noisePercent, 3)}% of baseline, over a
              rolling {WINDOW_SECONDS} second window. The depth is fed through
              the same √(ΔF/F)[1 − 0.2(u₁ + 2u₂)]<sup>−1/2</sup> chain as the
              satellite data, using the same coefficients, so the two
              measurements are directly comparable.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Build sheet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <ul className="space-y-3">
            {[
              {
                part: "Light source",
                detail:
                  "Constant-current high-CRI white LED. Current regulation matters more than brightness: any ripple in the supply looks exactly like a transit.",
              },
              {
                part: "Transit arm",
                detail:
                  "Stepper or servo swinging an opaque 3D-printed bead across the beam. Bead diameter sets the depth; arm speed sets the period.",
              },
              {
                part: "Detector",
                detail:
                  "BH1750 ambient light sensor on I²C inside a black-curtained PVC tube, which is the only defence against room light leaking in.",
              },
              {
                part: "Controller",
                detail:
                  "Arduino or ESP32 sampling at 10 Hz and printing one JSON object per reading over USB serial at 9600 baud.",
              },
            ].map((item) => (
              <li key={item.part} className="border-l-2 border-border pl-3">
                <p className="font-medium text-foreground">{item.part}</p>
                <p className="mt-0.5 text-xs leading-relaxed">{item.detail}</p>
              </li>
            ))}
          </ul>
          <div className="rounded-md border border-border/80 bg-muted/40 p-3">
            <p className="font-mono text-[0.7rem] uppercase tracking-[0.12em] text-muted-foreground">
              Wire format
            </p>
            <pre className="mt-2 overflow-x-auto font-mono text-xs text-foreground">
              {`{"t":1043,"lux":118.25}\n{"t":1143,"lux":118.31}\n{"t":1243,"lux":99.14}`}
            </pre>
          </div>
          <Button asChild variant="outline" size="sm" className="w-full">
            <a href={asset("/firmware/photometer.ino")} download>
              Download firmware sketch
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
