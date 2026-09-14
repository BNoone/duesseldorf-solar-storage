"""
Find Duesseldorf's own heatwave window in June 2026, and a matched normal
day from 2025 with similar sunshine but ordinary temperature.

Germany's national temperature records on 26-28 June 2026 were set in
Saarland and Brandenburg, not Duesseldorf, so this does not assume the
national dates apply here unchanged; it finds Duesseldorf's own peak from
its own fetched data (scripts/fetch_era5.py), citywide mean across the 50
Stadtteil centroids.

The matched normal day exists because comparing a hot sunny day to a mild
cloudy one measures cloud cover, not heat. Selection: among 2025 summer
(June-August) days, find the one whose citywide daily GTI total is
closest to the worst heatwave day's GTI total, breaking ties by whichever
of those also has a daily max temperature closest to the JJA 2025 median
(so a match is not itself a small heat event or a cold outlier).

Run: python3 scripts/find_heatwave_window.py
Requires scripts/fetch_era5.py to have been run first.
"""

import json
import statistics
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import BASE  # noqa: E402

CHECKPOINT_PATH = BASE / "data" / "raw" / "era5_checkpoint.json"
OUT_PATH = BASE / "data" / "raw" / "heatwave_window.json"

HEATWAVE_DAYS = ["2026-06-24", "2026-06-25", "2026-06-26", "2026-06-27", "2026-06-28"]


def citywide_daily_series(checkpoint, suffix):
    keys = [k for k in checkpoint if k.endswith(suffix)]
    times = checkpoint[keys[0]]["time"]
    n = len(times)

    daily_max_temp = defaultdict(list)
    daily_gti_sum = defaultdict(float)
    hourly_mean_gti = {}
    for i in range(n):
        day = times[i][:10]
        mean_temp = statistics.mean(checkpoint[k]["temp"][i] for k in keys)
        mean_gti = statistics.mean(checkpoint[k]["gti"][i] for k in keys)
        daily_max_temp[day].append(mean_temp)
        daily_gti_sum[day] += mean_gti
        hourly_mean_gti[times[i]] = mean_gti

    return daily_max_temp, daily_gti_sum, hourly_mean_gti


def main():
    checkpoint = json.loads(CHECKPOINT_PATH.read_text(encoding="utf-8"))

    print("=== June 2026: citywide daily maxima (mean across 50 Stadtteile) ===")
    daily_max_temp_26, daily_gti_26, hourly_gti_26 = citywide_daily_series(checkpoint, "_2026_06")
    for day in sorted(daily_max_temp_26):
        marker = " <-- heatwave window" if day in HEATWAVE_DAYS else ""
        print(f"{day}  max_temp={max(daily_max_temp_26[day]):5.1f} C  "
              f"gti_sum={daily_gti_26[day]:7.0f} Wh/m2{marker}")

    worst_day = max(HEATWAVE_DAYS, key=lambda d: max(daily_max_temp_26[d]))
    worst_day_temp = max(daily_max_temp_26[worst_day])
    worst_day_gti = daily_gti_26[worst_day]

    peak_hour, peak_gti = max(
        ((t, g) for t, g in hourly_gti_26.items() if t[:10] in HEATWAVE_DAYS),
        key=lambda x: x[1],
    )

    print(f"\nWorst single day: {worst_day}, max temp {worst_day_temp:.1f} C, "
          f"GTI total {worst_day_gti:.0f} Wh/m2")
    print(f"Peak single-hour GTI in window: {peak_hour}, {peak_gti:.1f} W/m2")

    print("\n=== 2025 JJA: searching for a matched normal day ===")
    daily_max_temp_25, daily_gti_25, _ = citywide_daily_series(checkpoint, "_2025")
    summer_days = [d for d in daily_max_temp_25 if d[5:7] in ("06", "07", "08")]
    summer_max_temp = {d: max(daily_max_temp_25[d]) for d in summer_days}
    median_temp = statistics.median(summer_max_temp.values())
    print(f"JJA 2025 median daily max temp: {median_temp:.1f} C")

    def score(day):
        gti_pct_diff = abs(daily_gti_25[day] - worst_day_gti) / worst_day_gti
        temp_diff = abs(summer_max_temp[day] - median_temp)
        return gti_pct_diff * 100 + temp_diff  # both roughly comparable scales

    matched_day = min(summer_days, key=score)
    matched_gti = daily_gti_25[matched_day]
    matched_temp = summer_max_temp[matched_day]

    print(f"\nMatched normal day: {matched_day}")
    print(f"  GTI total: {matched_gti:.0f} Wh/m2 (heatwave worst day: {worst_day_gti:.0f}, "
          f"{(matched_gti - worst_day_gti) / worst_day_gti * 100:+.1f}%)")
    print(f"  Max temp:  {matched_temp:.1f} C (heatwave worst day: {worst_day_temp:.1f} C, "
          f"{matched_temp - worst_day_temp:+.1f} C)")

    out = {
        "heatwave_window": HEATWAVE_DAYS,
        "heatwave_worst_day": worst_day,
        "heatwave_worst_day_max_temp_c": round(worst_day_temp, 1),
        "heatwave_worst_day_gti_wh_m2": round(worst_day_gti, 1),
        "heatwave_peak_hour": peak_hour,
        "heatwave_peak_gti_w_m2": round(peak_gti, 1),
        "matched_normal_day": matched_day,
        "matched_normal_day_gti_wh_m2": round(matched_gti, 1),
        "matched_normal_day_max_temp_c": round(matched_temp, 1),
        "jja_2025_median_max_temp_c": round(median_temp, 1),
    }
    OUT_PATH.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(f"\nSaved: {OUT_PATH}")


if __name__ == "__main__":
    main()
