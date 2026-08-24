"""Least-squares fit of a limb-darkened transit model to a folded light curve."""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any

import numpy as np
from numpy.typing import ArrayLike, NDArray
from scipy.optimize import least_squares

from .limb_darkening import transit_light_curve

# Kepler long-cadence integration time (days): 270 co-added 6.02 s frames.
LONG_CADENCE_DAYS = 1765.5 / 86_400.0


def model_flux(
    phase: ArrayLike,
    *,
    period: float,
    k: float,
    a_over_rstar: float,
    impact_parameter: float,
    u1: float,
    u2: float,
    exposure_days: float = 0.0,
    n_supersample: int = 7,
) -> NDArray[np.float64]:
    """Model flux at phases measured in days from mid-transit.

    When ``exposure_days`` is non-zero the model is averaged over the exposure
    window, which matters for Kepler's 30 minute cadence: without it, ingress
    and egress are far sharper in the model than in the data.
    """
    ph = np.asarray(phase, dtype=float)
    if exposure_days > 0.0 and n_supersample > 1:
        offsets = np.linspace(-0.5, 0.5, n_supersample) * exposure_days
        sample_phase = ph[:, None] + offsets[None, :]
    else:
        sample_phase = ph[:, None]

    flux = transit_light_curve(
        sample_phase.ravel(),
        period=period,
        t0=0.0,
        k=k,
        a_over_rstar=a_over_rstar,
        impact_parameter=impact_parameter,
        u1=u1,
        u2=u2,
    )
    return flux.reshape(sample_phase.shape).mean(axis=1)


@dataclass(frozen=True)
class TransitFit:
    """Best-fit geometry of a limb-darkened transit."""

    radius_ratio: float
    a_over_rstar: float
    impact_parameter: float
    inclination_deg: float
    model_depth: float
    rms_residual_ppm: float
    reduced_chi_square: float
    n_free_parameters: int
    a_over_rstar_source: str
    converged: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def fit_transit(
    phase: ArrayLike,
    flux: ArrayLike,
    flux_err: ArrayLike | None,
    *,
    period: float,
    u1: float,
    u2: float,
    k_guess: float = 0.1,
    a_guess: float = 7.0,
    b_guess: float = 0.5,
    a_over_rstar_prior: float | None = None,
    exposure_days: float = LONG_CADENCE_DAYS,
) -> TransitFit:
    """Fit the radius ratio and impact parameter of a limb-darkened transit.

    When ``a_over_rstar_prior`` is given it is held fixed, which is how the
    degeneracy between radius ratio, impact parameter and orbital scale is
    normally broken: the stellar mean density fixes ``a/R*`` far better than a
    30 minute cadence light curve can. Pass ``None`` to fit it as a third free
    parameter instead.

    The limb darkening coefficients are always held fixed at the tabulated
    values for the host star; they too are strongly degenerate with the radius
    ratio at this cadence.
    """
    ph = np.asarray(phase, dtype=float)
    fl = np.asarray(flux, dtype=float)
    if flux_err is None:
        err = np.ones_like(fl)
    else:
        err = np.asarray(flux_err, dtype=float)
        err = np.where(np.isfinite(err) & (err > 0), err, np.nanmedian(err))

    fixed_a = a_over_rstar_prior is not None

    def unpack(theta: NDArray[np.float64]) -> tuple[float, float, float]:
        if fixed_a:
            k, b = theta
            return float(k), float(a_over_rstar_prior), float(b)
        k, a_over_rstar, b = theta
        return float(k), float(a_over_rstar), float(b)

    def evaluate(theta: NDArray[np.float64]) -> NDArray[np.float64]:
        k, a_over_rstar, b = unpack(theta)
        return model_flux(
            ph,
            period=period,
            k=k,
            a_over_rstar=a_over_rstar,
            impact_parameter=b,
            u1=u1,
            u2=u2,
            exposure_days=exposure_days,
        )

    def residuals(theta: NDArray[np.float64]) -> NDArray[np.float64]:
        return (fl - evaluate(theta)) / err

    if fixed_a:
        x0 = np.array([k_guess, b_guess])
        lower, upper = np.array([1e-3, 0.0]), np.array([0.5, 1.0])
        scale = np.array([0.01, 0.1])
    else:
        x0 = np.array([k_guess, a_guess, b_guess])
        lower, upper = np.array([1e-3, 1.5, 0.0]), np.array([0.5, 40.0, 1.0])
        scale = np.array([0.01, 1.0, 0.1])

    result = least_squares(
        residuals,
        x0=x0,
        bounds=(lower, upper),
        x_scale=scale,
        loss="soft_l1",
        f_scale=3.0,
    )

    k, a_over_rstar, b = unpack(result.x)
    best = evaluate(result.x)
    resid = fl - best
    dof = max(resid.size - result.x.size, 1)
    chi2 = float(np.sum((resid / err) ** 2) / dof)
    inclination = float(np.degrees(np.arccos(np.clip(b / a_over_rstar, -1.0, 1.0))))

    return TransitFit(
        radius_ratio=float(k),
        a_over_rstar=float(a_over_rstar),
        impact_parameter=float(b),
        inclination_deg=inclination,
        model_depth=float(1.0 - best.min()),
        rms_residual_ppm=float(np.sqrt(np.mean(resid**2)) * 1e6),
        reduced_chi_square=chi2,
        n_free_parameters=int(result.x.size),
        a_over_rstar_source=(
            "fixed by stellar density (Kepler's third law)"
            if fixed_a
            else "free parameter"
        ),
        converged=bool(result.success),
    )
