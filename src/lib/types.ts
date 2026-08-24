/**
 * Shape of `public/data/exoplanet_data.json`, written by the Python pipeline
 * (`pipeline/src/kepler8/pipeline.py`). Keep the two in step.
 */

export type DataSource = "mast" | "synthetic";

export interface Provenance {
  data_source: DataSource;
  mission: string;
  author?: string;
  cadence: string;
  cadence_minutes: number;
  target: string;
  object: string;
  quarters?: number[];
  n_files: number;
  n_cadences: number;
  baseline_days: number;
  time_format: string;
  lightkurve_version?: string;
  quality_bitmask?: string;
  detrending?: string;
  detrend_window_cadences?: number;
  n_masked_in_transit?: number;
  note?: string;
  fallback_reason?: string;
  injected_truth?: {
    radius_ratio: number;
    period_days: number;
    t0_bkjd: number;
    noise_ppm: number;
  };
}

export interface StarParameters {
  name: string;
  kic: string;
  kepler_magnitude: number;
  radius_rsun: number;
  mass_msun: number;
  teff_k: number;
  logg_cgs: number;
  metallicity_dex: number;
  u1: number;
  u2: number;
  radius_m: number;
}

export interface LimbDarkening {
  u1: number;
  u2: number;
  correction_factor: number;
  law: string;
  profile: { mu: number[]; intensity: number[] };
}

export interface EphemerisResult {
  period_days: number;
  t0_bkjd: number;
  duration_hours: number;
  duration_hours_bls_box: number;
  literature_duration_hours: number;
  n_transits_observed: number;
  bls_peak_power: number;
  literature_period_days: number;
  period_offset_seconds: number;
}

export interface DepthResult {
  depth: number;
  depth_ppm: number;
  depth_percent: number;
  depth_err_ppm: number;
  max_depth_ppm: number;
  baseline_flux: number;
  n_core_cadences: number;
  n_baseline_cadences: number;
  core_fraction: number;
}

export interface RadiusEstimate {
  ratio: number;
  radius_km: number;
  radius_jupiter: number;
  radius_earth: number;
  reference?: string;
}

export interface RadiusResult {
  geometric: RadiusEstimate;
  limb_darkening_corrected: RadiusEstimate;
  model_fit: RadiusEstimate;
  literature: RadiusEstimate;
  correction_gain_percent: number;
}

export interface FitResult {
  radius_ratio: number;
  a_over_rstar: number;
  impact_parameter: number;
  inclination_deg: number;
  model_depth: number;
  rms_residual_ppm: number;
  reduced_chi_square: number;
  n_free_parameters: number;
  a_over_rstar_source: string;
  converged: boolean;
  literature_a_over_rstar: number;
  literature_impact_parameter: number;
  literature_inclination_deg: number;
}

export interface SnrResult {
  cdpp_ppm: number;
  n_transits: number;
  n_points_per_transit: number;
  snr: number;
  snr_single_transit: number;
  detection_threshold: number;
}

export interface SeriesData {
  raw: { time: number[]; flux: number[]; binned_from: number };
  segment: { time: number[]; flux: number[] };
  folded: { phase_hours: number[]; flux: number[] };
  binned: {
    phase_hours: number[];
    flux: number[];
    err: number[];
    counts: number[];
  };
  model: { phase_hours: number[]; flux: number[] };
  periodogram: { period_days: number[]; power: number[] };
}

export interface ReferenceValues {
  key: string;
  label: string;
  detail: string;
  url: string;
  period_days: number;
  t0_bkjd: number;
  radius_ratio: number;
  radius_jupiter: number;
  radius_earth: number;
  a_over_rstar: number;
  impact_parameter: number;
  inclination_deg: number;
  depth_ppm: number | null;
  duration_hours: number | null;
  period_offset_seconds: number;
}

export interface TransitEpoch {
  epoch: number;
  mid_time_bkjd: number;
  n_points: number;
  depth_ppm: number;
}

export interface ExoplanetPayload {
  schema_version: number;
  generated_at: string;
  pipeline_version: string;
  provenance: Provenance;
  star: StarParameters;
  limb_darkening: LimbDarkening;
  ephemeris: EphemerisResult;
  depth: DepthResult;
  radius: RadiusResult;
  fit: FitResult;
  snr: SnrResult;
  series: SeriesData;
  references: ReferenceValues[];
  transits: TransitEpoch[];
}
