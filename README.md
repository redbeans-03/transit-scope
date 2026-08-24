# Kepler-8b Transit Photometry

Measure the size of a planet 550 parsecs away from nothing but a 0.88% dip in
starlight.

This repository implements the dual-approach methodology in
`uploads/exoplanet_research_paper_3c34.pdf`: a Python pipeline that extracts
real NASA Kepler photometry and derives the planet's radius with a quadratic
limb darkening correction, a web dashboard that presents the analysis, and a
tabletop photometer that reproduces the same measurement on a desk and streams
it into the browser over USB.

## Results from the real archive

Running the pipeline against 12 quarters of Kepler long-cadence photometry of
KIC 6922244 (44,014 exposures spanning 978 days, 264 individual transits):

| Quantity | Measured | Published |
| --- | --- | --- |
| Orbital period | 3.5224967 d | 3.5224984 d (DR25) |
| Transit depth ΔF/F | 0.8795 ± 0.0018 % | 0.9146 % (DR25) |
| Transit duration T₁₄ | 3.28 h | 3.198 h (DR25) |
| Rp/R\* | 0.0937 | 0.0921 (DR25) – 0.0981 (discovery) |
| Planet radius | 1.355 R_Jup (15.2 R_⊕) | 1.30 – 1.42 R_Jup |
| a/R\* | 6.99 | 6.97 (discovery) |
| Impact parameter b | 0.69 | 0.72 (discovery) |
| Detection SNR | 2079σ | — |

The recovered period is within 0.2 seconds of the value in the discovery paper,
from a blind Box Least Squares search. Kepler-8b is a hot Jupiter: about 35%
wider than Jupiter, orbiting a slightly hot F-dwarf every 3.5 days.

## What is in here

```
pipeline/            Python extraction and analysis engine
  src/kepler8/
    mast.py          MAST queries, stitching, cleaning, detrending (lightkurve)
    search.py        Two-stage Box Least Squares period search
    limb_darkening.py  Quadratic law, depth correction, occultation integral
    geometry.py      a/R* from stellar density, transit duration
    fit.py           Least-squares fit of the limb-darkened transit model
    photometry.py    Depth measurement, binning, CDPP noise floor, SNR
    synthetic.py     Simulated light curve for offline / no-network runs
    pipeline.py      Orchestration; builds the dashboard payload
    cli.py           `kepler8-extract` command line entry point
  tests/             35 tests: physics, statistics, end-to-end recovery
src/                 Next.js dashboard (App Router, TypeScript, Tailwind, shadcn/ui)
  components/plot/   Canvas plotting engine for the light curves
  lib/photometer.ts  Analysis for the live hardware stream
firmware/photometer/ Arduino / ESP32 sketch: BH1750 → JSON over USB serial
public/data/         exoplanet_data.json, the payload the dashboard renders
```

## Running it

### Dashboard

```bash
npm install
npm run dev -- --port 43917
```

Then open <http://127.0.0.1:43917>. The dashboard reads
`public/data/exoplanet_data.json`, which is committed, so it works immediately.
If that file is missing it explains how to generate one instead of failing.

If you serve the dev server through a tunnel or container port forward and the
charts come up blank, add that hostname to `allowedDevOrigins` in
`next.config.ts`: Next blocks cross-origin requests for `/_next/*` dev assets,
which 403s the client bundle while still server-rendering the page.

### Extraction pipeline

