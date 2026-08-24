"""Box Least Squares period search: recover the ephemeris from the photometry."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np
from numpy.typing import ArrayLike, NDArray


@dataclass(frozen=True)
class PeriodSearchResult:
    """Best transit ephemeris found by BLS, plus the periodogram for plotting."""

    period_days: float
    t0_bkjd: float
    duration_days: float
    depth_bls: float
    power: float
    period_grid: NDArray[np.float64]
    power_grid: NDArray[np.float64]

    def to_dict(self) -> dict[str, Any]:
        return {
            "period_days": self.period_days,
            "t0_bkjd": self.t0_bkjd,
            "duration_days": self.duration_days,
            "duration_hours": self.duration_days * 24.0,
            "depth_bls_ppm": self.depth_bls * 1e6,
            "peak_power": self.power,
        }


def bls_search(
    time: ArrayLike,
    flux: ArrayLike,
    *,
    minimum_period: float = 1.0,
    maximum_period: float = 10.0,
    durations: tuple[float, ...] = (0.08, 0.12, 0.17, 0.22),
    coarse_baseline_days: float = 200.0,
    refine_window: float = 0.02,
    refine_points: int = 6000,
) -> PeriodSearchResult:
    """Search for a periodic box-shaped dimming, then refine the peak.

    A BLS frequency grid must be fine enough that the transit stays aligned
    across the whole baseline, so the required grid density grows with the
    *square* of the time span. Searching years of photometry blindly at that
    density is wasteful, so the blind stage runs on the first
    ``coarse_baseline_days`` of data and the peak is then re-fitted on a dense
    grid using every cadence, which is what sets the final period precision.
    """
    from astropy.timeseries import BoxLeastSquares

    t = np.asarray(time, dtype=float)
    f = np.asarray(flux, dtype=float)
    finite = np.isfinite(t) & np.isfinite(f)
    t, f = t[finite], f[finite]
    if t.size < 100:
        raise ValueError("too few cadences for a period search")

    duration_list = list(durations)
    coarse_mask = t <= t.min() + coarse_baseline_days
    if coarse_mask.sum() < 100:
        coarse_mask = np.ones_like(t, dtype=bool)

    coarse_bls = BoxLeastSquares(t[coarse_mask], f[coarse_mask])
    coarse_grid = coarse_bls.autoperiod(
        duration_list,
        minimum_period=minimum_period,
        maximum_period=maximum_period,
        frequency_factor=2.0,
    )
    coarse = coarse_bls.power(coarse_grid, duration_list)
    best = int(np.argmax(coarse.power))
    coarse_period = float(coarse.period[best])

    bls = BoxLeastSquares(t, f)
    fine_grid = np.linspace(
        max(coarse_period - refine_window, 0.5 * minimum_period),
        coarse_period + refine_window,
        refine_points,
    )
    fine = bls.power(fine_grid, duration_list)
    peak = int(np.argmax(fine.power))

    return PeriodSearchResult(
        period_days=float(fine.period[peak]),
        t0_bkjd=float(fine.transit_time[peak]),
        duration_days=float(fine.duration[peak]),
        depth_bls=float(fine.depth[peak]),
        power=float(fine.power[peak]),
        period_grid=np.asarray(coarse.period, dtype=float),
        power_grid=np.asarray(coarse.power, dtype=float),
    )


def decimate_periodogram(
    periods: ArrayLike, powers: ArrayLike, n_out: int = 900
) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
    """Thin a periodogram for transport, keeping the peak of every bin."""
    p = np.asarray(periods, dtype=float)
    pw = np.asarray(powers, dtype=float)
    order = np.argsort(p)
    p, pw = p[order], pw[order]
    if p.size <= n_out:
        return p, pw

    edges = np.linspace(p[0], p[-1], n_out + 1)
    idx = np.clip(np.digitize(p, edges) - 1, 0, n_out - 1)
    out_p = np.full(n_out, np.nan)
    out_pw = np.full(n_out, -np.inf)
    for bin_id in range(n_out):
        sel = idx == bin_id
        if not sel.any():
            continue
        local = int(np.argmax(pw[sel]))
        out_p[bin_id] = p[sel][local]
        out_pw[bin_id] = pw[sel][local]
    keep = np.isfinite(out_p)
    return out_p[keep], out_pw[keep]
