"""
Annual generation at each build-out level against the city's own annual
electricity consumption. This produces the single most important sentence
on the page: at full build-out, what share of the city's own electricity
use could rooftop solar alone cover.

Generation at 100% build-out is the Solarkataster cadastre's own annual
total (data/stadtteile.json, total_mwh summed across all 50 Stadtteile),
already sourced and validated elsewhere on the page. Other build-out
levels scale that uniformly, the same simplification build_generation.py
uses for the heatwave comparison: build-out below 100% is modelled as a
uniform scaling of the whole city's output, not a choice of which specific
roofs get built first.

Consumption is Duesseldorf's own Energie- und Treibhausgasbilanz 2022, one
official annual figure, see common.py for the exact citation and the
sector sum. This is a single city-wide figure with no geography or hourly
shape; nothing here is projected, derived, or modelled beyond it.

Run: python3 scripts/build_coverage.py
Requires data/stadtteile.json to already exist.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (  # noqa: E402
    BASE, CITY_ELECTRICITY_CONSUMPTION_GWH, CITY_ELECTRICITY_CONSUMPTION_YEAR,
)

STADTTEILE_PATH = BASE / "data" / "stadtteile.json"
OUT_PATH = BASE / "data" / "coverage.json"

BUILDOUT_LEVELS = [11.6, 30.0, 50.0, 100.0]
BUILDOUT_LABELS = {11.6: "12%", 30.0: "30%", 50.0: "50%", 100.0: "100%"}


def main():
    stadtteile = json.loads(STADTTEILE_PATH.read_text(encoding="utf-8"))
    annual_mwh_100pct = sum(
        f["properties"]["total_mwh"] for f in stadtteile["features"]
    )
    annual_gwh_100pct = annual_mwh_100pct / 1000.0

    levels = []
    for pct in BUILDOUT_LEVELS:
        gwh = annual_gwh_100pct * (pct / 100.0)
        coverage_pct = gwh / CITY_ELECTRICITY_CONSUMPTION_GWH * 100.0
        levels.append({
            "buildout_pct": pct,
            "buildout_label": BUILDOUT_LABELS[pct],
            "annual_gwh": round(gwh, 1),
            "coverage_pct": round(coverage_pct, 1),
        })

    out = {
        "annual_gwh_100pct": round(annual_gwh_100pct, 1),
        "city_consumption_gwh": CITY_ELECTRICITY_CONSUMPTION_GWH,
        "city_consumption_year": CITY_ELECTRICITY_CONSUMPTION_YEAR,
        "levels": levels,
    }
    OUT_PATH.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(f"Saved: {OUT_PATH}")

    print(f"\nAnnual generation at 100% build-out: {annual_gwh_100pct:,.1f} GWh")
    print(f"Duesseldorf's own electricity consumption ({CITY_ELECTRICITY_CONSUMPTION_YEAR}): "
          f"{CITY_ELECTRICITY_CONSUMPTION_GWH:,.1f} GWh")
    print("\n--- Coverage at every build-out level ---")
    for lvl in levels:
        print(f"{lvl['buildout_label']:>5} build-out: {lvl['annual_gwh']:>9,.1f} GWh/year, "
              f"{lvl['coverage_pct']:.1f}% of city consumption")

    full = levels[-1]
    print(f"\nHeadline: Duesseldorf's rooftops could generate {full['annual_gwh']:,.0f} GWh a year, "
          f"the city uses {CITY_ELECTRICITY_CONSUMPTION_GWH:,.0f} GWh "
          f"({CITY_ELECTRICITY_CONSUMPTION_YEAR}), so at full build-out rooftop solar alone "
          f"would cover {full['coverage_pct']:.0f}% of it.")


if __name__ == "__main__":
    main()
