"""Quadratic limb darkening: intensity law, depth correction, transit profile.

Section 2.1 of the proposal. A star is not a uniform disk, so the fractional
flux lost when a planet crosses it depends on *where* on the disk it crosses.
Two things live here:

1. The closed-form depth correction used to turn an observed depth into a
   radius ratio, and
2. a numerically integrated limb-darkened transit profile, used both to
   generate the synthetic fallback light curve and to fit the real one.
"""

from __future__ import annotations

import numpy as np
from numpy.typing import ArrayLike, NDArray


def quadratic_intensity(mu: ArrayLike, u1: float, u2: float) -> NDArray[np.float64]:
    r"""Normalised specific intensity of the quadratic limb darkening law.

    .. math:: I(\mu)/I(1) = 1 - u_1(1 - \mu) - u_2(1 - \mu)^2

    ``mu`` is :math:`\cos\theta`, the cosine of the angle between the line of
    sight and the local surface normal: ``mu = 1`` at disk centre, ``0`` at the
    limb.
    """
    mu_arr = np.asarray(mu, dtype=float)
    one_minus_mu = 1.0 - mu_arr
    return 1.0 - u1 * one_minus_mu - u2 * one_minus_mu**2


def intensity_at_radius(r: ArrayLike, u1: float, u2: float) -> NDArray[np.float64]:
    """Intensity as a function of projected radius ``r`` in stellar radii."""
    r_arr = np.asarray(r, dtype=float)
    mu = np.sqrt(np.clip(1.0 - r_arr**2, 0.0, 1.0))
    return quadratic_intensity(mu, u1, u2)


def disk_integrated_intensity(u1: float, u2: float) -> float:
    r"""Total flux of the limb-darkened disk, :math:`\pi(1 - u_1/3 - u_2/6)`."""
    return float(np.pi * (1.0 - u1 / 3.0 - u2 / 6.0))


def limb_darkening_correction(u1: float, u2: float) -> float:
    r"""The bracketed factor :math:`1 - 0.2(u_1 + 2u_2)`.

    This is the first-order ratio between the flux blocked at the centre of a
    limb-darkened disk and the flux that would be blocked on a uniform disk of
    the same total brightness.
    """
    return 1.0 - 0.2 * (u1 + 2.0 * u2)


def corrected_radius_ratio(depth: float, u1: float, u2: float) -> float:
    r"""Radius ratio from a transit depth, corrected for limb darkening.

    .. math:: R_p/R_* = \sqrt{\Delta F/F}\;[1 - 0.2(u_1 + 2u_2)]^{-1/2}

    ``depth`` is the fractional flux drop :math:`\Delta F / F` (not a
    percentage, not ppm).
    """
    if depth < 0.0:
        raise ValueError("transit depth must be non-negative")
    correction = limb_darkening_correction(u1, u2)
    if correction <= 0.0:
        raise ValueError("limb darkening correction factor must be positive")
    return float(np.sqrt(depth) / np.sqrt(correction))


def geometric_radius_ratio(depth: float) -> float:
    r"""Uniform-disk radius ratio, :math:`\sqrt{\Delta F/F}`."""
    if depth < 0.0:
        raise ValueError("transit depth must be non-negative")
    return float(np.sqrt(depth))


def occulted_flux_fraction(
    z: ArrayLike,
    k: float,
    u1: float,
    u2: float,
    n_radial: int = 512,
) -> NDArray[np.float64]:
    """Fraction of the stellar flux hidden by the planet.

    ``z`` is the sky-projected star-planet separation in stellar radii and
    ``k = Rp/R*``. Each annulus of the stellar disk contributes
    ``I(r) * 2 * r * phi(r)`` where ``phi`` is the half-angle of the annulus
    that falls behind the planet, so the blocked flux is a one-dimensional
    integral evaluated on a per-``z`` grid that spans only the overlap region.
    """
    z_arr = np.atleast_1d(np.abs(np.asarray(z, dtype=float)))
    blocked = np.zeros_like(z_arr)
    if k <= 0.0:
        return blocked

    # Only separations that actually overlap the disk contribute. In a real
    # light curve that is a few percent of the cadences, so skipping the rest
    # keeps the integral cheap even for years of photometry.
    overlapping = np.flatnonzero(z_arr < 1.0 + k)
    if overlapping.size == 0:
        return blocked

    t = np.linspace(0.0, 1.0, n_radial)
    total = disk_integrated_intensity(u1, u2)

    # Chunked so the (n_z x n_radial) work array stays cache friendly.
    chunk = max(1, 4_000_000 // n_radial)
    for start in range(0, overlapping.size, chunk):
        sel = overlapping[start : start + chunk]
        zc = z_arr[sel]
        r_min = np.clip(zc - k, 0.0, 1.0)
        r_max = np.clip(zc + k, 0.0, 1.0)
        r = r_min[:, None] + (r_max - r_min)[:, None] * t[None, :]

        with np.errstate(divide="ignore", invalid="ignore"):
            cos_phi = (zc[:, None] ** 2 + r**2 - k**2) / (2.0 * zc[:, None] * r)
        phi = np.arccos(np.clip(cos_phi, -1.0, 1.0))
        # Annuli entirely swallowed by the planet, and the degenerate r = 0 or
        # z = 0 cases the cosine rule cannot express.
        phi = np.where(r + zc[:, None] <= k, np.pi, phi)
        phi = np.where(np.isfinite(phi), phi, 0.0)

        integrand = intensity_at_radius(r, u1, u2) * 2.0 * r * phi
        blocked[sel] = np.trapezoid(integrand, r, axis=1) / total

    return blocked


def transit_light_curve(
    time: ArrayLike,
    *,
    period: float,
    t0: float,
    k: float,
    a_over_rstar: float,
    impact_parameter: float,
    u1: float,
    u2: float,
    n_radial: int = 512,
) -> NDArray[np.float64]:
    """Relative flux of a limb-darkened transit on a circular orbit.

    The sky-projected separation for a circular orbit of phase angle
    ``theta = 2*pi*(t - t0)/P`` is
    ``z = (a/R*) * sqrt(sin^2(theta) + (b/(a/R*))^2 * cos^2(theta))``,
    which reduces to the impact parameter ``b`` at mid-transit. Points on the
    far side of the orbit (secondary eclipse geometry) are not occulted.
    """
    t = np.asarray(time, dtype=float)
    phase = (t - t0) / period
    theta = 2.0 * np.pi * (phase - np.round(phase))

    z = a_over_rstar * np.sqrt(
        np.sin(theta) ** 2 + (impact_parameter / a_over_rstar) ** 2 * np.cos(theta) ** 2
    )
    blocked = occulted_flux_fraction(z, k, u1, u2, n_radial=n_radial)
    blocked = np.where(np.cos(theta) > 0.0, blocked, 0.0)
    return 1.0 - blocked


def central_depth(k: float, u1: float, u2: float) -> float:
    """Depth of a limb-darkened transit at ``z = 0`` (central crossing)."""
    return float(occulted_flux_fraction([0.0], k, u1, u2)[0])
