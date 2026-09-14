"""
The spine: same rooftops, two conditions. Precompute hourly generation, on
the matched normal day and across the full heatwave window, rated and
derated, at every build-out level, per SCOPE.md section 4.

Generation model, so this does not become a second, conflicting absolute
generation figure alongside the Solarkataster's own cadastre-validated
annual yield (data/stadtteile.json, already sourced and on the page):

  1. For each Stadtteil, compute a scale factor so that integrating GTI(t)
     over the full 2025 hourly series, times that factor, reproduces
     exactly that Stadtteil's cadastre annual kWh at 100% build-out:
       scale = annual_kwh_100pct / sum(GTI_2025_hourly)
  2. Rated generation for any hour = GTI(t) * scale * (buildout_pct / 100).
     Build-out below 100% is modelled as a uniform scaling of the whole
     Stadtteil's output, not a choice of which specific roofs get built;
     which roofs would be first is not something this project claims to
     know, and the built-out control was never meant to be that precise.
  3. Cell temperature (NOCT model) and the derate then apply on top:
       T_cell = T_air + (NOCT - 20) / 800 * GTI
       derate = max(0, (T_cell - 25) * TEMP_COEFF), floored at zero
       derated = rated * (1 - derate)

This keeps the hourly shape grounded in real ERA5 weather while never
disagreeing with the cadastre's own annual total, which is still the
number everywhere else on the page.

Two day/period types are precomputed:
  - "normal": the matched normal day (2025-08-25), 24 hours.
  - "heatwave": the worst heatwave day (2026-06-26) for the hourly chart,
    plus the full 24-28 June window's daily totals for the multi-day
    figures (worst single day and window total are both reported;
    consecutive hot days compound, so the window total is not just the
    worst day times five).

Crossed with build-out levels (11.6%, the current measured realization
rate, rounded to 12% for display; 30%; 50%; 100%, required since the
project's premise is "every suitable rooftop carries solar"), that is 8
precomputed scenario combinations now, 16 once commit 5 adds AC surge.

Run: python3 scripts/build_generation.py
Requires scripts/fetch_era5.py and scripts/find_heatwave_window.py to have
been run first, and data/stadtteile.json to already exist.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (  # noqa: E402
    BASE, NOCT_C, TEMP_COEFF_PCT_PER_C, DERATE_REFERENCE_TEMP_C,
    HEATWAVE_WINDOW, HEATWAVE_WORST_DAY, MATCHED_NORMAL_DAY,
)

CHECKPOINT_PATH = BASE / "data" / "raw" / "era5_checkpoint.json"
STADTTEILE_PATH = BASE / "data" / "stadtteile.json"
OUT_PATH = BASE / "data" / "generation_scenarios.json"

# 11.6% is the current measured realization rate (SCOPE.md section 3),
# displayed on the page rounded to 12%. Kept as the precise value here so
# the precomputed figures match the header exactly.
BUILDOUT_LEVELS = [11.6, 30.0, 50.0, 100.0]
BUILDOUT_LABELS = {11.6: "12%", 30.0: "30%", 50.0: "50%", 100.0: "100%"}

TEMP_COEFF_FRACTION = TEMP_COEFF_PCT_PER_C / 100.0  # -0.35% -> -0.0035


def cell_temp(t_air, gti):
    return t_air + (NOCT_C - 20) / 800 * gti


def derate_fraction(t_air, gti):
    t_cell = cell_temp(t_air, gti)
    # TEMP_COEFF_FRACTION is negative; derate is a positive fraction lost.
    return max(0.0, (t_cell - DERATE_REFERENCE_TEMP_C) * -TEMP_COEFF_FRACTION)


def load_stadtteile():
    data = json.loads(STADTTEILE_PATH.read_text(encoding="utf-8"))
    return {f["properties"]["name"]: f["properties"] for f in data["features"]}


def hours_for_date(series, date_str):
    idx = [i for i, t in enumerate(series["time"]) if t.startswith(date_str)]
    return idx


def compute_day(series, scale, buildout_pct, idx):
    """Return hourly rated/derated kWh for the given hour indices."""
    rated = []
    derated = []
    for i in idx:
        gti = series["gti"][i]
        t_air = series["temp"][i]
        r = gti * scale * (buildout_pct / 100.0)
        d = r * (1 - derate_fraction(t_air, gti))
        rated.append(r)
        derated.append(d)
    return rated, derated


def main():
    checkpoint = json.loads(CHECKPOINT_PATH.read_text(encoding="utf-8"))
    stadtteile = load_stadtteile()

    from common import slugify
    stadtteil_names = list(stadtteile.keys())

    # --- per-Stadtteil scale factors, from the full 2025 series ---
    scales = {}
    for name in stadtteil_names:
        key_2025 = f"{slugify(name)}_2025"
        series = checkpoint[key_2025]
        annual_gti_sum = sum(series["gti"])
        annual_kwh_100pct = stadtteile[name]["total_mwh"] * 1000.0
        scales[name] = annual_kwh_100pct / annual_gti_sum if annual_gti_sum > 0 else 0.0

    citywide = {}
    by_stadtteil = {}

    for buildout_pct in BUILDOUT_LEVELS:
        # --- normal scenario: the matched normal day ---
        normal_rated_total = 0.0
        normal_derated_total = 0.0
        normal_hourly_rated = [0.0] * 24
        normal_hourly_derated = [0.0] * 24
        st_normal = {}

        for name in stadtteil_names:
            key_2025 = f"{slugify(name)}_2025"
            series = checkpoint[key_2025]
            idx = hours_for_date(series, MATCHED_NORMAL_DAY)
            rated, derated = compute_day(series, scales[name], buildout_pct, idx)
            for h, (r, dd) in enumerate(zip(rated, derated)):
                normal_hourly_rated[h] += r
                normal_hourly_derated[h] += dd
            normal_rated_total += sum(rated)
            normal_derated_total += sum(derated)
            st_normal[name] = {
                "total_rated_kwh": round(sum(rated), 1),
                "total_derated_kwh": round(sum(derated), 1),
            }

        scenario_key = f"normal_{buildout_pct}"
        citywide[scenario_key] = {
            "day": MATCHED_NORMAL_DAY,
            "total_rated_kwh": round(normal_rated_total, 1),
            "total_derated_kwh": round(normal_derated_total, 1),
            "hourly_rated_kwh": [round(v, 2) for v in normal_hourly_rated],
            "hourly_derated_kwh": [round(v, 2) for v in normal_hourly_derated],
        }
        for name in stadtteil_names:
            by_stadtteil.setdefault(name, {})[scenario_key] = st_normal[name]

        # --- heatwave scenario: worst day (hourly) + full window (totals) ---
        worst_rated_total = 0.0
        worst_derated_total = 0.0
        worst_hourly_rated = [0.0] * 24
        worst_hourly_derated = [0.0] * 24
        window_daily_derated = {d: 0.0 for d in HEATWAVE_WINDOW}
        window_derated_total = 0.0
        window_rated_total = 0.0
        st_heatwave = {}
        worst_hour_derate = 0.0
        daylight_derates = []

        for name in stadtteil_names:
            key_2026 = f"{slugify(name)}_2026_06"
            series = checkpoint[key_2026]

            idx_worst = hours_for_date(series, HEATWAVE_WORST_DAY)
            rated, derated = compute_day(series, scales[name], buildout_pct, idx_worst)
            for h, (r, dd) in enumerate(zip(rated, derated)):
                worst_hourly_rated[h] += r
                worst_hourly_derated[h] += dd
            worst_rated_total += sum(rated)
            worst_derated_total += sum(derated)

            st_window_derated_total = 0.0
            st_window_rated_total = 0.0
            for day in HEATWAVE_WINDOW:
                idx_day = hours_for_date(series, day)
                r_day, d_day = compute_day(series, scales[name], buildout_pct, idx_day)
                window_daily_derated[day] += sum(d_day)
                st_window_derated_total += sum(d_day)
                st_window_rated_total += sum(r_day)

                for i in idx_day:
                    gti = series["gti"][i]
                    t_air = series["temp"][i]
                    if gti > 0:
                        df = derate_fraction(t_air, gti)
                        daylight_derates.append(df)
                        worst_hour_derate = max(worst_hour_derate, df)

            window_derated_total += st_window_derated_total
            window_rated_total += st_window_rated_total

            st_heatwave[name] = {
                "total_rated_kwh": round(sum(rated), 1),
                "total_derated_kwh": round(sum(derated), 1),
                "window_total_derated_kwh": round(st_window_derated_total, 1),
            }

        scenario_key = f"heatwave_{buildout_pct}"
        citywide[scenario_key] = {
            "day": HEATWAVE_WORST_DAY,
            "window": HEATWAVE_WINDOW,
            "total_rated_kwh": round(worst_rated_total, 1),
            "total_derated_kwh": round(worst_derated_total, 1),
            "hourly_rated_kwh": [round(v, 2) for v in worst_hourly_rated],
            "hourly_derated_kwh": [round(v, 2) for v in worst_hourly_derated],
            "window_total_rated_kwh": round(window_rated_total, 1),
            "window_total_derated_kwh": round(window_derated_total, 1),
            "window_daily_derated_kwh": {d: round(v, 1) for d, v in window_daily_derated.items()},
            "worst_hour_derate_pct": round(worst_hour_derate * 100, 2),
            "avg_daylight_derate_pct": round(
                sum(daylight_derates) / len(daylight_derates) * 100, 2
            ) if daylight_derates else 0.0,
        }
        for name in stadtteil_names:
            by_stadtteil.setdefault(name, {})[scenario_key] = st_heatwave[name]

    out = {
        "matched_normal_day": MATCHED_NORMAL_DAY,
        "heatwave_worst_day": HEATWAVE_WORST_DAY,
        "heatwave_window": HEATWAVE_WINDOW,
        "buildout_levels_pct": BUILDOUT_LEVELS,
        "buildout_labels": {str(k): v for k, v in BUILDOUT_LABELS.items()},
        "model_note": (
            "Rated generation scales real ERA5 irradiance so that the full "
            "2025 year reproduces each Stadtteil's cadastre annual yield "
            "exactly at 100% build-out; other build-out levels scale that "
            "uniformly. Derate uses the NOCT cell temperature model and a "
            "-0.35%/degC coefficient applied to cell temperature, never air "
            "temperature. See SCOPE.md section 4."
        ),
        "citywide": citywide,
        "by_stadtteil": by_stadtteil,
    }

    OUT_PATH.write_text(json.dumps(out), encoding="utf-8")
    print(f"Saved: {OUT_PATH} ({OUT_PATH.stat().st_size / 1024:.0f} KB)")

    print("\n--- Headline: normal vs heatwave, at today's build-out (11.6%) ---")
    n = citywide["normal_11.6"]
    h = citywide["heatwave_11.6"]
    diff_kwh = n["total_derated_kwh"] - h["total_derated_kwh"]
    diff_pct = diff_kwh / n["total_derated_kwh"] * 100 if n["total_derated_kwh"] else 0
    print(f"Normal day ({MATCHED_NORMAL_DAY}) derated:   {n['total_derated_kwh']:,.0f} kWh")
    print(f"Heatwave worst day ({HEATWAVE_WORST_DAY}) derated: {h['total_derated_kwh']:,.0f} kWh")
    print(f"Difference: {diff_kwh:,.0f} kWh ({diff_pct:.1f}% less on the heatwave day)")
    print(f"Heatwave window total (derated): {h['window_total_derated_kwh']:,.0f} kWh across 5 days")
    print(f"Worst-hour derate: {h['worst_hour_derate_pct']}%")
    print(f"Average daylight derate across the window: {h['avg_daylight_derate_pct']}%")
    energy_lost = h["window_total_rated_kwh"] - h["window_total_derated_kwh"]
    print(f"Total energy lost to derate over the heatwave window: {energy_lost:,.0f} kWh")


if __name__ == "__main__":
    main()
