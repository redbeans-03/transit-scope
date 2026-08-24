"""Kepler-8b transit photometry pipeline.

Extracts a light curve from the NASA MAST archive, recovers the transit
ephemeris, measures the depth, applies the quadratic limb darkening correction
and reports the detection significance.
"""

__version__ = "0.1.0"

__all__ = ["__version__"]
