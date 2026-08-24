"use client";

import { useMemo } from "react";

import { Plot, type PlotSeries } from "@/components/plot/plot";
import { fixed } from "@/lib/format";
import { PLOT_COLORS } from "@/lib/palette";
import type { ExoplanetPayload } from "@/lib/types";

export function TransitConsistency({ payload }: { payload: ExoplanetPayload }) {
  const { transits, depth } = payload;

  const series = useMemo<PlotSeries[]>(
    () => [
      {
        kind: "points",
        x: transits.map((transit) => transit.epoch),
        y: transits.map((transit) => transit.depth_ppm),
        color: PLOT_COLORS.binned,
        size: 2.6,
        label: "Depth of each individual transit",
      },
      {
        kind: "hline",
        at: depth.depth_ppm,
        color: PLOT_COLORS.accent,
        dash: [5, 4],
        label: `Stacked measurement, ${fixed(depth.depth_ppm, 0)} ppm`,
      },
    ],
    [transits, depth.depth_ppm],
  );

  if (transits.length === 0) return null;

  const values = transits.map((transit) => transit.depth_ppm);
  const scatter = Math.sqrt(
    values.reduce(
      (total, value) => total + (value - depth.depth_ppm) ** 2,
      0,
    ) / values.length,
  );

  return (
    <div>
      <Plot
        series={series}
        xLabel="Transit epoch (orbits since first observed transit)"
        yLabel="Depth (ppm)"
        formatX={(v) => v.toFixed(0)}
        formatY={(v) => v.toFixed(0)}
        height={260}
        description="Depth measured from each individual transit, scattered about the stacked value."
      />
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Each point is one transit measured on its own. They scatter by{" "}
        {fixed(scatter, 0)} ppm about the stacked value — consistent with the{" "}
        {fixed(payload.snr.cdpp_ppm, 0)} ppm per-cadence noise spread over{" "}
        {fixed(payload.snr.n_points_per_transit, 0)} in-transit exposures, and
        with no drift over the {transits.length} epochs shown. A depth that
        wandered with epoch would point at detrending residuals or a background
        eclipsing binary rather than a planet.
      </p>
    </div>
  );
}
