"use client";

import { useMemo } from "react";

import { MathBlock, MathInline } from "@/components/math";
import { Plot, type PlotSeries } from "@/components/plot/plot";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fixed } from "@/lib/format";
import { PLOT_COLORS } from "@/lib/palette";
import type { ExoplanetPayload } from "@/lib/types";

export function LimbDarkeningPanel({ payload }: { payload: ExoplanetPayload }) {
  const { limb_darkening: ld, fit, star } = payload;

  const series = useMemo<PlotSeries[]>(() => {
    // Intensity against projected radius r = sqrt(1 - mu^2) is the more
    // intuitive axis: 0 is disk centre, 1 is the limb.
    const radius = ld.profile.mu.map((mu) => Math.sqrt(Math.max(1 - mu * mu, 0)));
    return [
      {
        kind: "line",
        x: radius,
        y: ld.profile.intensity,
        color: PLOT_COLORS.model,
        width: 2.5,
        label: `Quadratic law, u₁ = ${ld.u1}, u₂ = ${ld.u2}`,
      },
      {
        kind: "hline",
        at: 1,
        color: PLOT_COLORS.guide,
        dash: [3, 5],
        label: "Uniform disk assumption",
      },
      {
        kind: "vline",
        at: fit.impact_parameter,
        color: PLOT_COLORS.accent,
        dash: [5, 4],
        label: `Kepler-8b's chord, b = ${fixed(fit.impact_parameter, 2)}`,
      },
    ];
  }, [ld, fit.impact_parameter]);

  const intensityAtChord =
    1 -
    ld.u1 * (1 - Math.sqrt(Math.max(1 - fit.impact_parameter ** 2, 0))) -
    ld.u2 * (1 - Math.sqrt(Math.max(1 - fit.impact_parameter ** 2, 0))) ** 2;

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle className="text-base">
            Surface brightness across the stellar disk
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Plot
            series={series}
            xLabel="Projected radius r / R*  (0 = centre, 1 = limb)"
            yLabel="I(μ) / I(1)"
            formatX={(v) => v.toFixed(2)}
            formatY={(v) => v.toFixed(2)}
            height={300}
            description={`Quadratic limb darkening profile for Kepler-8 falling from 1.0 at disk centre to ${fixed(
              1 - ld.u1 - ld.u2,
              2,
            )} at the limb.`}
          />
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Looking at the edge of a star, the line of sight leaves the
            photosphere at a shallower angle and so reaches cooler, dimmer gas.
            Kepler-8&apos;s limb is only{" "}
            {fixed((1 - ld.u1 - ld.u2) * 100, 0)}% as bright as its centre.
            Kepler-8b crosses at r = {fixed(fit.impact_parameter, 2)}, where the
            surface is {fixed(intensityAtChord * 100, 0)}% as bright as the
            centre — that is why its transit is not simply{" "}
            <MathInline>{String.raw`(R_p/R_*)^2`}</MathInline> deep.
          </p>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">The correction, term by term</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-relaxed text-muted-foreground">
          <MathBlock>
            {String.raw`\frac{I(\mu)}{I(1)} = 1 - u_1(1 - \mu) - u_2(1 - \mu)^2`}
          </MathBlock>
          <p>
            <MathInline>{String.raw`\mu = \cos\theta`}</MathInline> is the cosine
            of the angle between the line of sight and the local surface normal:
            1 at the centre of the disk, 0 at the limb. For Kepler-8 in the
            Kepler bandpass, <MathInline>{String.raw`u_1`}</MathInline> ={" "}
            {ld.u1} and <MathInline>{String.raw`u_2`}</MathInline> = {ld.u2}.
          </p>
          <MathBlock>
            {String.raw`1 - 0.2(u_1 + 2u_2) = ` +
              ld.correction_factor.toFixed(3)}
          </MathBlock>
          <p>
            Integrating the law over the disk gives a mean intensity of{" "}
            <MathInline>{String.raw`1 - u_1/3 - u_2/6 = `}</MathInline>
            {fixed(1 - ld.u1 / 3 - ld.u2 / 6, 3)} times the central value, so a
            planet in front of the middle of the disk blocks{" "}
            <em>more</em> than its share of the light and one near the limb
            blocks less.
          </p>
          <p className="text-xs">
            Coefficients are the tabulated values for a{" "}
            {fixed(star.teff_k, 0)} K star with log g ={" "}
            {fixed(star.logg_cgs, 2)}. They are held fixed during the fit: at 30
            minute cadence they are nearly degenerate with the planet radius, so
            fitting them from one light curve would inflate the uncertainty
            rather than reduce it.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
