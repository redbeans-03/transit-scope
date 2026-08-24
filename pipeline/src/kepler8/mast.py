"""Light curve retrieval from the NASA MAST archive via ``lightkurve``."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np
from numpy.typing import NDArray

from .photometry import fold_phase


@dataclass
class LightCurveBundle:
    """A cleaned, normalised light curve plus the provenance of its cadences."""

    time: NDArray[np.float64]
    flux: NDArray[np.float64]
    flux_err: NDArray[np.float64]
    cadence_minutes: float
    provenance: dict[str, Any] = field(default_factory=dict)

    def __len__(self) -> int:
        return int(self.time.size)


class MastUnavailableError(RuntimeError):
    """Raised when the archive cannot be queried or returns nothing usable."""


def download_light_curve(
    target: str = "Kepler-8",
    *,
    mission: str = "Kepler",
    cadence: str = "long",
    max_quarters: int | None = 8,
    quality_bitmask: str = "default",
) -> LightCurveBundle:
    """Download, stitch and normalise archival photometry for ``target``.

    Each quarter is normalised to its own median before stitching, because
    Kepler quarters differ in aperture, focus and pointing, and their raw
    electron-per-second levels are not directly comparable.
    """
    try:
        import lightkurve as lk
    except ImportError as exc:  # pragma: no cover - dependency is declared
        raise MastUnavailableError("lightkurve is not installed") from exc

    try:
        search = lk.search_lightcurve(
            target, mission=mission, cadence=cadence, author=mission
        )
    except Exception as exc:
        raise MastUnavailableError(f"MAST search failed: {exc}") from exc

    if len(search) == 0:
        raise MastUnavailableError(f"no {mission} {cadence}-cadence data for {target}")

    selected = search if max_quarters is None else search[:max_quarters]
    try:
        collection = selected.download_all(quality_bitmask=quality_bitmask)
    except Exception as exc:
        raise MastUnavailableError(f"MAST download failed: {exc}") from exc

    if collection is None or len(collection) == 0:
        raise MastUnavailableError("MAST returned no light curve files")

    stitched = collection.stitch().remove_nans()
    # Kepler's own quality flags leave a few isolated flux spikes; clip upward
    # outliers only, so that transits (downward excursions) survive untouched.
    stitched = stitched.remove_outliers(sigma_upper=4.0, sigma_lower=20.0)

    exposures = [
        float(lc.meta.get("TIMEDEL", np.nan)) * 24.0 * 60.0 for lc in collection
    ]
    cadence_minutes = float(np.nanmedian(exposures)) if exposures else float("nan")

    time = np.asarray(stitched.time.value, dtype=float)
    flux = np.asarray(stitched.flux.value, dtype=float)
    flux_err = np.asarray(stitched.flux_err.value, dtype=float)

    provenance = {
        "data_source": "mast",
        "mission": mission,
        "author": mission,
        "cadence": cadence,
        "target": target,
        "object": str(collection[0].meta.get("OBJECT", target)),
        "quarters": [int(lc.meta.get("QUARTER", -1)) for lc in collection],
        "n_files": len(collection),
        "n_cadences": int(time.size),
        "baseline_days": float(time.max() - time.min()) if time.size else 0.0,
        "time_format": "BKJD (BJD - 2454833)",
        "lightkurve_version": lk.__version__,
        "quality_bitmask": quality_bitmask,
    }

    return LightCurveBundle(
        time=time,
        flux=flux,
        flux_err=flux_err,
        cadence_minutes=cadence_minutes,
        provenance=provenance,
    )


def detrend(
    bundle: LightCurveBundle,
    *,
    period: float,
    t0: float,
    duration: float,
    window_length: int = 301,
) -> LightCurveBundle:
    """Remove slow stellar and instrumental trends, protecting the transits.

    A Savitzky-Golay high-pass filter is fitted with the in-transit cadences
    masked out, so the filter cannot absorb part of the transit signal and bias
    the depth low.
    """
    try:
        import lightkurve as lk
    except ImportError as exc:  # pragma: no cover
        raise MastUnavailableError("lightkurve is not installed") from exc

    lc = lk.LightCurve(
        time=bundle.time, flux=bundle.flux, flux_err=bundle.flux_err
    )
    # Pad the mask beyond the nominal duration to also exclude ingress/egress.
    in_transit = np.abs(fold_phase(bundle.time, period, t0)) <= 0.75 * duration
    flat = lc.flatten(
        window_length=window_length, polyorder=2, break_tolerance=5, mask=in_transit
    )

    provenance = dict(bundle.provenance)
    provenance.update(
        {
            "detrending": "Savitzky-Golay high-pass, transits masked",
            "detrend_window_cadences": window_length,
            "n_masked_in_transit": int(in_transit.sum()),
        }
    )

    return LightCurveBundle(
        time=np.asarray(flat.time.value, dtype=float),
        flux=np.asarray(flat.flux.value, dtype=float),
        flux_err=np.asarray(flat.flux_err.value, dtype=float),
        cadence_minutes=bundle.cadence_minutes,
        provenance=provenance,
    )
