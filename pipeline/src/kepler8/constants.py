"""Physical constants and Kepler-8 system parameters.

Stellar and ephemeris values are the literature values for KIC 6922244
(Kepler-8) from Jenkins et al. 2010, ApJ 724, 1108. They are used as priors
and as sanity references; the pipeline measures the transit depth, period and
radius ratio from the photometry itself.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any

from .geometry import transit_duration_days

# Unit conversions (IAU 2015 nominal values, metres).
R_SUN_M = 6.957e8
R_JUPITER_M = 7.1492e7
R_EARTH_M = 6.371e6
SECONDS_PER_DAY = 86_400.0


@dataclass(frozen=True)
class StellarParameters:
    """Host star properties used to convert a radius ratio into a radius."""

    name: str = "Kepler-8"
    kic: str = "KIC 6922244"
    kepler_magnitude: float = 13.563
    radius_rsun: float = 1.486
    mass_msun: float = 1.213
    teff_k: float = 6213.0
    logg_cgs: float = 4.174
    metallicity_dex: float = -0.055
    # Quadratic limb darkening coefficients for the Kepler bandpass.
    u1: float = 0.39
    u2: float = 0.26

    @property
    def radius_m(self) -> float:
        return self.radius_rsun * R_SUN_M

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["radius_m"] = self.radius_m
        return payload


# Published values for Kepler-8b, as served by the NASA Exoplanet Archive.
# The pipeline is validated against these: the discovery paper, and the final
# uniform reprocessing of the whole Kepler mission (DR25).
LITERATURE_PLANET = {
    "radius_ratio": 0.09809,
    "radius_jupiter": 1.419,
    "semimajor_axis_over_rstar": 6.97,
    "impact_parameter": 0.724,
    "inclination_deg": 84.07,
    "reference": "Jenkins et al. 2010, ApJ 724, 1108",
}

REFERENCES = [
    {
        "key": "jenkins2010",
        "label": "Jenkins et al. 2010",
        "detail": "Discovery paper (ApJ 724, 1108), Q0-Q1 photometry",
        "url": "https://ui.adsabs.harvard.edu/abs/2010ApJ...724.1108J/abstract",
        "period_days": 3.52254,
        "t0_bkjd": 121.1182,
        "radius_ratio": 0.09809,
        "radius_jupiter": 1.419,
        "a_over_rstar": 6.97,
        "impact_parameter": 0.724,
        "inclination_deg": 84.07,
        "depth_ppm": None,
        "duration_hours": None,
    },
    {
        "key": "dr25",
        "label": "Kepler DR25 KOI table",
        "detail": "Final uniform mission reprocessing, KOI-10.01 (Q1-Q17)",
        "url": "https://exoplanetarchive.ipac.caltech.edu/docs/Kepler_KOI_docs.html",
        "period_days": 3.5224984290,
        "t0_bkjd": 121.1194228,
        "radius_ratio": 0.092086,
        "radius_jupiter": 1.3016,
        "a_over_rstar": 7.541,
        "impact_parameter": 0.631,
        "inclination_deg": 85.20,
        "depth_ppm": 9145.7,
        "duration_hours": 3.198430,
    },
]


@dataclass(frozen=True)
class Ephemeris:
    """Literature ephemeris for Kepler-8b, used as the search prior."""

    period_days: float = 3.5224991
    # Mid-transit time in Barycentric Kepler Julian Date (BJD - 2454833.0).
    t0_bkjd: float = 121.11786

    @property
    def duration_days(self) -> float:
        """Duration implied by the published orbital geometry."""
        return transit_duration_days(
            self.period_days,
            float(LITERATURE_PLANET["radius_ratio"]),
            float(LITERATURE_PLANET["semimajor_axis_over_rstar"]),
            float(LITERATURE_PLANET["impact_parameter"]),
        )

    @property
    def duration_hours(self) -> float:
        return self.duration_days * 24.0

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["duration_days"] = self.duration_days
        payload["duration_hours"] = self.duration_hours
        return payload


KEPLER_8 = StellarParameters()
KEPLER_8B = Ephemeris()
