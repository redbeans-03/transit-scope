import { MathBlock } from "@/components/math";
import { MetricCard } from "@/components/metric-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fixed, integer } from "@/lib/format";
import type { ExoplanetPayload } from "@/lib/types";

export function SnrPanel({ payload }: { payload: ExoplanetPayload }) {
  const { snr, depth, ephemeris } = payload;
  const detectable = snr.snr >= snr.detection_threshold;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Transit SNR"
          value={integer(snr.snr)}
          unit="σ"
          emphasis
          hint={
            detectable
              ? `${integer(
                  snr.snr / snr.detection_threshold,
                )}× above Kepler's ${snr.detection_threshold}σ detection threshold.`
              : `Below Kepler's ${snr.detection_threshold}σ threshold — not a detection.`
          }
        />
        <MetricCard
          label="Single transit SNR"
          value={fixed(snr.snr_single_transit, 1)}
          unit="σ"
          hint="One transit alone is already a solid detection for a hot Jupiter this large."
        />
        <MetricCard
          label="Noise floor σ_CDPP"
          value={fixed(snr.cdpp_ppm, 0)}
          unit="ppm"
          hint="Per-cadence photometric precision, from the point-to-point scatter of the out-of-transit flux."
        />
        <MetricCard
          label="Signal / noise per point"
          value={fixed(depth.depth_ppm / snr.cdpp_ppm, 1)}
          unit="×"
          hint="A single 30 minute exposure sees the transit at this significance; stacking does the rest."
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Substituting the numbers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-relaxed text-muted-foreground">
          <MathBlock>
            {String.raw`\mathrm{SNR}_{\text{transit}} =
              \frac{\Delta F / F}{\sigma_{\mathrm{CDPP}}}
              \sqrt{N_{\text{transits}} \cdot N_{\text{pts}}}`}
          </MathBlock>
          <MathBlock>
            {String.raw`= \frac{` +
              (depth.depth_ppm / 1e6).toExponential(3) +
              String.raw`}{` +
              (snr.cdpp_ppm / 1e6).toExponential(3) +
              String.raw`} \sqrt{` +
              snr.n_transits +
              String.raw` \times ` +
              snr.n_points_per_transit +
              String.raw`} = ` +
              Math.round(snr.snr)}
          </MathBlock>
          <p>
            The depth is only {fixed(depth.depth_ppm / snr.cdpp_ppm, 1)} times
            the noise in a single exposure, and each transit contributes just{" "}
            {integer(snr.n_points_per_transit)} in-transit cadences out of the{" "}
            {integer(payload.provenance.n_cadences)} in the light curve. The
            detection comes from the{" "}
            <span className="font-mono text-foreground">
              √({snr.n_transits} × {integer(snr.n_points_per_transit)})
            </span>{" "}
            factor: folding {integer(ephemeris.n_transits_observed)} transits on
            the correct period turns a marginal per-point signal into a{" "}
            {integer(snr.snr)}σ measurement. Getting the period wrong smears
            those cadences out of phase and the signal collapses, which is why
            the period search comes first.
          </p>
          <p className="text-xs">
            σ_CDPP is measured here as the median-absolute-deviation scatter of
            successive flux differences outside transit, divided by √2. That
            first-difference form is insensitive to any residual variability
            slower than one cadence, so it reports the white noise the √N scaling
            actually applies to.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
