import numpy as np
import pytest

from kepler8.photometry import (
    bin_folded,
    cdpp_from_residuals,
    count_transits,
    fold_phase,
    measure_depth,
    robust_scatter,
    transit_snr,
)

PERIOD = 3.5224991
T0 = 121.11786
DURATION = 0.1331


def _boxcar_light_curve(depth=0.0095, noise_ppm=0.0, n_days=100.0, seed=7):
    rng = np.random.default_rng(seed)
    time = np.arange(0.0, n_days, 29.4 / (24 * 60)) + T0
    phase = fold_phase(time, PERIOD, T0)
    flux = np.where(np.abs(phase) <= 0.5 * DURATION, 1.0 - depth, 1.0)
    if noise_ppm:
        flux = flux + rng.normal(0.0, noise_ppm * 1e-6, size=flux.size)
    return time, phase, flux


def test_fold_phase_is_centred_and_wrapped():
    time = np.array([T0, T0 + PERIOD, T0 + 2 * PERIOD, T0 + 0.5 * PERIOD])
    phase = fold_phase(time, PERIOD, T0)
    assert phase[:3] == pytest.approx(0.0, abs=1e-9)
    assert abs(phase[3]) == pytest.approx(0.5 * PERIOD, abs=1e-9)
    assert np.all(np.abs(phase) <= 0.5 * PERIOD + 1e-12)


def test_measure_depth_recovers_a_noiseless_box():
    _, phase, flux = _boxcar_light_curve(depth=0.0095)
    result = measure_depth(phase, flux, DURATION)
    assert result.depth == pytest.approx(0.0095, rel=1e-6)
    assert result.baseline == pytest.approx(1.0, abs=1e-9)


def test_measure_depth_is_unbiased_with_noise():
    _, phase, flux = _boxcar_light_curve(depth=0.0095, noise_ppm=250.0, n_days=400.0)
    result = measure_depth(phase, flux, DURATION)
    assert result.depth == pytest.approx(0.0095, abs=5.0 * result.depth_err)
    assert result.depth_err > 0.0


def test_measure_depth_rejects_an_empty_transit_window():
    # Every cadence sits outside the transit core: there is nothing to measure.
    phase = np.linspace(0.5, 1.0, 500)
    with pytest.raises(ValueError):
        measure_depth(phase, np.ones_like(phase), DURATION)


def test_measure_depth_survives_a_linear_trend():
    # A slow trend must not leak into the depth, because the baseline is taken
    # locally on both sides of the transit.
    time, phase, flux = _boxcar_light_curve(depth=0.0095)
    flux = flux * (1.0 + 1e-4 * (time - time[0]) / 10.0)
    result = measure_depth(phase, flux / np.median(flux), DURATION)
    assert result.depth == pytest.approx(0.0095, rel=0.02)


def test_robust_scatter_matches_gaussian_sigma():
    rng = np.random.default_rng(3)
    sample = rng.normal(0.0, 1e-3, size=200_000)
    assert robust_scatter(sample) == pytest.approx(1e-3, rel=0.02)


def test_robust_scatter_ignores_outliers():
    sample = np.concatenate([np.random.default_rng(1).normal(0, 1e-3, 10_000), [5.0]])
    assert robust_scatter(sample) == pytest.approx(1e-3, rel=0.05)


def test_cdpp_from_white_noise():
    rng = np.random.default_rng(11)
    flux = 1.0 + rng.normal(0.0, 300e-6, size=50_000)
    assert cdpp_from_residuals(flux) == pytest.approx(300.0, rel=0.03)


def test_count_transits_counts_epochs_not_cadences():
    time, _, _ = _boxcar_light_curve(n_days=100.0)
    expected = int(100.0 / PERIOD)
    assert count_transits(time, PERIOD, T0, DURATION) in {expected, expected + 1}


def test_transit_snr_scales_with_root_n():
    single = transit_snr(0.0095, 250.0, 1, 8)
    hundred = transit_snr(0.0095, 250.0, 100, 8)
    assert hundred / single == pytest.approx(10.0)


def test_transit_snr_matches_the_published_formula():
    depth, cdpp, n_tr, n_pts = 0.0095, 250.0, 264, 8
    expected = (depth / (cdpp * 1e-6)) * np.sqrt(n_tr * n_pts)
    assert transit_snr(depth, cdpp, n_tr, n_pts) == pytest.approx(expected)


def test_transit_snr_rejects_zero_noise():
    with pytest.raises(ValueError):
        transit_snr(0.0095, 0.0, 10, 10)


def test_bin_folded_preserves_the_mean_and_narrows_the_error():
    rng = np.random.default_rng(5)
    phase = rng.uniform(-0.2, 0.2, 20_000)
    flux = 1.0 + rng.normal(0.0, 250e-6, size=phase.size)
    centres, means, errors, counts = bin_folded(
        phase, flux, n_bins=40, phase_range=(-0.2, 0.2)
    )
    assert centres.size == 40
    assert np.all(counts > 0)
    assert means.mean() == pytest.approx(1.0, abs=1e-5)
    assert errors.mean() < 250e-6
