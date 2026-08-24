"""Depth measurement, phase folding, noise estimation and transit SNR."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import ArrayLike, NDArray

PPM = 1.0e6


@dataclass(frozen=True)
class DepthMeasurement:
    """Transit depth in fractional flux units, with its uncertainty."""

    depth: float
    depth_err: float
    n_in_transit: int
    n_out_of_transit: int
    baseline: float

    @property
    def depth_ppm(self) -> float:
        return self.depth * PPM

    @property
    def depth_percent(self) -> float:
        return self.depth * 100.0


def fold_phase(
    time: ArrayLike, period: float, t0: float
) -> NDArray[np.float64]:
    """Orbital phase in days from mid-transit, wrapped to +/- P/2."""
    t = np.asarray(time, dtype=float)
    return (t - t0 + 0.5 * period) % period - 0.5 * period


def robust_scatter(values: ArrayLike) -> float:
    """Median absolute deviation scaled to a Gaussian sigma."""
    v = np.asarray(values, dtype=float)
    v = v[np.isfinite(v)]
    if v.size < 2:
        return float("nan")
    return float(1.4826 * np.median(np.abs(v - np.median(v))))


def measure_depth(
    phase: ArrayLike,
    flux: ArrayLike,
    duration: float,
    *,
    core_fraction: float = 0.6,
    baseline_window: tuple[float, float] = (1.0, 3.0),
) -> DepthMeasurement:
    """Measure the flux drop by comparing the transit core to a local baseline.

    Only the inner ``core_fraction`` of the transit duration is averaged, so
    ingress and egress cadences (partially covered, and smeared by the 30 minute
    long-cadence integration) cannot dilute the depth. The baseline is taken
    from an annulus of phase either side of the transit, between
    ``baseline_window`` multiples of half the duration, which rejects any slow
    residual trend without reaching into the next transit.
    """
    ph = np.asarray(phase, dtype=float)
    fl = np.asarray(flux, dtype=float)
    finite = np.isfinite(ph) & np.isfinite(fl)
    ph, fl = ph[finite], fl[finite]

    half = 0.5 * duration
    in_core = np.abs(ph) <= core_fraction * half
    lo, hi = baseline_window
    in_baseline = (np.abs(ph) >= lo * half) & (np.abs(ph) <= hi * half)

    if in_core.sum() < 3 or in_baseline.sum() < 3:
        raise ValueError("not enough cadences in the transit core or baseline")

    baseline = float(np.median(fl[in_baseline]))
    core = float(np.median(fl[in_core]))
    depth = baseline - core

    # Standard error of each median (1.253 * sigma / sqrt(n) for a median),
    # added in quadrature.
    sigma_core = robust_scatter(fl[in_core])
    sigma_base = robust_scatter(fl[in_baseline])
    err = 1.253 * np.hypot(
        sigma_core / np.sqrt(in_core.sum()), sigma_base / np.sqrt(in_baseline.sum())
    )

    return DepthMeasurement(
        depth=depth,
        depth_err=float(err),
        n_in_transit=int(in_core.sum()),
        n_out_of_transit=int(in_baseline.sum()),
        baseline=baseline,
    )


def bin_folded(
    phase: ArrayLike,
    flux: ArrayLike,
    *,
    n_bins: int,
    phase_range: tuple[float, float],
) -> tuple[NDArray[np.float64], NDArray[np.float64], NDArray[np.float64], NDArray[np.int_]]:
    """Bin a folded light curve, returning centres, means, standard errors, counts."""
    ph = np.asarray(phase, dtype=float)
    fl = np.asarray(flux, dtype=float)
    lo, hi = phase_range
    mask = np.isfinite(ph) & np.isfinite(fl) & (ph >= lo) & (ph <= hi)
    ph, fl = ph[mask], fl[mask]

    edges = np.linspace(lo, hi, n_bins + 1)
    idx = np.clip(np.digitize(ph, edges) - 1, 0, n_bins - 1)

    centres = 0.5 * (edges[:-1] + edges[1:])
    counts = np.bincount(idx, minlength=n_bins)
    totals = np.bincount(idx, weights=fl, minlength=n_bins)
    sq_totals = np.bincount(idx, weights=fl**2, minlength=n_bins)

    with np.errstate(invalid="ignore", divide="ignore"):
        means = totals / counts
        variance = np.clip(sq_totals / counts - means**2, 0.0, None)
        errors = np.sqrt(variance / np.maximum(counts - 1, 1))

    ok = counts > 0
    return centres[ok], means[ok], errors[ok], counts[ok]


def count_transits(
    time: ArrayLike, period: float, t0: float, duration: float
) -> int:
    """Number of distinct epochs with at least one in-transit cadence."""
    t = np.asarray(time, dtype=float)
    t = t[np.isfinite(t)]
    if t.size == 0:
        return 0
    epoch = np.round((t - t0) / period)
    in_transit = np.abs(fold_phase(t, period, t0)) <= 0.5 * duration
    return int(np.unique(epoch[in_transit]).size)


def transit_snr(
    depth: float,
    cdpp_ppm: float,
    n_transits: int,
    n_points_per_transit: float,
) -> float:
    r"""Total transit signal-to-noise ratio.

    .. math::
        \mathrm{SNR} = \frac{\Delta F/F}{\sigma_{\mathrm{CDPP}}}
                       \sqrt{N_{\mathrm{transit}} N_{\mathrm{pts}}}

    ``cdpp_ppm`` is the Combined Differential Photometric Precision in parts
    per million, i.e. the per-cadence noise of the detrended light curve.
    """
    if cdpp_ppm <= 0.0:
        raise ValueError("CDPP must be positive")
    if n_transits < 0 or n_points_per_transit < 0:
        raise ValueError("cadence counts must be non-negative")
    sigma = cdpp_ppm / PPM
    return float((depth / sigma) * np.sqrt(n_transits * n_points_per_transit))


def cdpp_from_residuals(flux: ArrayLike) -> float:
    """Per-cadence photometric precision in ppm from out-of-transit scatter.

    Uses the point-to-point (first difference) scatter, which is insensitive to
    any residual astrophysical variability on timescales longer than a cadence.
    """
    fl = np.asarray(flux, dtype=float)
    fl = fl[np.isfinite(fl)]
    if fl.size < 3:
        return float("nan")
    diffs = np.diff(fl)
    return float(robust_scatter(diffs) / np.sqrt(2.0) * PPM)
