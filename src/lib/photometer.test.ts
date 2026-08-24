import { describe, expect, it } from "vitest";

import {
  analyseStream,
  findDips,
  median,
  parseSerialLine,
  percentile,
  radiusRatioFromDepth,
  robustScatter,
  type Sample,
} from "./photometer";

const U1 = 0.39;
const U2 = 0.26;

/** A 10 Hz lux stream with a periodic dip, mimicking the bead photometer. */
function beadStream({
  baseline = 118,
  depth = 0.0256,
  periodMs = 6000,
  transitMs = 700,
  durationMs = 30_000,
  noise = 0,
}: Partial<{
  baseline: number;
  depth: number;
  periodMs: number;
  transitMs: number;
  durationMs: number;
  noise: number;
}> = {}): Sample[] {
  const samples: Sample[] = [];
  for (let t = 0; t <= durationMs; t += 100) {
    const phase = t % periodMs;
    const inTransit = phase < transitMs;
    const jitter = noise ? (Math.sin(t * 12.9898) * 43758.5453) % noise : 0;
    samples.push({
      t,
      lux: baseline * (inTransit ? 1 - depth : 1) + jitter,
    });
  }
  return samples;
}

describe("percentile", () => {
  it("interpolates between neighbouring values", () => {
    expect(percentile([0, 10], 0.5)).toBeCloseTo(5);
  });

  it("returns the extremes at 0 and 1", () => {
    const values = [4, 1, 9, 3];
    expect(percentile(values, 0)).toBe(1);
    expect(percentile(values, 1)).toBe(9);
  });

  it("is NaN for an empty sample", () => {
    expect(percentile([], 0.5)).toBeNaN();
  });
});

describe("median and robustScatter", () => {
  it("ignores a wild outlier", () => {
    expect(median([1, 1, 1, 1, 500])).toBe(1);
    expect(robustScatter([10, 10, 10, 10, 9999])).toBe(0);
  });

  it("recovers a known spread", () => {
    // Symmetric ±2 about 10: MAD is 2, scaled by 1.4826.
    expect(robustScatter([8, 8, 10, 12, 12])).toBeCloseTo(2 * 1.4826, 3);
  });
});

describe("findDips", () => {
  it("finds one run per transit", () => {
    // 30 s of stream at a 6 s period: five complete dips, plus a final
    // single-sample clip at t = 30 s that is too short to count.
    const samples = beadStream();
    const dips = findDips(samples, 118 * 0.99);
    expect(dips).toHaveLength(5);
    expect(dips[1].midMs - dips[0].midMs).toBeCloseTo(6000, -2);
  });

  it("rejects single-sample spikes as sensor noise", () => {
    const samples: Sample[] = [
      { t: 0, lux: 100 },
      { t: 100, lux: 40 },
      { t: 200, lux: 100 },
    ];
    expect(findDips(samples, 90)).toHaveLength(0);
  });

  it("returns nothing when the light never dips", () => {
    expect(findDips(beadStream({ depth: 0 }), 1)).toHaveLength(0);
  });
});

describe("radiusRatioFromDepth", () => {
  it("matches the published correction", () => {
    const depth = 0.0095;
    const expected = Math.sqrt(depth) / Math.sqrt(1 - 0.2 * (U1 + 2 * U2));
    expect(radiusRatioFromDepth(depth, U1, U2)).toBeCloseTo(expected, 12);
  });

  it("exceeds the uniform-disk ratio", () => {
    expect(radiusRatioFromDepth(0.0095, U1, U2)).toBeGreaterThan(
      Math.sqrt(0.0095),
    );
  });

  it("is zero for a non-detection", () => {
    expect(radiusRatioFromDepth(0, U1, U2)).toBe(0);
    expect(radiusRatioFromDepth(-0.1, U1, U2)).toBe(0);
  });
});

describe("analyseStream", () => {
  it("needs a minimum number of samples", () => {
    expect(analyseStream(beadStream({ durationMs: 500 }))).toBeNull();
  });

  it("recovers depth, period and duration of a clean stream", () => {
    const analysis = analyseStream(beadStream(), { u1: U1, u2: U2 });
    expect(analysis).not.toBeNull();
    expect(analysis!.depthPercent).toBeCloseTo(2.56, 1);
    expect(analysis!.baselineLux).toBeCloseTo(118, 1);
    expect(analysis!.periodSeconds).toBeCloseTo(6, 1);
    // A 700 ms transit sampled at 10 Hz spans t = 0 to 600 ms.
    expect(analysis!.durationSeconds).toBeCloseTo(0.6, 1);
    // sqrt(0.0256 / 0.818) = 0.177
    expect(analysis!.radiusRatio).toBeCloseTo(0.177, 2);
  });

  it("reports no transits for a steady light source", () => {
    const analysis = analyseStream(beadStream({ depth: 0 }), {
      u1: U1,
      u2: U2,
    });
    expect(analysis!.dips).toHaveLength(0);
    expect(analysis!.periodSeconds).toBeNull();
    expect(analysis!.depth).toBeCloseTo(0, 3);
  });

  it("is not fooled by a stream that is mostly in transit", () => {
    // The baseline is the 90th percentile, so it survives even when the bead
    // covers the sensor for most of the window.
    const samples = beadStream({ periodMs: 1000, transitMs: 700 });
    const analysis = analyseStream(samples, { u1: U1, u2: U2 });
    expect(analysis!.baselineLux).toBeCloseTo(118, 0);
  });
});

describe("parseSerialLine", () => {
  it("reads the firmware's JSON frames", () => {
    expect(parseSerialLine('{"t":1043,"lux":118.25,"seq":104}')).toBe(118.25);
  });

  it("accepts a bare number", () => {
    expect(parseSerialLine("  99.5 ")).toBe(99.5);
  });

  it("ignores partial frames, blanks and error lines", () => {
    expect(parseSerialLine('{"t":1043,"lu')).toBeNull();
    expect(parseSerialLine("")).toBeNull();
    expect(parseSerialLine('{"error":"BH1750 not found on I2C"}')).toBeNull();
    expect(parseSerialLine("ready")).toBeNull();
  });
});
