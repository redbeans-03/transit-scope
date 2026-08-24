"""Command line entry point: write the dashboard's JSON payload."""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

from .pipeline import run_pipeline

DEFAULT_OUTPUT = (
    Path(__file__).resolve().parents[3] / "public" / "data" / "exoplanet_data.json"
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="kepler8-extract",
        description=(
            "Download Kepler photometry from MAST, measure the transit of "
            "Kepler-8b with a quadratic limb darkening correction, and write "
            "the dashboard payload."
        ),
    )
    parser.add_argument(
        "--target", default="Kepler-8", help="target resolvable by MAST"
    )
    parser.add_argument(
        "--quarters",
        type=int,
        default=8,
        help="number of Kepler quarters to stitch (0 for all available)",
    )
    parser.add_argument(
        "--offline",
        action="store_true",
        help="skip the archive and simulate the light curve instead",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"output JSON path (default: {DEFAULT_OUTPUT})",
    )
    parser.add_argument(
        "--indent",
        type=int,
        default=None,
        help="pretty-print the JSON with this indent (default: compact)",
    )
    parser.add_argument("-v", "--verbose", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(
        level=logging.INFO if args.verbose else logging.WARNING,
        format="%(levelname)s %(message)s",
        stream=sys.stderr,
    )

    payload = run_pipeline(
        target=args.target,
        max_quarters=None if args.quarters == 0 else args.quarters,
        offline=args.offline,
    )

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, indent=args.indent), encoding="utf-8")

    depth = payload["depth"]
    radius = payload["radius"]["limb_darkening_corrected"]
    print(
        f"{payload['provenance']['data_source']}: "
        f"depth = {depth['depth_percent']:.4f}% "
        f"({depth['depth_ppm']:.0f} +/- {depth['depth_err_ppm']:.0f} ppm), "
        f"Rp/R* = {radius['ratio']:.5f}, "
        f"Rp = {radius['radius_jupiter']:.3f} R_Jup "
        f"({radius['radius_earth']:.1f} R_Earth), "
        f"SNR = {payload['snr']['snr']:.0f}"
    )
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
