import { TransitConsistency } from "@/components/transit-consistency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fixed, formatTimestamp, integer } from "@/lib/format";
import type { ExoplanetPayload } from "@/lib/types";

export function MethodsPanel({ payload }: { payload: ExoplanetPayload }) {
  const { provenance, ephemeris, depth, snr, fit, star } = payload;
  const real = provenance.data_source === "mast";

  const steps = [
    {
      title: "Query the archive",
      detail: real
        ? `lightkurve ${provenance.lightkurve_version} searched MAST for ${provenance.object} and downloaded ${provenance.n_files} quarters of ${provenance.cadence}-cadence Kepler photometry, using the '${provenance.quality_bitmask}' quality bitmask to drop flagged cadences.`
        : `The archive was unreachable, so the light curve was simulated from the published Kepler-8b geometry with ${fixed(
            provenance.injected_truth?.noise_ppm ?? 0,
            0,
          )} ppm of white noise. Every downstream step is identical.`,
    },
    {
      title: "Stitch and clean",
      detail: `Each quarter is normalised by its own median before stitching — apertures and pointing differ between quarters, so raw electron rates are not comparable. Upward outliers are clipped at 4σ; downward excursions are left alone so transits survive. ${integer(
        provenance.n_cadences,
      )} cadences remain over ${fixed(provenance.baseline_days, 0)} days.`,
    },
    {
      title: "Find the period",
      detail: `A Box Least Squares search over 1–10 days locates the signal, then a dense grid around the peak refines it using the full baseline: ${fixed(
        ephemeris.period_days,
        7,
      )} days, ${fixed(
        Math.abs(ephemeris.period_offset_seconds),
        1,
      )} seconds from the published value. The grid density has to scale with the square of the baseline, which is why the blind search runs on a shorter stretch first.`,
    },
    {
      title: "Detrend without eating the signal",
      detail: real
        ? `A Savitzky-Golay high-pass filter over ${provenance.detrend_window_cadences} cadences removes stellar variability and spacecraft systematics. The ${integer(
            provenance.n_masked_in_transit ?? 0,
          )} in-transit cadences are masked out of the filter fit, so the trend cannot absorb part of the transit and bias the depth shallow.`
        : "The simulated curve is normalised by its median; the injected trends are removed by the same filter used on archival data.",
    },
    {
      title: "Fit the transit",
      detail: `The folded curve is binned and fitted with a quadratic limb-darkened model, integrating the intensity profile over the planet-star overlap and averaging over the ${fixed(
        (provenance.baseline_days * 24 * 60) / provenance.n_cadences,
        0,
      )} minute exposure. a/R* is ${fit.a_over_rstar_source}, leaving Rp/R* and the impact parameter free. Residual RMS: ${fixed(
        fit.rms_residual_ppm,
        0,
      )} ppm per bin.`,
    },
    {
      title: "Measure depth, radius and significance",
      detail: `The depth is the median of the inner ${fixed(
        depth.core_fraction * 100,
        0,
      )}% of the transit against a local baseline either side of it: ${fixed(
        depth.depth_ppm,
        0,
      )} ± ${fixed(
        depth.depth_err_ppm,
        0,
      )} ppm. Combined with R* = ${fixed(
        star.radius_rsun,
        3,
      )} R☉ that gives the planet radius, and with the ${fixed(
        snr.cdpp_ppm,
        0,
      )} ppm noise floor over ${integer(snr.n_transits)} transits it gives ${integer(
        snr.snr,
      )}σ.`,
    },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Extraction pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-5">
            {steps.map((step, index) => (
              <li key={step.title} className="flex gap-4">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10 font-mono text-xs text-primary">
                  {index + 1}
                </span>
                <div>
                  <p className="font-medium">{step.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {step.detail}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Run it yourself</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <pre className="overflow-x-auto rounded-md border border-border/80 bg-muted/40 p-3 font-mono text-xs leading-relaxed">
            {`cd pipeline
uv sync

# download from MAST and rebuild the payload
uv run kepler8-extract --quarters 12 -v

# no network? simulate instead
uv run kepler8-extract --offline -v

uv run pytest`}
          </pre>
          <dl className="space-y-2 font-mono text-xs">
            {[
              ["Data source", real ? "NASA MAST archive" : "Simulated"],
              ["Target", provenance.object],
              [
                "Quarters",
                provenance.quarters?.length
                  ? `Q${provenance.quarters[0]}–Q${
                      provenance.quarters[provenance.quarters.length - 1]
                    }`
                  : String(provenance.n_files),
              ],
              ["Cadences", integer(provenance.n_cadences)],
              ["Time system", provenance.time_format],
              ["Generated", formatTimestamp(payload.generated_at)],
              ["Pipeline", `v${payload.pipeline_version}`],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="text-right">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle className="text-base">
            Is the signal the same every orbit?
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TransitConsistency payload={payload} />
        </CardContent>
      </Card>
    </div>
  );
}
