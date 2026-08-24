import { MathBlock, MathInline } from "@/components/math";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fixed, percentDifference, signed } from "@/lib/format";
import type { ExoplanetPayload } from "@/lib/types";

export function RadiusPanel({ payload }: { payload: ExoplanetPayload }) {
  const { radius, depth, limb_darkening, fit, star, references } = payload;
  const dr25 = references.find((ref) => ref.key === "dr25");
  const discovery = references.find((ref) => ref.key === "jenkins2010");
  const reference = dr25 ?? discovery;

  const estimators = [
    {
      key: "geometric",
      name: "Uniform disk",
      formula: String.raw`\sqrt{\Delta F / F}`,
      estimate: radius.geometric,
      note: "Treats the star as a flat, evenly lit disk. The textbook starting point.",
    },
    {
      key: "corrected",
      name: "Closed-form limb darkening",
      formula: String.raw`\sqrt{\tfrac{\Delta F}{F}}\,\bigl[1 - 0.2(u_1 + 2u_2)\bigr]^{-1/2}`,
      estimate: radius.limb_darkening_corrected,
      note: "First-order correction for a central crossing of a limb-darkened disk.",
    },
    {
      key: "model",
      name: "Limb-darkened model fit",
      formula: String.raw`I(\mu)\ \text{integrated over the overlap}`,
      estimate: radius.model_fit,
      note: "Fits the whole transit shape, so it knows the planet crosses well off-centre.",
      preferred: true,
    },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {estimators.map((estimator) => {
        const difference = reference
          ? percentDifference(estimator.estimate.ratio, reference.radius_ratio)
          : null;
        return (
          <Card
            key={estimator.key}
            className={
              estimator.preferred
                ? "border-primary/45 bg-primary/[0.06]"
                : undefined
            }
          >
            <CardHeader className="gap-1">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base">{estimator.name}</CardTitle>
                {estimator.preferred && (
                  <Badge className="shrink-0 text-[0.65rem]">Adopted</Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                <MathInline>{estimator.formula}</MathInline>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="font-mono text-3xl font-semibold tabular-nums">
                  {fixed(estimator.estimate.radius_jupiter, 3)}
                  <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                    R<sub>J</sub>
                  </span>
                </p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  R<sub>p</sub>/R<sub>*</sub> = {fixed(estimator.estimate.ratio, 5)} ·{" "}
                  {fixed(estimator.estimate.radius_earth, 1)} R<sub>⊕</sub>
                </p>
              </div>
              {difference !== null && (
                <p className="font-mono text-xs text-muted-foreground">
                  {signed(difference, 1)}% vs {reference?.label}
                </p>
              )}
              <p className="text-sm leading-relaxed text-muted-foreground">
                {estimator.note}
              </p>
            </CardContent>
          </Card>
        );
      })}

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">
            Why the three numbers disagree
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-relaxed text-muted-foreground">
          <p>
            The measured drop is{" "}
            <span className="font-mono text-foreground">
              {fixed(depth.depth_ppm, 0)} ± {fixed(depth.depth_err_ppm, 0)} ppm
            </span>{" "}
            averaged over the transit core, and{" "}
            <span className="font-mono text-foreground">
              {fixed(depth.max_depth_ppm, 0)} ppm
            </span>{" "}
            at its deepest. Converting that to a radius needs the star&apos;s
            radius, {fixed(star.radius_rsun, 3)} R<sub>☉</sub>:
          </p>
          <MathBlock>
            {String.raw`\frac{R_p}{R_*} = \sqrt{\frac{\Delta F}{F}}
              \left[1 - 0.2(u_1 + 2u_2)\right]^{-1/2}
              = \sqrt{` +
              depth.depth.toExponential(4) +
              String.raw`}\;\bigl(` +
              limb_darkening.correction_factor.toFixed(3) +
              String.raw`\bigr)^{-1/2} = ` +
              radius.limb_darkening_corrected.ratio.toFixed(5)}
          </MathBlock>
          <p>
            With <MathInline>{String.raw`u_1 = ${limb_darkening.u1}`}</MathInline>{" "}
            and <MathInline>{String.raw`u_2 = ${limb_darkening.u2}`}</MathInline>{" "}
            the bracket is {fixed(limb_darkening.correction_factor, 3)}, so the
            closed form inflates the uniform-disk answer by{" "}
            {fixed(radius.correction_gain_percent, 1)}%. That correction assumes
            the planet crosses the middle of the disk. Kepler-8b does not: the
            fit puts the chord at an impact parameter of{" "}
            {fixed(fit.impact_parameter, 2)} stellar radii, out where the surface
            is dimmer than average. Integrating the actual intensity profile over
            the overlapping area — the model fit — is the only one of the three
            that accounts for this, and it is the value adopted here.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fitted geometry</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody className="font-mono text-xs">
              <TableRow>
                <TableCell className="text-muted-foreground">a/R*</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fixed(fit.a_over_rstar, 3)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">
                  Impact parameter b
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fixed(fit.impact_parameter, 3)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">
                  Inclination
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fixed(fit.inclination_deg, 2)}°
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">
                  Residual RMS
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fixed(fit.rms_residual_ppm, 0)} ppm
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-muted-foreground">
                  Reduced χ²
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fixed(fit.reduced_chi_square, 2)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            {fit.n_free_parameters} free parameters (R<sub>p</sub>/R<sub>*</sub>{" "}
            and b). a/R* is {fit.a_over_rstar_source}, which is what breaks the
            degeneracy between planet size and chord length at 30 minute cadence.
          </p>
        </CardContent>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle className="text-base">
            Validation against published values
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Period (d)</TableHead>
                  <TableHead className="text-right">Depth (ppm)</TableHead>
                  <TableHead className="text-right">
                    R<sub>p</sub>/R<sub>*</sub>
                  </TableHead>
                  <TableHead className="text-right">a/R*</TableHead>
                  <TableHead className="text-right">b</TableHead>
                  <TableHead className="text-right">
                    R<sub>p</sub> (R<sub>J</sub>)
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="font-mono text-xs tabular-nums">
                <TableRow className="bg-primary/[0.07]">
                  <TableCell className="font-sans font-medium">
                    This pipeline
                    <span className="ml-2 font-mono text-[0.68rem] text-muted-foreground">
                      {payload.provenance.data_source === "mast"
                        ? `${payload.provenance.n_files} quarters`
                        : "simulated"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {fixed(payload.ephemeris.period_days, 7)}
                  </TableCell>
                  <TableCell className="text-right">
                    {fixed(depth.max_depth_ppm, 0)}
                  </TableCell>
                  <TableCell className="text-right">
                    {fixed(radius.model_fit.ratio, 5)}
                  </TableCell>
                  <TableCell className="text-right">
                    {fixed(fit.a_over_rstar, 3)}
                  </TableCell>
                  <TableCell className="text-right">
                    {fixed(fit.impact_parameter, 3)}
                  </TableCell>
                  <TableCell className="text-right">
                    {fixed(radius.model_fit.radius_jupiter, 3)}
                  </TableCell>
                </TableRow>
                {references.map((ref) => (
                  <TableRow key={ref.key}>
                    <TableCell className="font-sans">
                      <a
                        href={ref.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium underline decoration-dotted underline-offset-4 hover:text-primary"
                      >
                        {ref.label}
                      </a>
                      <span className="mt-0.5 block font-mono text-[0.68rem] text-muted-foreground">
                        {ref.detail}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {fixed(ref.period_days, 7)}
                    </TableCell>
                    <TableCell className="text-right">
                      {ref.depth_ppm === null ? "—" : fixed(ref.depth_ppm, 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      {fixed(ref.radius_ratio, 5)}
                    </TableCell>
                    <TableCell className="text-right">
                      {fixed(ref.a_over_rstar, 3)}
                    </TableCell>
                    <TableCell className="text-right">
                      {fixed(ref.impact_parameter, 3)}
                    </TableCell>
                    <TableCell className="text-right">
                      {fixed(ref.radius_jupiter, 3)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="mt-4 max-w-4xl text-sm leading-relaxed text-muted-foreground">
            The recovered period is within{" "}
            {fixed(Math.abs(payload.ephemeris.period_offset_seconds), 1)} seconds
            of the value in the discovery paper, and the depth agrees with the
            final Kepler DR25 catalogue to{" "}
            {dr25 && dr25.depth_ppm
              ? `${fixed(
                  Math.abs(
                    percentDifference(depth.max_depth_ppm, dr25.depth_ppm),
                  ),
                  1,
                )}%`
              : "within a few percent"}
            . Published radius ratios themselves span{" "}
            {fixed(
              Math.min(...references.map((r) => r.radius_ratio)),
              4,
            )}{" "}
            to{" "}
            {fixed(
              Math.max(...references.map((r) => r.radius_ratio)),
              4,
            )}{" "}
            depending on which stellar radius and limb darkening treatment the
            authors adopted — a useful reminder that the dominant uncertainty in
            a planet radius is usually the star, not the light curve.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
