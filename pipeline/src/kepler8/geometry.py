"""Transit geometry: durations and impact parameters from orbital elements."""

from __future__ import annotations

import numpy as np

GRAVITATIONAL_CONSTANT = 6.674_30e-11  # m^3 kg^-1 s^-2
M_SUN_KG = 1.988_41e30
R_SUN_M = 6.957e8
SECONDS_PER_DAY = 86_400.0


def scaled_semimajor_axis(
    period_days: float, mass_msun: float, radius_rsun: float
) -> float:
    r"""``a/R*`` from Kepler's third law and the host star's mean density.

    .. math:: \frac{a}{R_*} = \frac{1}{R_*}
              \left(\frac{G M_* P^2}{4\pi^2}\right)^{1/3}

    For a transit fit this is the single most useful external constraint: the
    light curve on its own cannot separate the radius ratio from the orbital
    geometry at 30 minute cadence, but the stellar mass and radius pin ``a/R*``
    to a few percent.
    """
    if min(period_days, mass_msun, radius_rsun) <= 0.0:
        raise ValueError("period, mass and radius must be positive")
    period_s = period_days * SECONDS_PER_DAY
    a_m = (
        GRAVITATIONAL_CONSTANT * mass_msun * M_SUN_KG * period_s**2 / (4.0 * np.pi**2)
    ) ** (1.0 / 3.0)
    return float(a_m / (radius_rsun * R_SUN_M))


def transit_duration_days(
    period: float,
    k: float,
    a_over_rstar: float,
    impact_parameter: float,
) -> float:
    r"""First-to-fourth-contact transit duration for a circular orbit.

    .. math::
        T_{14} = \frac{P}{\pi}\arcsin\!\left[
            \frac{\sqrt{(1+k)^2 - b^2}}{(a/R_*)\,\sin i}\right]

    Returns 0 when the geometry is grazing or non-transiting.
    """
    if a_over_rstar <= 0.0:
        raise ValueError("a/R* must be positive")
    numerator_sq = (1.0 + k) ** 2 - impact_parameter**2
    if numerator_sq <= 0.0:
        return 0.0
    cos_i = np.clip(impact_parameter / a_over_rstar, -1.0, 1.0)
    sin_i = np.sqrt(1.0 - cos_i**2)
    argument = np.sqrt(numerator_sq) / (a_over_rstar * sin_i)
    if argument >= 1.0:
        return float(period / 2.0)
    return float(period / np.pi * np.arcsin(argument))


def impact_parameter_from_inclination(
    a_over_rstar: float, inclination_deg: float
) -> float:
    """``b = (a/R*) cos i`` for a circular orbit."""
    return float(a_over_rstar * np.cos(np.radians(inclination_deg)))
