import { MetricCard } from "@/components/metric-card";
import { fixed, formatDuration, integer, signed } from "@/lib/format";
import type { ExoplanetPayload } from "@/lib/types";

export function ResultsGrid({ payload }: { payload: ExoplanetPayload }) {
  const { depth, radius, ephemeris, snr, star, fit } = payload;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        label="Transit depth ΔF/F"
        value={fixed(depth.depth_percent, 4)}
        unit="%"
        emphasis
        hint={`${fixed(depth.depth_ppm, 0)} ± ${fixed(
          depth.depth_err_ppm,
          0,
        )} ppm, averaged over the transit core (${integer(
          depth.n_core_cadences,
        )} cadences).`}
      />
      <MetricCard
        label="Planet radius"
        value={fixed(radius.model_fit.radius_jupiter, 3)}
        unit="R_Jupiter"
        emphasis
        hint={`${fixed(radius.model_fit.radius_earth, 1)} Earth radii, or ${integer(
          radius.model_fit.radius_km,
        )} km. A puffy hot Jupiter.`}
      />
      <MetricCard
        label="Radius ratio Rp/R*"
        value={fixed(radius.model_fit.ratio, 5)}
        hint={`From the limb-darkened model fit; R* = ${fixed(
          star.radius_rsun,
          3,
        )} solar radii sets the absolute scale.`}
      />
      <MetricCard
        label="Orbital period"
        value={fixed(ephemeris.period_days, 6)}
        unit="days"
        hint={`${signed(
          ephemeris.period_offset_seconds,
          1,
        )} s from the discovery paper, recovered from ${integer(
          ephemeris.n_transits_observed,
        )} transits.`}
      />
      <MetricCard
        label="Transit duration"
        value={formatDuration(ephemeris.duration_hours)}
        hint={`First to fourth contact, from the fitted geometry (b = ${fixed(
          fit.impact_parameter,
          2,
        )}).`}
      />
      <MetricCard
        label="Detection SNR"
        value={integer(snr.snr)}
        unit="σ"
        hint={`Kepler's pipeline threshold was ${snr.detection_threshold}σ; a single transit alone gives ${fixed(
          snr.snr_single_transit,
          0,
        )}σ.`}
      />
      <MetricCard
        label="Noise floor"
        value={fixed(snr.cdpp_ppm, 0)}
        unit="ppm"
        hint="Per-cadence scatter outside transit, after detrending."
      />
      <MetricCard
        label="Inclination"
        value={fixed(fit.inclination_deg, 2)}
        unit="degrees"
        hint={`Grazing enough that the planet crosses ${fixed(
          fit.impact_parameter * 100,
          0,
        )}% of the way out towards the limb.`}
      />
    </div>
  );
}
