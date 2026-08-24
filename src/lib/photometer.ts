/**
 * Analysis for the tabletop photometer stream: the same depth-to-radius chain
 * used on the satellite light curve, applied to lux readings at 10 Hz.
 */

export interface Sample {
  /** Milliseconds since the stream started. */
  t: number;
  lux: number;
}

export interface Dip {
  startMs: number;
  endMs: number;
  midMs: number;
  minLux: number;
}

export interface StreamAnalysis {
  baselineLux: number;
  depth: number;
  depthPercent: number;
  radiusRatio: number;
  dips: Dip[];
  periodSeconds: number | null;
  durationSeconds: number | null;
  noisePercent: number;
  snr: number | null;
}

/** Percentile of an unsorted array, linearly interpolated. */
export function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

export function median(values: number[]): number {
  return percentile(values, 0.5);
}

/** Median absolute deviation scaled to a Gaussian sigma. */
export function robustScatter(values: number[]): number {
  if (values.length < 2) return Number.NaN;
  const centre = median(values);
  return 1.4826 * median(values.map((value) => Math.abs(value - centre)));
}

/**
 * Contiguous runs that sit below a threshold, i.e. candidate transits. Runs
 * shorter than `minSamples` are dropped as sensor noise.
 */
export function findDips(
  samples: Sample[],
  threshold: number,
  minSamples = 3,
): Dip[] {
  const dips: Dip[] = [];
  let run: Sample[] = [];

  const flush = () => {
    if (run.length >= minSamples) {
      const first = run[0];
      const last = run[run.length - 1];
      dips.push({
        startMs: first.t,
        endMs: last.t,
        midMs: (first.t + last.t) / 2,
        minLux: Math.min(...run.map((sample) => sample.lux)),
      });
    }
    run = [];
  };

  for (const sample of samples) {
    if (sample.lux < threshold) run.push(sample);
    else flush();
  }
  flush();
  return dips;
}

/**
 * Radius ratio from a fractional depth, with the quadratic limb darkening
 * correction. Identical to the satellite formula: the LED source stands in for
 * the star, the bead for the planet.
 */
export function radiusRatioFromDepth(
  depth: number,
  u1: number,
  u2: number,
): number {
  if (!(depth > 0)) return 0;
  const correction = 1 - 0.2 * (u1 + 2 * u2);
  if (correction <= 0) return Number.NaN;
  return Math.sqrt(depth) / Math.sqrt(correction);
}

/**
 * Reduce a rolling window of lux samples to the same quantities the satellite
 * pipeline reports: baseline, depth, radius ratio, period and duration.
 *
 * The baseline is the 90th percentile rather than the mean, because up to a
 * fifth of the samples can be in transit and would drag a mean downwards.
 */
export function analyseStream(
  samples: Sample[],
  options: { u1: number; u2: number; minDepth?: number } = {
    u1: 0.39,
    u2: 0.26,
  },
): StreamAnalysis | null {
  if (samples.length < 20) return null;

  const lux = samples.map((sample) => sample.lux);
  const baselineLux = percentile(lux, 0.9);
  if (!(baselineLux > 0)) return null;

  const minDepth = options.minDepth ?? 0.004;
  const outOfTransit = lux.filter((value) => value > baselineLux * 0.98);
  const noise = robustScatter(outOfTransit.length > 5 ? outOfTransit : lux);
  const noisePercent = (noise / baselineLux) * 100;

  // Provisional depth from the faintest samples, then a threshold halfway down
  // the dip to isolate individual transits.
  const provisionalDepth = 1 - percentile(lux, 0.02) / baselineLux;
  const dips =
    provisionalDepth > minDepth
      ? findDips(samples, baselineLux * (1 - provisionalDepth / 2))
      : [];

  const inTransit = dips.flatMap((dip) =>
    samples
      .filter((sample) => sample.t >= dip.startMs && sample.t <= dip.endMs)
      .map((sample) => sample.lux),
  );
  const depth =
    inTransit.length > 0
      ? 1 - median(inTransit) / baselineLux
      : Math.max(provisionalDepth, 0);

  const midpoints = dips.map((dip) => dip.midMs);
  const gaps = midpoints
    .slice(1)
    .map((value, index) => (value - midpoints[index]) / 1000);
  const durations = dips.map((dip) => (dip.endMs - dip.startMs) / 1000);

  return {
    baselineLux,
    depth,
    depthPercent: depth * 100,
    radiusRatio: radiusRatioFromDepth(depth, options.u1, options.u2),
    dips,
    periodSeconds: gaps.length > 0 ? median(gaps) : null,
    durationSeconds: durations.length > 0 ? median(durations) : null,
    noisePercent,
    snr:
      noise > 0 && dips.length > 0
        ? ((depth * baselineLux) / noise) * Math.sqrt(inTransit.length)
        : null,
  };
}

/** Parse one line of firmware output: `{"lux":118.3}` or a bare number. */
export function parseSerialLine(line: string): number | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as { lux?: unknown };
      const value = Number(parsed.lux);
      return Number.isFinite(value) ? value : null;
    } catch {
      return null;
    }
  }
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}
