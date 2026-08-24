export function fixed(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function integer(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return Math.round(value).toLocaleString("en-US");
}

export function signed(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : "−"}${fixed(Math.abs(value), digits)}`;
}

/** Percentage difference of a measurement against a reference value. */
export function percentDifference(measured: number, reference: number): number {
  return (measured / reference - 1) * 100;
}

export function formatDuration(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h} h ${String(m).padStart(2, "0")} m`;
}

/** BKJD (BJD − 2454833) to a calendar date, for human-readable epochs. */
export function bkjdToDate(bkjd: number): string {
  const jd = bkjd + 2454833.0;
  const unixMs = (jd - 2440587.5) * 86400000;
  return new Date(unixMs).toISOString().slice(0, 10);
}

export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.toISOString().slice(0, 10)} ${date
    .toISOString()
    .slice(11, 16)} UTC`;
}
