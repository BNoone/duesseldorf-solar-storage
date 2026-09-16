"""
The cooling balance (UX pass round three, commit 3): at the heatwave
afternoon peak hour, 15:00, how much of the rooftops' own output cooling
demand would take, at three levels of AC ownership.

Power, not energy. Both sides of this comparison are megawatts at one
hour, never converted to daily energy and never used to infer an hourly
demand curve, per the round-three brief.

Rooftop side: the derated hourly output already computed for 15:00 on
the heatwave worst day (build_generation.py's own hourly_derated_kwh),
read directly by app.js from data/generation_scenarios.json, not
recomputed here. This script only computes the cooling side.

Cooling side, bottom-up, three levels of AC ownership (6% today, 50%,
90%):
    households x AC ownership share x 3 kW per single-split unit
    x diversity factor 0.5
Method and both figures (3 kW/unit, 0.5 diversity) from Jan Rosenow,
"What happens when 90% of Europe has air conditioning?", drawing on
Andreou et al. 2020; German household AC ownership (6%) is
Umweltbundesamt, cited in the same piece. Duesseldorf's own household
count is the city's own official figure, not from that piece. Full
citations in common.py.

Run: python3 scripts/build_cooling_balance.py
No other script's output is required first.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (  # noqa: E402
    BASE, DUESSELDORF_HOUSEHOLDS, DUESSELDORF_HOUSEHOLDS_DATE,
    AC_KW_PER_UNIT, AC_DIVERSITY_FACTOR, AC_OWNERSHIP_LEVELS_PCT,
    AC_OWNERSHIP_TODAY_PCT, BALANCE_HOUR,
)

OUT_PATH = BASE / "data" / "cooling_balance.json"


def cooling_mw(ac_share_pct):
    households_with_ac = DUESSELDORF_HOUSEHOLDS * (ac_share_pct / 100.0)
    total_kw = households_with_ac * AC_KW_PER_UNIT * AC_DIVERSITY_FACTOR
    return total_kw / 1000.0


def main():
    levels = []
    for pct in AC_OWNERSHIP_LEVELS_PCT:
        mw = cooling_mw(pct)
        label = f"{pct}% (today)" if pct == AC_OWNERSHIP_TODAY_PCT else f"{pct}%"
        levels.append({
            "ac_ownership_pct": pct,
            "label": label,
            "cooling_mw": round(mw, 1),
        })

    out = {
        "household_count": DUESSELDORF_HOUSEHOLDS,
        "household_count_date": DUESSELDORF_HOUSEHOLDS_DATE,
        "household_count_source": (
            "Landeshauptstadt Duesseldorf, Amt fuer Statistik und Wahlen, "
            '"Duesseldorf in Zahlen - Statistical facts", table "Private '
            'Haushalte", row "Insgesamt", 31.12.2025.'
        ),
        "kw_per_unit": AC_KW_PER_UNIT,
        "diversity_factor": AC_DIVERSITY_FACTOR,
        "balance_hour": BALANCE_HOUR,
        "method_source": (
            "Jan Rosenow, \"What happens when 90% of Europe has air "
            "conditioning?\" (Andreou et al. 2020); German AC ownership "
            "6% is Umweltbundesamt, cited in the same piece. "
            "https://janrosenow.substack.com/p/what-happens-when-90-of-europe-has"
        ),
        "levels": levels,
    }
    OUT_PATH.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(f"Saved: {OUT_PATH}")

    print(f"\nDuesseldorf households ({DUESSELDORF_HOUSEHOLDS_DATE}): {DUESSELDORF_HOUSEHOLDS:,}")
    print(f"Cooling demand at the heatwave's {BALANCE_HOUR}:00 peak hour, by AC ownership:")
    for lvl in levels:
        print(f"  {lvl['label']:>10}: {lvl['cooling_mw']:,.1f} MW")


if __name__ == "__main__":
    main()
