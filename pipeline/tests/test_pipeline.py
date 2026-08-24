"""End-to-end test: run the pipeline offline against an injected signal."""

import numpy as np
import pytest

from kepler8.constants import KEPLER_8, KEPLER_8B, LITERATURE_PLANET
from kepler8.geometry import (
    impact_parameter_from_inclination,
    scaled_semimajor_axis,
    transit_duration_days,
)
from kepler8.pipeline import radius_breakdown, run_pipeline


@pytest.fixture(scope="module")
def payload():
    return run_pipeline(target="Kepler-8", max_quarters=4, offline=True)


def test_stellar_density_predicts_the_published_orbit():
    a_over_rstar = scaled_semimajor_axis(
        KEPLER_8B.period_days, KEPLER_8.mass_msun, KEPLER_8.radius_rsun
    )
    assert a_over_rstar == pytest.approx(
        LITERATURE_PLANET["semimajor_axis_over_rstar"], rel=0.02
    )


def test_impact_parameter_and_inclination_are_consistent():
    b = impact_parameter_from_inclination(
        LITERATURE_PLANET["semimajor_axis_over_rstar"],
        LITERATURE_PLANET["inclination_deg"],
    )
    assert b == pytest.approx(LITERATURE_PLANET["impact_parameter"], rel=0.02)


def test_published_geometry_gives_a_three_hour_transit():
    duration = transit_duration_days(
        KEPLER_8B.period_days,
        LITERATURE_PLANET["radius_ratio"],
        LITERATURE_PLANET["semimajor_axis_over_rstar"],
        LITERATURE_PLANET["impact_parameter"],
    )
    assert duration * 24.0 == pytest.approx(3.2, abs=0.2)


def test_radius_breakdown_unit_conversions():
    result = radius_breakdown(LITERATURE_PLANET["radius_ratio"], KEPLER_8)
    assert result["radius_jupiter"] == pytest.approx(
        LITERATURE_PLANET["radius_jupiter"], rel=0.01
    )
    assert result["radius_earth"] == pytest.approx(
        result["radius_jupiter"] * 11.209, rel=0.01
    )


def test_pipeline_recovers_the_injected_period(payload):
    assert payload["ephemeris"]["period_days"] == pytest.approx(
        KEPLER_8B.period_days, abs=1e-3
    )
    assert abs(payload["ephemeris"]["period_offset_seconds"]) < 60.0


def test_pipeline_recovers_the_injected_radius_ratio(payload):
    # The model fit is the estimator that accounts for where on the disk the
    # planet crosses, so it should land within a percent of the truth.
    assert payload["fit"]["radius_ratio"] == pytest.approx(
        LITERATURE_PLANET["radius_ratio"], rel=0.02
    )
    assert payload["fit"]["converged"] is True


def test_pipeline_reports_a_one_percent_transit(payload):
    assert 0.7 < payload["depth"]["depth_percent"] < 1.1
    assert payload["depth"]["depth_err_ppm"] > 0.0


def test_pipeline_detects_the_transit_with_high_significance(payload):
    snr = payload["snr"]
    assert snr["snr"] > snr["detection_threshold"]
    assert snr["cdpp_ppm"] == pytest.approx(260.0, rel=0.15)


def test_pipeline_series_are_consistent_lengths(payload):
    series = payload["series"]
    for key in ("raw", "segment", "folded", "model", "periodogram"):
        block = series[key]
        lengths = {len(v) for v in block.values() if isinstance(v, list)}
        assert len(lengths) == 1, f"{key} arrays disagree in length"
        assert lengths.pop() > 0
    assert np.all(np.isfinite(series["model"]["flux"]))


def test_pipeline_payload_is_json_safe(payload):
    import json

    text = json.dumps(payload)
    assert "NaN" not in text and "Infinity" not in text
