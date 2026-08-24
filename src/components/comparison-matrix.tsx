import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fixed, integer } from "@/lib/format";
import type { ExoplanetPayload } from "@/lib/types";

export function ComparisonMatrix({ payload }: { payload: ExoplanetPayload }) {
  const { snr, depth, provenance, ephemeris } = payload;

  const rows = [
    {
      parameter: "Detector",
      satellite: "Kepler photometer, 42-CCD array, 0.95 m Schmidt telescope",
      hardware: "BH1750 ambient light sensor on I²C, 16-bit output",
    },
    {
      parameter: "Light source",
      satellite: `Kepler-8, a ${integer(
        payload.star.teff_k,
      )} K F-dwarf at Kp = ${fixed(payload.star.kepler_magnitude, 2)}`,
      hardware: "Constant-current high-CRI white LED",
    },
    {
      parameter: "Sampling",
      satellite: `${fixed(
        provenance.cadence_minutes,
        1,
      )} minute long cadence (${integer(provenance.n_cadences)} exposures)`,
      hardware: "100 ms (10 Hz), limited by the sensor's integration time",
    },
    {
      parameter: "Transit depth ΔF/F",
      satellite: `${fixed(depth.depth_percent, 3)}% measured (${fixed(
        depth.depth_ppm,
        0,
      )} ppm)`,
      hardware: "1–5%, set by the bead diameter — deliberately exaggerated",
    },
    {
      parameter: "Photometric precision",
      satellite: `${fixed(
        snr.cdpp_ppm,
        0,
      )} ppm per cadence (mission spec 10–30 ppm at 6.5 h for Kp = 12)`,
      hardware: "≈0.1 lux resolution, roughly 1000 ppm of a 118 lux baseline",
    },
    {
      parameter: "Dominant noise",
      satellite: "Stellar granulation and activity, spacecraft pointing jitter",
      hardware: "Room light leaking past the curtain, motor vibration, LED drift",
    },
    {
      parameter: "Orbital period",
      satellite: `${fixed(ephemeris.period_days, 6)} days, recovered by BLS`,
      hardware: "3–10 seconds, set by the motor speed",
    },
    {
      parameter: "Transits needed",
      satellite: `${integer(ephemeris.n_transits_observed)} stacked to reach ${integer(
        snr.snr,
      )}σ`,
      hardware: "1 — the signal is 30× the noise on a single pass",
    },
    {
      parameter: "Data path",
      satellite: "MAST archive → lightkurve → Python → JSON",
      hardware: "USB serial → Web Serial API → browser, no server involved",
    },
  ];

  return (
    <Card className="overflow-hidden p-0 py-0">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[22%] min-w-[10rem]">Parameter</TableHead>
                <TableHead className="w-[39%] min-w-[16rem]">
                  NASA Kepler mission data
                </TableHead>
                <TableHead className="w-[39%] min-w-[16rem]">
                  Desktop photometer
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.parameter}>
                  <TableCell className="align-top font-medium">
                    {row.parameter}
                  </TableCell>
                  <TableCell className="align-top text-muted-foreground">
                    {row.satellite}
                  </TableCell>
                  <TableCell className="align-top text-muted-foreground">
                    {row.hardware}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
