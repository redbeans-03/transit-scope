"use client";

import { useMemo, useState } from "react";

import { Plot, type PlotSeries } from "@/components/plot/plot";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fixed, integer } from "@/lib/format";
import { PLOT_COLORS } from "@/lib/palette";
import type { ExoplanetPayload } from "@/lib/types";

const VIEWS = [
  { id: "folded", label: "Phase-folded" },
  { id: "transits", label: "Consecutive transits" },
  { id: "baseline", label: "Full baseline" },
  { id: "bls", label: "Period search" },
] as const;

type ViewId = (typeof VIEWS)[number]["id"];

const flux4 = (value: number) => value.toFixed(4);
const hours = (value: number) => `${value.toFixed(1)} h`;
const days = (value: number) => `${value.toFixed(1)} d`;
const power = (value: number) => value.toFixed(3);

export function LightCurves({ payload }: { payload: ExoplanetPayload }) {
  const [view, setView] = useState<ViewId>("folded");
  const { series, ephemeris, depth, fit, snr, provenance } = payload;

  const foldedSeries = useMemo<PlotSeries[]>(
    () => [
      {
        kind: "points",
        x: series.folded.phase_hours,
        y: series.folded.flux,
        color: PLOT_COLORS.cadenceFaint,
        size: 1,
        alpha: 0.35,
        label: `${integer(series.folded.flux.length)} individual cadences`,
      },
      {
        kind: "errorbars",
        x: series.binned.phase_hours,
        y: series.binned.flux,
        err: series.binned.err,
        color: PLOT_COLORS.binned,
        label: "Binned average ± standard error",
      },
      {
        kind: "line",
        x: series.model.phase_hours,
        y: series.model.flux,
        color: PLOT_COLORS.model,
        width: 2,
        label: "Limb-darkened model fit",
      },
      { kind: "vline", at: 0, color: PLOT_COLORS.guide, dash: [3, 5] },
    ],
    [series],
  );

  const transitSeries = useMemo<PlotSeries[]>(() => {
    const t0 = series.segment.time[0] ?? 0;
    return [
      {
        kind: "points",
        x: series.segment.time.map((t) => t - t0),
        y: series.segment.flux,
        color: PLOT_COLORS.cadence,
        size: 1.7,
        alpha: 0.9,
        label: "Detrended long-cadence flux",
      },
      {
        kind: "hline",
        at: 1,
        color: PLOT_COLORS.guide,
        dash: [3, 5],
        label: "Out-of-transit baseline",
      },
    ];
  }, [series]);

  const baselineSeries = useMemo<PlotSeries[]>(
    () => [
      {
        kind: "points",
        x: series.raw.time,
        y: series.raw.flux,
        color: PLOT_COLORS.cadence,
        size: 1.1,
        alpha: 0.75,
        label: `${integer(series.raw.binned_from)} cadences, binned to ${integer(
          series.raw.time.length,
        )} points`,
      },
      { kind: "hline", at: 1, color: PLOT_COLORS.guide, dash: [3, 5] },
    ],
    [series],
  );

  const blsSeries = useMemo<PlotSeries[]>(
    () => [
      {
        kind: "line",
        x: series.periodogram.period_days,
        y: series.periodogram.power,
        color: PLOT_COLORS.power,
        width: 1.1,
        label: "Box Least Squares power",
      },
      {
        kind: "vline",
        at: ephemeris.period_days,
        color: PLOT_COLORS.accent,
        dash: [5, 4],
        label: `Recovered period ${fixed(ephemeris.period_days, 5)} d`,
      },
    ],
    [series, ephemeris.period_days],
  );

  const captions: Record<ViewId, string> = {
    folded: `Every cadence folded on the recovered ${fixed(
      ephemeris.period_days,
      6,
    )} day period. The transit core averages ${fixed(
      depth.depth_ppm,
      0,
    )} ppm below the baseline and the fitted model bottoms out at ${fixed(
      depth.max_depth_ppm,
      0,
    )} ppm; residual scatter about the fit is ${fixed(
      fit.rms_residual_ppm,
      0,
    )} ppm per bin. Ingress and egress look gradual because a 30 minute exposure smears the ${fixed(
      ephemeris.duration_hours,
      1,
    )} hour transit, an effect the model accounts for.`,
    transits: `Four consecutive orbits at full cadence. A single transit is a ~1% dip spread over only ${integer(
      snr.n_points_per_transit,
    )} exposures, which is why ${integer(
      ephemeris.n_transits_observed,
    )} of them have to be stacked.`,
    baseline: `The stitched, detrended light curve across ${fixed(
      provenance.baseline_days,
      0,
    )} days. It is binned for display, so the transits average away — flatness here is the goal: it means stellar variability and spacecraft systematics were removed without eating the signal.`,
    bls: `Box Least Squares power against trial period. The tallest peak is the planet; the smaller peaks at rational multiples are harmonics of the same signal, not other planets.`,
  };

  const plots: Record<ViewId, React.ReactNode> = {
    folded: (
      <Plot
        series={foldedSeries}
        xLabel="Hours from mid-transit"
        yLabel="Relative flux"
        formatX={hours}
        formatY={flux4}
        height={380}
        description={`Phase-folded light curve of Kepler-8b showing a transit ${fixed(
          depth.depth_percent,
          3,
        )} percent deep with a limb-darkened model fit overlaid.`}
      />
    ),
    transits: (
      <Plot
        series={transitSeries}
        xLabel="Days from start of segment"
        yLabel="Relative flux"
        formatX={days}
        formatY={flux4}
        height={380}
        description="Four consecutive orbits of Kepler-8b at full 30 minute cadence, showing four separate transit dips."
      />
    ),
    baseline: (
      <Plot
        series={baselineSeries}
        xLabel="Time (BKJD, days)"
        yLabel="Relative flux"
        formatX={(v) => v.toFixed(0)}
        formatY={flux4}
        height={380}
        description="The full detrended Kepler light curve of Kepler-8, flat to within a few hundred parts per million."
      />
    ),
    bls: (
      <Plot
        series={blsSeries}
        xLabel="Trial period (days)"
        yLabel="BLS power"
        formatX={days}
        formatY={power}
        height={380}
        description={`Box Least Squares periodogram peaking at ${fixed(
          ephemeris.period_days,
          4,
        )} days.`}
      />
    ),
  };

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <Tabs
        value={view}
        onValueChange={(value) => setView(value as ViewId)}
        className="gap-0"
      >
        <div className="flex flex-col gap-3 border-b border-border/70 p-4 sm:flex-row sm:items-center sm:justify-between">
          <TabsList className="w-full sm:w-auto">
            {VIEWS.map((item) => (
              <TabsTrigger key={item.id} value={item.id} className="text-xs sm:text-sm">
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <p className="font-mono text-[0.7rem] text-muted-foreground">
            hover the plot for values
          </p>
        </div>
        {VIEWS.map((item) => (
          <TabsContent key={item.id} value={item.id} className="m-0 p-4 sm:p-5">
            {plots[item.id]}
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              {captions[item.id]}
            </p>
          </TabsContent>
        ))}
      </Tabs>
    </Card>
  );
}
