"""End-to-end extraction: archive -> ephemeris -> depth -> radius -> SNR -> JSON."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

import numpy as np
from numpy.typing import ArrayLike, NDArray

from . import __version__
from .constants import (
    KEPLER_8,
    KEPLER_8B,
    LITERATURE_PLANET,
    R_EARTH_M,
    R_JUPITER_M,
    REFERENCES,
    StellarParameters,
)
from .fit import LONG_CADENCE_DAYS, TransitFit, fit_transit, model_flux
from .geometry import scaled_semimajor_axis, transit_duration_days
from .limb_darkening import (
    corrected_radius_ratio,
    geometric_radius_ratio,
    limb_darkening_correction,
    quadratic_intensity,
)
from .mast import (
    LightCurveBundle,
    MastUnavailableError,
    detrend,
    download_light_curve,
)
from .photometry import (
    bin_folded,
    cdpp_from_residuals,
    count_transits,
    fold_phase,
    measure_depth,
    transit_snr,
)
from .search import bls_search, decimate_periodogram
from .synthetic import generate_light_curve

log = logging.getLogger("kepler8")

SCHEMA_VERSION = 2
HOURS_PER_DAY = 24.0


def radius_breakdown(ratio: float, star: StellarParameters) -> dict[str, float]:
    """Express a radius ratio in stellar, Jupiter and Earth radii."""
    radius_m = ratio * star.radius_m
    return {
        "ratio": float(ratio),
        "radius_km": float(radius_m / 1000.0),
        "radius_jupiter": float(radius_m / R_JUPITER_M),
        "radius_earth": float(radius_m / R_EARTH_M),
    }


def _decimate_mean(
    x: ArrayLike, y: ArrayLike, n_out: int
) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
    """Bin a series down to ``n_out`` points by averaging within bins."""
    xa = np.asarray(x, dtype=float)
    ya = np.asarray(y, dtype=float)
    if xa.size <= n_out:
        return xa, ya
    edges = np.linspace(xa[0], xa[-1] + 1e-9, n_out + 1)
    idx = np.clip(np.digitize(xa, edges) - 1, 0, n_out - 1)
    counts = np.bincount(idx, minlength=n_out)
    sum_x = np.bincount(idx, weights=xa, minlength=n_out)
    sum_y = np.bincount(idx, weights=ya, minlength=n_out)
    keep = counts > 0
    return sum_x[keep] / counts[keep], sum_y[keep] / counts[keep]


def _per_epoch_depths(
    time: NDArray[np.float64],
    flux: NDArray[np.float64],
    *,
    period: float,
    t0: float,
    duration: float,
    baseline: float,
    max_epochs: int = 60,
) -> list[dict[str, Any]]:
    """Depth of each individual transit, for consistency checks."""
    phase = fold_phase(time, period, t0)
    epoch = np.round((time - t0) / period).astype(int)
    core = np.abs(phase) <= 0.3 * duration
    rows: list[dict[str, Any]] = []
    for e in np.unique(epoch[core]):
        sel = core & (epoch == e)
        n = int(sel.sum())
        if n < 3:
            continue
        rows.append(
            {
                "epoch": int(e),
                "mid_time_bkjd": float(t0 + e * period),
                "n_points": n,
                "depth_ppm": float((baseline - np.median(flux[sel])) * 1e6),
            }
        )
    return rows[:max_epochs]


def _points_per_transit(
    time: NDArray[np.float64], period: float, t0: float, duration: float
) -> float:
    """Median number of in-transit cadences per observed transit."""
    phase = fold_phase(time, period, t0)
    epoch = np.round((time - t0) / period).astype(int)
    in_transit = np.abs(phase) <= 0.5 * duration
    if not in_transit.any():
        return 0.0
    counts = np.bincount(epoch[in_transit] - epoch[in_transit].min())
    counts = counts[counts > 0]
    return float(np.median(counts))


def load_light_curve(
    target: str,
    *,
    max_quarters: int | None,
    offline: bool,
) -> LightCurveBundle:
    """Fetch archival photometry, falling back to a simulation if need be."""
    if offline:
        log.info("offline mode requested: generating synthetic photometry")
        return generate_light_curve(n_quarters=max_quarters or 8)
    try:
        log.info("querying MAST for %s ...", target)
        return download_light_curve(target, max_quarters=max_quarters)
    except MastUnavailableError as exc:
        log.warning("archive unavailable (%s); falling back to simulation", exc)
        bundle = generate_light_curve(n_quarters=max_quarters or 8)
        bundle.provenance["fallback_reason"] = str(exc)
        return bundle


def run_pipeline(
    *,
    target: str = "Kepler-8",
    max_quarters: int | None = 8,
    offline: bool = False,
    star: StellarParameters = KEPLER_8,
    max_series_points: int = 2500,
) -> dict[str, Any]:
    """Run the full analysis and return the dashboard payload."""
    bundle = load_light_curve(target, max_quarters=max_quarters, offline=offline)
    log.info("loaded %d cadences (%s)", len(bundle), bundle.provenance["data_source"])

    # 1. Recover the ephemeris from the data itself.
    search = bls_search(bundle.time, bundle.flux)
    log.info(
        "BLS: P = %.6f d, T0 = %.5f, duration = %.2f h",
        search.period_days,
        search.t0_bkjd,
        search.duration_days * HOURS_PER_DAY,
    )

    # 2. Detrend with the transits masked, so the filter cannot eat the signal.
    if bundle.provenance["data_source"] == "mast":
        bundle = detrend(
            bundle,
            period=search.period_days,
            t0=search.t0_bkjd,
            duration=search.duration_days,
        )
    else:
        from .mast import LightCurveBundle as _Bundle

        flat = np.asarray(bundle.flux, dtype=float)
        bundle = _Bundle(
            time=bundle.time,
            flux=flat / np.median(flat),
            flux_err=bundle.flux_err,
            cadence_minutes=bundle.cadence_minutes,
            provenance=bundle.provenance,
        )

    phase = fold_phase(bundle.time, search.period_days, search.t0_bkjd)
    exposure_days = (
        bundle.cadence_minutes / (24.0 * 60.0)
        if np.isfinite(bundle.cadence_minutes)
        else LONG_CADENCE_DAYS
    )

    # 3. Bin the folded curve and fit the limb-darkened model to it. The fit
    #    supplies the physical first-to-fourth-contact duration, which is what
    #    the depth and SNR windows should use; the BLS box duration is only a
    #    coarse starting point.
    window = 3.0 * search.duration_days
    phase_bins, phase_flux, phase_err, phase_counts = bin_folded(
        phase, bundle.flux, n_bins=220, phase_range=(-window, window)
    )
    a_over_rstar = scaled_semimajor_axis(
        search.period_days, star.mass_msun, star.radius_rsun
    )
    fit: TransitFit = fit_transit(
        phase_bins,
        phase_flux,
        phase_err,
        period=search.period_days,
        u1=star.u1,
        u2=star.u2,
        k_guess=corrected_radius_ratio(max(search.depth_bls, 1e-6), star.u1, star.u2),
        b_guess=0.5,
        a_over_rstar_prior=a_over_rstar,
        exposure_days=exposure_days,
    )
    duration_days = transit_duration_days(
        search.period_days,
        fit.radius_ratio,
        fit.a_over_rstar,
        fit.impact_parameter,
    )
    log.info(
        "model fit: Rp/R* = %.5f, a/R* = %.2f, b = %.3f, i = %.2f deg, T14 = %.2f h",
        fit.radius_ratio,
        fit.a_over_rstar,
        fit.impact_parameter,
        fit.inclination_deg,
        duration_days * HOURS_PER_DAY,
    )

    model_phase = np.linspace(-window, window, 600)
    model_curve = model_flux(
        model_phase,
        period=search.period_days,
        k=fit.radius_ratio,
        a_over_rstar=fit.a_over_rstar,
        impact_parameter=fit.impact_parameter,
        u1=star.u1,
        u2=star.u2,
        exposure_days=exposure_days,
    )

    # 4. Measure the depth from the transit core, then convert it to a radius.
    depth = measure_depth(phase, bundle.flux, duration_days)
    correction = limb_darkening_correction(star.u1, star.u2)
    ratio_geometric = geometric_radius_ratio(depth.depth)
    ratio_corrected = corrected_radius_ratio(depth.depth, star.u1, star.u2)
    log.info(
        "depth = %.1f +/- %.1f ppm -> Rp/R* = %.5f (corrected)",
        depth.depth_ppm,
        depth.depth_err * 1e6,
        ratio_corrected,
    )

    # 5. Noise floor and detection significance.
    out_of_transit = np.abs(phase) > 1.5 * duration_days
    cdpp_ppm = cdpp_from_residuals(bundle.flux[out_of_transit])
    n_transits = count_transits(
        bundle.time, search.period_days, search.t0_bkjd, duration_days
    )
    n_pts = _points_per_transit(
        bundle.time, search.period_days, search.t0_bkjd, duration_days
    )
    snr = transit_snr(depth.depth, cdpp_ppm, n_transits, n_pts)
    snr_single = transit_snr(depth.depth, cdpp_ppm, 1, n_pts)
    log.info(
        "sigma_CDPP = %.1f ppm over %d transits (%.0f pts each) -> SNR = %.0f",
        cdpp_ppm,
        n_transits,
        n_pts,
        snr,
    )

    # 6. Series for the dashboard.
    raw_time, raw_flux = _decimate_mean(
        bundle.time, bundle.flux, max_series_points
    )
    segment_start = search.t0_bkjd + 10.0 * search.period_days - 0.75
    segment = (bundle.time >= segment_start) & (
        bundle.time <= segment_start + 4.0 * search.period_days
    )
    if segment.sum() < 50:  # fall back to the first available stretch
        segment = bundle.time <= bundle.time.min() + 4.0 * search.period_days

    fold_mask = np.abs(phase) <= window
    fold_idx = np.where(fold_mask)[0]
    if fold_idx.size > 6000:
        fold_idx = fold_idx[:: int(np.ceil(fold_idx.size / 6000))]

    period_grid, power_grid = decimate_periodogram(
        search.period_grid, search.power_grid
    )
    mu_grid = np.linspace(0.0, 1.0, 120)

    literature_ratio = LITERATURE_PLANET["radius_ratio"]
    payload: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "pipeline_version": __version__,
        "provenance": bundle.provenance,
        "star": star.to_dict(),
        "limb_darkening": {
            "u1": star.u1,
            "u2": star.u2,
            "correction_factor": correction,
            "law": "quadratic: I(mu)/I(1) = 1 - u1(1-mu) - u2(1-mu)^2",
            "profile": {
                "mu": mu_grid.tolist(),
                "intensity": quadratic_intensity(mu_grid, star.u1, star.u2).tolist(),
            },
        },
        "ephemeris": {
            "period_days": search.period_days,
            "t0_bkjd": search.t0_bkjd,
            "duration_hours": duration_days * HOURS_PER_DAY,
            "duration_hours_bls_box": search.duration_days * HOURS_PER_DAY,
            "literature_duration_hours": KEPLER_8B.duration_hours,
            "n_transits_observed": n_transits,
            "bls_peak_power": search.power,
            "literature_period_days": KEPLER_8B.period_days,
            "period_offset_seconds": (
                search.period_days - KEPLER_8B.period_days
            )
            * 86_400.0,
        },
        "depth": {
            "depth": depth.depth,
            "depth_ppm": depth.depth_ppm,
            "depth_percent": depth.depth_percent,
            "depth_err_ppm": depth.depth_err * 1e6,
            "max_depth_ppm": fit.model_depth * 1e6,
            "baseline_flux": depth.baseline,
            "n_core_cadences": depth.n_in_transit,
            "n_baseline_cadences": depth.n_out_of_transit,
            "core_fraction": 0.6,
        },
        "radius": {
            "geometric": radius_breakdown(ratio_geometric, star),
            "limb_darkening_corrected": radius_breakdown(ratio_corrected, star),
            "model_fit": radius_breakdown(fit.radius_ratio, star),
            "literature": radius_breakdown(literature_ratio, star)
            | {"reference": LITERATURE_PLANET["reference"]},
            "correction_gain_percent": (ratio_corrected / ratio_geometric - 1.0)
            * 100.0,
        },
        "fit": fit.to_dict()
        | {
            "literature_a_over_rstar": LITERATURE_PLANET["semimajor_axis_over_rstar"],
            "literature_impact_parameter": LITERATURE_PLANET["impact_parameter"],
            "literature_inclination_deg": LITERATURE_PLANET["inclination_deg"],
        },
        "snr": {
            "cdpp_ppm": cdpp_ppm,
            "n_transits": n_transits,
            "n_points_per_transit": n_pts,
            "snr": snr,
            "snr_single_transit": snr_single,
            "detection_threshold": 7.1,
        },
        "series": {
            "raw": {
                "time": raw_time.tolist(),
                "flux": raw_flux.tolist(),
                "binned_from": int(len(bundle)),
            },
            "segment": {
                "time": bundle.time[segment].tolist(),
                "flux": bundle.flux[segment].tolist(),
            },
            "folded": {
                "phase_hours": (phase[fold_idx] * HOURS_PER_DAY).tolist(),
                "flux": bundle.flux[fold_idx].tolist(),
            },
            "binned": {
                "phase_hours": (phase_bins * HOURS_PER_DAY).tolist(),
                "flux": phase_flux.tolist(),
                "err": phase_err.tolist(),
                "counts": phase_counts.tolist(),
            },
            "model": {
                "phase_hours": (model_phase * HOURS_PER_DAY).tolist(),
                "flux": model_curve.tolist(),
            },
            "periodogram": {
                "period_days": period_grid.tolist(),
                "power": power_grid.tolist(),
            },
        },
        "references": [
            ref
            | {
                "radius_earth": ref["radius_ratio"] * star.radius_m / R_EARTH_M,
                "period_offset_seconds": (
                    search.period_days - float(ref["period_days"])
                )
                * 86_400.0,
            }
            for ref in REFERENCES
        ],
        "transits": _per_epoch_depths(
            bundle.time,
            bundle.flux,
            period=search.period_days,
            t0=search.t0_bkjd,
            duration=search.duration_days,
            baseline=depth.baseline,
        ),
    }
    return payload
