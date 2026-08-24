import { ComparisonMatrix } from "@/components/comparison-matrix";
import { HardwarePanel } from "@/components/hardware-panel";
import { Hero } from "@/components/hero";
import { LightCurves } from "@/components/light-curves";
import { LimbDarkeningPanel } from "@/components/limb-darkening-panel";
import { MethodsPanel } from "@/components/methods-panel";
import { NoData } from "@/components/no-data";
import { RadiusPanel } from "@/components/radius-panel";
import { ResultsGrid } from "@/components/results-grid";
import { Section } from "@/components/section";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SnrPanel } from "@/components/snr-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { loadPayload } from "@/lib/data";
import { fixed } from "@/lib/format";

export default async function Home() {
  const result = await loadPayload();

  if (result.status !== "ok") {
    return (
      <>
        <SiteHeader />
        <main className="flex-1">
          <NoData
            reason={result.status === "error" ? result.message : undefined}
          />
        </main>
        <SiteFooter />
      </>
    );
  }

  const payload = result.payload;
  const simulated = payload.provenance.data_source === "synthetic";

  return (
    <>
      <SiteHeader dataSource={payload.provenance.data_source} />
      <main className="flex-1">
        <Hero payload={payload} />

        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          {simulated && (
            <Alert className="mt-8">
              <AlertTitle>Showing a simulated light curve</AlertTitle>
              <AlertDescription>
                The MAST archive could not be reached
                {payload.provenance.fallback_reason
                  ? `: ${payload.provenance.fallback_reason}`
                  : ""}
                , so these results come from a synthetic Kepler-8 light curve
                generated from the published orbit with{" "}
                {fixed(payload.provenance.injected_truth?.noise_ppm ?? 0, 0)} ppm
                of noise. Re-run the pipeline with network access to analyse the
                real photometry.
              </AlertDescription>
            </Alert>
          )}

          <Section
            id="results"
            eyebrow="Section 1 · Results"
            title="What the light curve says about the planet"
            intro="Everything below comes from one measurement repeated a few hundred times: how much fainter the star gets while the planet is in front of it."
          >
            <ResultsGrid payload={payload} />
          </Section>

          <Section
            id="lightcurve"
            eyebrow="Section 2 · Photometry"
            title="The light curve, four ways"
            intro="The same photometry viewed at four scales — a single orbit, a stack of every orbit, the full mission baseline, and the period search that ties them together."
          >
            <LightCurves payload={payload} />
          </Section>

          <Section
            id="radius"
            eyebrow="Section 3 · Planet radius"
            title="From a percentage dip to a planet radius"
            intro={
              <>
                The transit depth is roughly the area ratio of planet to star,{" "}
                {"\u0394"}F/F {"\u2248"} (R
                <sub>p</sub>/R<sub>*</sub>)². Turning &quot;roughly&quot; into a
                number means deciding what to do about limb darkening, and the
                three answers below differ by more than the measurement
                uncertainty.
              </>
            }
          >
            <RadiusPanel payload={payload} />
          </Section>

          <Section
            id="limb"
            eyebrow="Section 4 · Limb darkening"
            title="Stars are not evenly lit disks"
            intro="A star's edge is dimmer than its centre, so an identical planet produces a different depth depending on where it crosses. This is the correction that separates a rough radius from a defensible one."
          >
            <LimbDarkeningPanel payload={payload} />
          </Section>

          <Section
            id="snr"
            eyebrow="Section 5 · Error analysis"
            title="Is the dip real?"
            intro="A transit this shallow is invisible in any single exposure. Detection significance is what justifies the claim that the dip is a planet and not noise."
          >
            <SnrPanel payload={payload} />
          </Section>

          <Section
            id="hardware"
            eyebrow="Section 6 · Hardware model"
            title="The same measurement, on a desk"
            intro="A bead on a motorised arm crossing an LED, watched by a light sensor at 10 Hz. The point is not to rival Kepler but to run the same analysis on data you generated yourself — and to feel how much precision the space telescope is buying."
          >
            <div className="space-y-4">
              <HardwarePanel
                u1={payload.limb_darkening.u1}
                u2={payload.limb_darkening.u2}
              />
              <ComparisonMatrix payload={payload} />
            </div>
          </Section>

          <Section
            id="methods"
            eyebrow="Section 7 · Methods"
            title="How the numbers were produced"
            intro="Every value on this page is computed by the Python pipeline in this repository and written to a single JSON payload. Nothing is hard-coded except the published values used for comparison."
          >
            <MethodsPanel payload={payload} />
          </Section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
