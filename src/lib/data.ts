import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ExoplanetPayload } from "./types";

export const DATA_PATH = "public/data/exoplanet_data.json";
export const EXPECTED_SCHEMA_VERSION = 2;

export type LoadResult =
  | { status: "ok"; payload: ExoplanetPayload }
  | { status: "missing" }
  | { status: "error"; message: string };

/**
 * Read the payload written by the Python pipeline. A missing file is a normal
 * state (nobody has run the extraction yet), so it is reported separately from
 * a genuine parse failure.
 */
export async function loadPayload(): Promise<LoadResult> {
  const file = path.join(process.cwd(), DATA_PATH);
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { status: "missing" };
    return { status: "error", message: `Could not read ${DATA_PATH}: ${code}` };
  }

  try {
    const payload = JSON.parse(raw) as ExoplanetPayload;
    if (payload.schema_version !== EXPECTED_SCHEMA_VERSION) {
      return {
        status: "error",
        message:
          `${DATA_PATH} is schema version ${payload.schema_version}, but this ` +
          `dashboard expects version ${EXPECTED_SCHEMA_VERSION}. Re-run the ` +
          `extraction pipeline to regenerate it.`,
      };
    }
    return { status: "ok", payload };
  } catch {
    return {
      status: "error",
      message: `${DATA_PATH} is not valid JSON. Re-run the extraction pipeline.`,
    };
  }
}
