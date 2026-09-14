"""
The battery case: how much of the day's midday generation a 1.5 kWh/kWp
battery could shift into the evening, on both the matched normal day and
the heatwave day, at every build-out level.

No demand curve is used or invented; there is no hourly consumption data
for Duesseldorf, and SCOPE.md rules that out explicitly. This is a
generation-side accounting only: how much energy arrives at midday, how
little arrives by evening, and how much of that gap a battery this size
could close by moving midday's surplus later in the day.

Hour windows (MIDDAY_HOURS, EVENING_HOURS) live in common.py, a stated
modelling convention, not a sourced figure, mirrored in app.js for the
chart shading.

Battery capacity at each build-out level scales from
data/stadtteile.json's own battery_potential_kwh (total_kwp x 1.5
kWh/kWp, the HTW Berlin sizing already used elsewhere on the page), the
same uniform build-out scaling build_generation.py and build_coverage.py
use. No round-trip efficiency loss is modelled; this is a capacity limit
only, a simplification stated on the page.

Run: python3 scripts/build_battery.py
Requires scripts/build_generation.py to have been run first.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (  # noqa: E402
    BASE, BATTERY_KWH_PER_KWP, MIDDAY_HOURS, EVENING_HOURS,
)

GENERATION_PATH = BASE / "data" / "generation_scenarios.json"
STADTTEILE_PATH = BASE / "data" / "stadtteile.json"
OUT_PATH = BASE / "data" / "battery_case.json"

BUILDOUT_LEVELS = [11.6, 30.0, 50.0, 100.0]


def main():
    generation = json.loads(GENERATION_PATH.read_text(encoding="utf-8"))
    stadtteile = json.loads(STADTTEILE_PATH.read_text(encoding="utf-8"))

    battery_kwh_100pct = sum(
        f["properties"]["battery_potential_kwh"] for f in stadtteile["features"]
    )

    citywide = {}
    for day_type in ("normal", "heatwave"):
        for pct in BUILDOUT_LEVELS:
            scenario = generation["citywide"][f"{day_type}_{pct}"]
            hourly = scenario["hourly_derated_kwh"]

            midday_kwh = sum(hourly[h] for h in MIDDAY_HOURS)
            evening_kwh = sum(hourly[h] for h in EVENING_HOURS)
            battery_kwh = battery_kwh_100pct * (pct / 100.0)
            shiftable_kwh = min(battery_kwh, midday_kwh)
            evening_with_battery_kwh = evening_kwh + shiftable_kwh

            citywide[f"{day_type}_{pct}"] = {
                "day": scenario["day"],
                "midday_kwh": round(midday_kwh, 1),
                "evening_kwh": round(evening_kwh, 1),
                "battery_kwh": round(battery_kwh, 1),
                "shiftable_kwh": round(shiftable_kwh, 1),
                "shiftable_pct_of_midday": round(shiftable_kwh / midday_kwh * 100, 1) if midday_kwh else 0.0,
                "evening_with_battery_kwh": round(evening_with_battery_kwh, 1),
                "evening_multiple": round(evening_with_battery_kwh / evening_kwh, 2) if evening_kwh else None,
            }

    out = {
        "midday_hours": MIDDAY_HOURS,
        "evening_hours": EVENING_HOURS,
        "battery_kwh_per_kwp": BATTERY_KWH_PER_KWP,
        "citywide": citywide,
    }
    OUT_PATH.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(f"Saved: {OUT_PATH}")

    print("\n--- Battery case, today's build-out (11.6%) ---")
    for day_type in ("normal", "heatwave"):
        c = citywide[f"{day_type}_11.6"]
        print(f"\n{day_type} ({c['day']}):")
        print(f"  Midday (11:00-15:59) generation: {c['midday_kwh']:,.0f} kWh")
        print(f"  Evening (18:00-21:59) generation: {c['evening_kwh']:,.0f} kWh")
        print(f"  Battery capacity (1.5 kWh/kWp): {c['battery_kwh']:,.0f} kWh")
        print(f"  Shiftable: {c['shiftable_kwh']:,.0f} kWh "
              f"({c['shiftable_pct_of_midday']:.0f}% of midday generation)")
        print(f"  Evening with battery: {c['evening_with_battery_kwh']:,.0f} kWh "
              f"({c['evening_multiple']:.2f}x evening's own generation)")

    print("\n--- Shiftable share of midday generation, across build-out levels (normal day) ---")
    for pct in BUILDOUT_LEVELS:
        c = citywide[f"normal_{pct}"]
        print(f"  {pct}%: {c['shiftable_pct_of_midday']:.1f}%")


if __name__ == "__main__":
    main()