Requires [uv](https://docs.astral.sh/uv/) (or any Python ≥ 3.10 environment).

```bash
cd pipeline
uv sync

# Download from MAST and rebuild the payload (a few minutes on a cold cache)
uv run kepler8-extract --quarters 12 -v

# No network? Simulate a Kepler-8 light curve from the published orbit instead
uv run kepler8-extract --offline -v

uv run pytest
```

`--quarters 0` stitches every available quarter. The output path defaults to
`public/data/exoplanet_data.json`; override it with `--out`.

The archive is treated as best-effort: if MAST cannot be reached, the pipeline
falls back to a simulated light curve built from the published Kepler-8b
geometry, flags that clearly in the payload, and the dashboard shows a banner
saying so. Every analysis step downstream is identical, which also makes the
simulation an end-to-end test with known ground truth — the fit recovers the
injected radius ratio to better than 0.5%.

### Hardware photometer

Flash `firmware/photometer/photometer.ino` (needs the *BH1750* library by
Christopher Laws), wire the sensor to I²C, then click **Connect device** in the
dashboard's hardware section. It requires the Web Serial API, so Chrome or Edge
on desktop. The **Run simulation** button works in any browser and needs no
hardware.

## The physics

**Transit depth.** A planet crossing its star hides a fraction of the disk, so
the flux drops by roughly the area ratio, ΔF/F ≈ (Rp/R\*)². Measuring that
fraction and knowing R\* gives the planet's size.

**Limb darkening.** A star's disk is not evenly lit: near the edge, the line of
sight leaves the photosphere at a shallower angle and reaches cooler gas, so the
limb looks dimmer. The quadratic law

$$\frac{I(\mu)}{I(1)} = 1 - u_1(1-\mu) - u_2(1-\mu)^2$$

describes this with two coefficients (u₁ = 0.39, u₂ = 0.26 for Kepler-8 in the
Kepler bandpass), where μ = cos θ is 1 at disk centre and 0 at the limb. The
proposal's closed-form correction,

$$\frac{R_p}{R_*} = \sqrt{\frac{\Delta F}{F}}\left[1 - 0.2(u_1 + 2u_2)\right]^{-1/2}$$

is implemented as written, and the dashboard reports it alongside two other
estimators: the naive uniform-disk √(ΔF/F), and a full limb-darkened model fit.
The three disagree by about 10%, which is far larger than the measurement
uncertainty, and the dashboard explains why: the closed form assumes the planet
crosses the middle of the disk, whereas Kepler-8b crosses at an impact parameter
of 0.69 stellar radii, out where the surface is dimmer than average. The model
fit integrates the actual intensity profile over the planet-star overlap, so it
is the value adopted for the headline radius.

**Detection significance.** The transit is only about 48× the per-cadence noise
in a single 30 minute exposure, spread over ~7 exposures per transit:

$$\text{SNR} = \frac{\Delta F/F}{\sigma_\text{CDPP}}\sqrt{N_\text{transits} \cdot N_\text{pts}}$$

σ_CDPP is measured from the light curve itself, as the median-absolute-deviation
scatter of successive out-of-transit flux differences divided by √2 — a form
that is insensitive to variability slower than one cadence, so the √N scaling
genuinely applies. Stacking 264 transits is what turns a marginal per-point
signal into a 2079σ detection.

Two details matter more than they look:

- **The detrending filter masks the transits.** A Savitzky-Golay high-pass
  filter removes stellar variability and spacecraft systematics, but if it is
  fitted through the in-transit cadences it absorbs part of the signal and
  biases the depth shallow. The in-transit points are excluded from the fit.
- **a/R\* is fixed by the stellar density.** At 30 minute cadence the light
  curve cannot separate planet size from chord length: fitting Rp/R\*, a/R\* and
  b together lands on an unphysical orbit (a/R\* = 8.3 for a star whose mass and
  radius demand 6.99). Kepler's third law pins a/R\*, and the fit then recovers
  an impact parameter and inclination consistent with the published values.

## Data and references

Photometry: NASA Kepler mission, retrieved from the
[Mikulski Archive for Space Telescopes](https://archive.stsci.edu/kepler/) with
[lightkurve](https://lightkurve.github.io/lightkurve/). Reference parameters
from the [NASA Exoplanet Archive](https://exoplanetarchive.ipac.caltech.edu/):
[Jenkins et al. 2010](https://ui.adsabs.harvard.edu/abs/2010ApJ...724.1108J/abstract)
(discovery) and the Kepler DR25 KOI table (KOI-10.01). Transit model after
[Mandel & Agol 2002](https://ui.adsabs.harvard.edu/abs/2002ApJ...580L.171M/abstract),
evaluated here by direct numerical integration of the occulted flux rather than
their analytic elliptic-integral form.
