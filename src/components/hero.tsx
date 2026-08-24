import { MathInline } from "@/components/math";
import { Badge } from "@/components/ui/badge";
import { fixed, formatTimestamp, integer } from "@/lib/format";
import type { ExoplanetPayload } from "@/lib/types";

export function Hero({ payload }: { payload: ExoplanetPayload }) {
  const { provenance, depth, radius, snr, ephemeris, star } = payload;
  const isReal = provenance.data_source === "mast";

  const facts = [
    {
      label: "Source",
      value: isReal
        ? `NASA MAST · ${provenance.mission} ${provenance.cadence} cadence`
        : "Simulated light curve (archive unreachable)",
    },
    {
      label: "Cadences",
      value: `${integer(provenance.n_cadences)} over ${fixed(
        provenance.baseline_days,
        0,
      )} days`,
    },
    {
      label: "Transits",
      value: `${integer(ephemeris.n_transits_observed)} observed`,
    },
    { label: "Extracted", value: formatTimestamp(payload.generated_at) },
  ];

  return (
    <div className="relative overflow-hidden border-b border-border/70">
      <div className="mx-auto max-w-6xl px-4 pb-10 pt-12 sm:px-6 sm:pb-14 sm:pt-16">
        <Badge variant="outline" className="font-mono text-[0.7rem]">
          Transit photometry · {star.name} · Kp {fixed(star.kepler_magnitude, 2)}
        </Badge>
        <h1 className="mt-5 max-w-3xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
          A hot Jupiter measured from a{" "}
          <span className="text-primary">0.88% dip</span> in starlight
        </h1>
        <p className="mt-5 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
          Kepler-8b crosses its host star every{" "}
          {fixed(ephemeris.period_days, 6)} days and hides{" "}
          <MathInline>{String.raw`\Delta F/F`}</MathInline> ={" "}
          {fixed(depth.depth_percent, 4)}% of its light for{" "}
          {fixed(ephemeris.duration_hours, 2)} hours. That single number, plus a
          quadratic limb darkening correction and the star&apos;s radius, is
          enough to size the planet at{" "}
          <strong className="font-semibold text-foreground">
            {fixed(radius.model_fit.radius_jupiter, 2)} Jupiter radii
          </strong>{" "}
          — {fixed(radius.model_fit.radius_earth, 1)} Earth radii — from
          brightness measurements alone.
        </p>

        <dl className="mt-9 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          {facts.map((fact) => (
            <div key={fact.label} className="border-t border-border/70 pt-3">
              <dt className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-muted-foreground">
                {fact.label}
              </dt>
              <dd className="mt-1 text-sm">{fact.value}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-8 font-mono text-xs text-muted-foreground">
          Detection significance {integer(snr.snr)}σ · noise floor{" "}
          {fixed(snr.cdpp_ppm, 0)} ppm per cadence
        </p>
      </div>
    </div>
  );
}
