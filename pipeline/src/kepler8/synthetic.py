"""Synthetic Kepler-style photometry, used when the archive is unreachable.

The generator is deliberately built from the same limb-darkened transit model
the pipeline fits, plus the noise sources a real light curve carries: white
photon noise at Kepler-8's measured precision, slow stellar variability, and
quarterly data gaps. It lets the whole pipeline and dashboard run offline, and
it doubles as an end-to-end test with a known ground truth.
"""

from __future__ import annotations

import numpy as np

from .constants import KEPLER_8, KEPLER_8B, LITERATURE_PLANET
from .limb_darkening import transit_light_curve
from .mast import LightCurveBundle
from .fit import LONG_CADENCE_DAYS, model_flux

# Kepler-8 is a Kp = 13.6 star; its long-cadence point-to-point precision is
# a few hundred ppm.
DEFAULT_NOISE_PPM = 260.0


def generate_light_curve(
    *,
    n_quarters: int = 8,
    cadence_minutes: float = 29.4,
    noise_ppm: float = DEFAULT_NOISE_PPM,
    seed: int = 20090307,
) -> LightCurveBundle:
    """Simulate ``n_quarters`` of long-cadence photometry of Kepler-8."""
    rng = np.random.default_rng(seed)
    cadence_days = cadence_minutes / (24.0 * 60.0)
    quarter_days = 90.0
    downlink_gap_days = 1.5

    segments = []
    start = KEPLER_8B.t0_bkjd - 0.6
    for _ in range(n_quarters):
        n = int(quarter_days / cadence_days)
        segments.append(start + np.arange(n) * cadence_days)
        start += quarter_days + downlink_gap_days
    time = np.concatenate(segments)

    truth_k = LITERATURE_PLANET["radius_ratio"]
    transit = model_flux(
        (time - KEPLER_8B.t0_bkjd + 0.5 * KEPLER_8B.period_days)
        % KEPLER_8B.period_days
        - 0.5 * KEPLER_8B.period_days,
        period=KEPLER_8B.period_days,
        k=truth_k,
        a_over_rstar=LITERATURE_PLANET["semimajor_axis_over_rstar"],
        impact_parameter=LITERATURE_PLANET["impact_parameter"],
        u1=KEPLER_8.u1,
        u2=KEPLER_8.u2,
        exposure_days=LONG_CADENCE_DAYS,
    )

    # Slow trends: rotational modulation plus a per-quarter linear drift, both
    # of which the detrending stage is expected to remove.
    rotation = 1.0 + 4.0e-4 * np.sin(2.0 * np.pi * (time - time[0]) / 7.6 + 0.7)
    drift = 1.0 + 2.5e-4 * np.sin(2.0 * np.pi * (time - time[0]) / 90.0)

    noise = rng.normal(0.0, noise_ppm * 1e-6, size=time.size)
    flux = transit * rotation * drift + noise
    flux_err = np.full_like(flux, noise_ppm * 1e-6)

    provenance = {
        "data_source": "synthetic",
        "mission": "Kepler (simulated)",
        "cadence": "long",
        "target": KEPLER_8.name,
        "object": KEPLER_8.kic,
        "n_files": n_quarters,
        "n_cadences": int(time.size),
        "baseline_days": float(time[-1] - time[0]),
        "time_format": "BKJD (BJD - 2454833)",
        "note": (
            "Archive unavailable; light curve simulated from the published "
            "Kepler-8b geometry with 260 ppm white noise."
        ),
        "injected_truth": {
            "radius_ratio": truth_k,
            "period_days": KEPLER_8B.period_days,
            "t0_bkjd": KEPLER_8B.t0_bkjd,
            "noise_ppm": noise_ppm,
        },
    }

    return LightCurveBundle(
        time=time,
        flux=flux,
        flux_err=flux_err,
        cadence_minutes=cadence_minutes,
        provenance=provenance,
    )


def unsmeared_profile(phase_days: np.ndarray) -> np.ndarray:
    """Instantaneous (un-smeared) transit profile of the injected system."""
    return transit_light_curve(
        phase_days,
        period=KEPLER_8B.period_days,
        t0=0.0,
        k=LITERATURE_PLANET["radius_ratio"],
        a_over_rstar=LITERATURE_PLANET["semimajor_axis_over_rstar"],
        impact_parameter=LITERATURE_PLANET["impact_parameter"],
        u1=KEPLER_8.u1,
        u2=KEPLER_8.u2,
    )
