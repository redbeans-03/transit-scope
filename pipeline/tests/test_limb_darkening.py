import numpy as np
import pytest

from kepler8.limb_darkening import (
    central_depth,
    corrected_radius_ratio,
    disk_integrated_intensity,
    geometric_radius_ratio,
    limb_darkening_correction,
    occulted_flux_fraction,
    quadratic_intensity,
    transit_light_curve,
)

U1, U2 = 0.39, 0.26


def test_intensity_is_unity_at_disk_centre():
    assert quadratic_intensity(1.0, U1, U2) == pytest.approx(1.0)


def test_intensity_falls_towards_the_limb():
    mu = np.linspace(0.0, 1.0, 50)
    intensity = quadratic_intensity(mu, U1, U2)
    assert np.all(np.diff(intensity) > 0)
    assert intensity[0] == pytest.approx(1.0 - U1 - U2)


def test_disk_integral_matches_analytic_form():
    # Numerically integrate I(r) 2 pi r dr and compare with pi(1 - u1/3 - u2/6).
    r = np.linspace(0.0, 1.0, 200_001)
    mu = np.sqrt(np.clip(1.0 - r**2, 0.0, 1.0))
    numeric = np.trapezoid(quadratic_intensity(mu, U1, U2) * 2.0 * np.pi * r, r)
    assert numeric == pytest.approx(disk_integrated_intensity(U1, U2), rel=1e-4)


def test_uniform_disk_occultation_is_the_area_ratio():
    # With u1 = u2 = 0 a central occultation must block exactly k^2.
    k = 0.1
    blocked = occulted_flux_fraction([0.0], k, 0.0, 0.0)[0]
    assert blocked == pytest.approx(k**2, rel=1e-4)


def test_no_occultation_outside_the_disk():
    assert occulted_flux_fraction([1.5], 0.1, U1, U2)[0] == 0.0


def test_limb_darkening_deepens_a_central_transit():
    # The centre of a limb-darkened disk is brighter than the disk average, so
    # a central transit removes more than k^2 of the total flux.
    k = 0.1
    assert central_depth(k, U1, U2) > k**2


def test_correction_factor_matches_the_published_expression():
    assert limb_darkening_correction(U1, U2) == pytest.approx(1.0 - 0.2 * (0.39 + 0.52))


def test_corrected_ratio_exceeds_geometric_ratio():
    depth = 0.0095
    assert corrected_radius_ratio(depth, U1, U2) > geometric_radius_ratio(depth)


def test_corrected_ratio_inverts_the_formula():
    depth = 0.0095
    k = corrected_radius_ratio(depth, U1, U2)
    assert k**2 * limb_darkening_correction(U1, U2) == pytest.approx(depth)


def test_negative_depth_is_rejected():
    with pytest.raises(ValueError):
        corrected_radius_ratio(-1e-3, U1, U2)


def test_transit_light_curve_shape():
    period = 3.5224991
    t = np.linspace(-0.2, 0.2, 401)
    flux = transit_light_curve(
        t,
        period=period,
        t0=0.0,
        k=0.098,
        a_over_rstar=6.97,
        impact_parameter=0.724,
        u1=U1,
        u2=U2,
    )
    assert flux.max() == pytest.approx(1.0)
    assert flux.argmin() == pytest.approx(200, abs=1)  # deepest at mid-transit
    assert 0.008 < 1.0 - flux.min() < 0.012  # roughly a 1% transit
    # Symmetric about mid-transit.
    assert flux[:200] == pytest.approx(flux[-200:][::-1], abs=1e-9)


def test_no_secondary_eclipse_signal():
    period = 3.5
    flux = transit_light_curve(
        [period / 2.0],
        period=period,
        t0=0.0,
        k=0.1,
        a_over_rstar=7.0,
        impact_parameter=0.5,
        u1=U1,
        u2=U2,
    )
    assert flux[0] == pytest.approx(1.0)
