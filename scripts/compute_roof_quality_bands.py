"""
One-time computation of the roof-quality band thresholds shown on
building popups (UX pass commit 4). Not a new metric: kwh_kwp already
exists in every data/roofs/<slug>.json file, it is the cadastre's own
capacity-weighted specific yield, bundling orientation, tilt, shading and
local irradiance, exactly why SCOPE.md ruled out separate filters for
those factors.

Three bands, absolute thresholds, not quantiles: a quantile band would
make an average roof in a weak district look "excellent" and a strong
roof in a strong district look merely "good", so the word would mean a
different roof quality depending on which district you clicked, the
opposite of what "Roof quality: Good" is supposed to communicate.

Thresholds are set ONCE here, from the real citywide distribution across
all 48,475 qualifying buildings, then hardcoded (common.py and app.js).
Re-run only if the underlying roof data changes (a data change, not a
presentation change); do not "rebalance" the bands to make some future
district's colours look nicer.

Run: python3 scripts/compute_roof_quality_bands.py
Requires scripts/build_roofs.py to have been run first.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (  # noqa: E402
    BASE, ROOF_QUALITY_FAIR_GOOD_KWH_KWP, ROOF_QUALITY_GOOD_EXCELLENT_KWH_KWP,
)

ROOFS_DIR = BASE / "data" / "roofs"

# Chosen once from the citywide terciles (about 727 / 835 kWh/kWp),
# rounded to clean numbers and recorded in common.py. Verified below to
# still produce a roughly even three-way split (35% / 30% / 35%).
FAIR_GOOD_THRESHOLD = ROOF_QUALITY_FAIR_GOOD_KWH_KWP
GOOD_EXCELLENT_THRESHOLD = ROOF_QUALITY_GOOD_EXCELLENT_KWH_KWP


def main():
    values = []
    for path in sorted(ROOFS_DIR.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        values.extend(f["properties"]["kwh_kwp"] for f in data["features"])

    values.sort()
    n = len(values)
    print(f"Buildings: {n:,}")
    print(f"Range: {values[0]:.1f} to {values[-1]:.1f} kWh/kWp")
    print(f"Median: {values[n // 2]:.1f} kWh/kWp")
    for p in (33, 50, 66):
        print(f"  p{p}: {values[int(n * p / 100)]:.1f} kWh/kWp")

    fair = sum(1 for v in values if v < FAIR_GOOD_THRESHOLD)
    good = sum(1 for v in values if FAIR_GOOD_THRESHOLD <= v < GOOD_EXCELLENT_THRESHOLD)
    excellent = n - fair - good

    print(f"\nThresholds: Fair < {FAIR_GOOD_THRESHOLD:.0f} <= Good < "
          f"{GOOD_EXCELLENT_THRESHOLD:.0f} <= Excellent")
    print(f"Fair:      {fair:,} ({fair / n * 100:.1f}%)")
    print(f"Good:      {good:,} ({good / n * 100:.1f}%)")
    print(f"Excellent: {excellent:,} ({excellent / n * 100:.1f}%)")


if __name__ == "__main__":
    main()
