"""
The panel's top line, the direct answer to the page's own subtitle: at
full build-out, what share of the city's electricity would rooftop solar
cover, and how much less on the hottest days.

Not new data or a new model. Both numbers already exist and are already
verified elsewhere on the page:
  - full_buildout_coverage_pct is data/coverage.json's own 100% build-out
    level (build_coverage.py), the annual figure already stated in
    SCOPE.md section 4 as "the most important sentence on the site".
  - The heatwave day's share of the matched normal day's generation
    (already reported, and already shown to be the same ratio at every
    build-out level, since heatwave derate and build-out both scale
    generation linearly and independently) is applied to that coverage
    percentage. This does not model a heatwave-affected YEAR, a full
    heatwave-adjusted annual total is not something this project claims
    to know; it restates the day-level comparison already on the page as
    a percentage-of-consumption instead of a percentage-of-normal-day, so
    the panel's top line can answer in the same units both times.

The browser must not compute this itself (project rule: precompute
everything, the browser only ever selects a value), so it is precomputed
here into data/headline.json.

Run: python3 scripts/build_headline.py
Requires scripts/build_coverage.py and scripts/build_generation.py to have
been run first.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import BASE  # noqa: E402

COVERAGE_PATH = BASE / "data" / "coverage.json"
GENERATION_PATH = BASE / "data" / "generation_scenarios.json"
OUT_PATH = BASE / "data" / "headline.json"


def main():
    coverage = json.loads(COVERAGE_PATH.read_text(encoding="utf-8"))
    generation = json.loads(GENERATION_PATH.read_text(encoding="utf-8"))

    full = next(lvl for lvl in coverage["levels"] if lvl["buildout_pct"] == 100.0)
    normal_100 = generation["citywide"]["normal_100.0"]["total_derated_kwh"]
    heatwave_100 = generation["citywide"]["heatwave_100.0"]["total_derated_kwh"]
    day_ratio = heatwave_100 / normal_100

    full_pct = full["coverage_pct"]
    heatwave_pct = round(full_pct * day_ratio, 1)

    out = {
        "full_buildout_coverage_pct": full_pct,
        "heatwave_coverage_pct": heatwave_pct,
        "day_ratio": round(day_ratio, 4),
        "note": (
            "heatwave_coverage_pct = full_buildout_coverage_pct times the "
            "heatwave worst day's derated generation divided by the "
            "matched normal day's derated generation, both at 100% "
            "build-out. Restates the already-reported day-level "
            "derate comparison as a percentage of city consumption, does "
            "not model a heatwave-affected year."
        ),
    }
    OUT_PATH.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(f"Saved: {OUT_PATH}")
    print(f"At full build-out, rooftops would cover {full_pct}% of the city's electricity.")
    print(f"On the hottest days, that drops to {heatwave_pct}%.")


if __name__ == "__main__":
    main()
