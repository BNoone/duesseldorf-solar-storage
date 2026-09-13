"""
Build the storage layer data: large Duesseldorf units, NRW units for scale,
and the citywide honest-line totals.

Per SCOPE.md section 3: storage focus is grid-scale and community-scale.
Duesseldorf's own large-unit fleet is tiny (6 units above 100 kW) and its
only unit above 1 MW is not built yet, so an NRW-wide layer of units above
1 MW is included for contrast. Home batteries (the other 6,654 Duesseldorf
units) are never plotted as points: only 28 of 6,660 carry usable
coordinates (SCOPE.md section 3), so they are represented only as a
citywide count and combined capacity, not as located dots.

Reads directly from the local MaStR SQLite database built by
fetch_mastr.py (data/raw/open-mastr/data/sqlite/open-mastr.db).

Writes:
  data/storage_duesseldorf.json  - the 6 Duesseldorf units above 100 kW,
                                    plus the citywide honest-line totals
  data/storage_nrw_large.json    - NRW units above 1 MW, for scale

Run: python3 scripts/build_storage.py
Requires scripts/fetch_mastr.py to have been run first.
"""

import json
import sqlite3
from datetime import date
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
DB_PATH = BASE / "data" / "raw" / "open-mastr" / "data" / "sqlite" / "open-mastr.db"

OUT_DUS = BASE / "data" / "storage_duesseldorf.json"
OUT_NRW = BASE / "data" / "storage_nrw_large.json"

LARGE_DUS_KW = 100
LARGE_NRW_KW = 1000

BATTERY_TECHS = ("Lithium-Batterie", "Blei-Batterie", "Redox-Flow-Batterie", "Hochtemperaturbatterie")

CHEMISTRY_LABELS = {
    "Lithium-Batterie": "Lithium-ion",
    "Blei-Batterie": "Lead-acid",
    "Redox-Flow-Batterie": "Redox flow",
    "Hochtemperaturbatterie": "High-temperature (sodium-based)",
}


def commissioning_label(row):
    if row["EinheitBetriebsstatus"] == "In Planung":
        planned = row["GeplantesInbetriebnahmedatum"]
        return f"Planned {planned[:4]}" if planned else "Planned, no date given"
    inbetrieb = row["Inbetriebnahmedatum"]
    return inbetrieb[:4] if inbetrieb else "Unknown"


def query_units(conn, where_clause, params):
    placeholders = ", ".join("?" for _ in BATTERY_TECHS)
    sql = f"""
        SELECT EinheitMastrNummer, Bruttoleistung, Batterietechnologie,
               Landkreis, Postleitzahl, Laengengrad, Breitengrad,
               Inbetriebnahmedatum, GeplantesInbetriebnahmedatum,
               EinheitBetriebsstatus
        FROM storage_extended
        WHERE Batterietechnologie IN ({placeholders})
          AND {where_clause}
    """
    cur = conn.execute(sql, (*BATTERY_TECHS, *params))
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def build_duesseldorf(conn):
    rows = query_units(conn, "Landkreis = ? AND Bruttoleistung > ?", ("Düsseldorf", LARGE_DUS_KW))
    print(f"Duesseldorf units above {LARGE_DUS_KW} kW: {len(rows)}")

    features = []
    for row in rows:
        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [row["Laengengrad"], row["Breitengrad"]],
            },
            "properties": {
                "unit_id": row["EinheitMastrNummer"],
                "kw": row["Bruttoleistung"],
                "chemistry": CHEMISTRY_LABELS.get(row["Batterietechnologie"], row["Batterietechnologie"]),
                "postcode": row["Postleitzahl"],
                "status": row["EinheitBetriebsstatus"],
                "commissioning": commissioning_label(row),
                "is_largest": row["Bruttoleistung"] >= 1000,
            },
        })

    cur = conn.execute(
        f"""SELECT COUNT(*), SUM(Bruttoleistung) FROM storage_extended
            WHERE Landkreis = ? AND Batterietechnologie IN
            ({", ".join("?" for _ in BATTERY_TECHS)})""",
        ("Düsseldorf", *BATTERY_TECHS),
    )
    total_units, total_kw = cur.fetchone()
    print(f"Duesseldorf citywide: {total_units} units, {total_kw:,.1f} kW total")

    out = {
        "type": "FeatureCollection",
        "properties": {
            "source": "Marktstammdatenregister (MaStR), local pull via open-mastr",
            "citywide_total_units": total_units,
            "citywide_total_kw": round(total_kw, 1),
            "citywide_note": (
                f"Duesseldorf has {total_units:,} registered storage units totalling "
                f"{total_kw:,.0f} kW. Only the {len(features)} above {LARGE_DUS_KW} kW are "
                "shown as dots; the rest are home batteries the registry does not "
                "locate (only 28 of 6,660 Duesseldorf units carry usable coordinates)."
            ),
            "generated_at": date.today().isoformat(),
        },
        "features": features,
    }
    OUT_DUS.write_text(json.dumps(out), encoding="utf-8")
    print(f"Saved: {OUT_DUS}")


def build_nrw_large(conn):
    rows = query_units(conn, "Bundesland = ? AND Bruttoleistung > ?", ("Nordrhein-Westfalen", LARGE_NRW_KW))
    print(f"NRW units above {LARGE_NRW_KW} kW: {len(rows)}")

    features = []
    for row in rows:
        if row["Laengengrad"] is None or row["Breitengrad"] is None:
            continue
        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [row["Laengengrad"], row["Breitengrad"]],
            },
            "properties": {
                "unit_id": row["EinheitMastrNummer"],
                "kw": row["Bruttoleistung"],
                "chemistry": CHEMISTRY_LABELS.get(row["Batterietechnologie"], row["Batterietechnologie"]),
                "landkreis": row["Landkreis"],
                "status": row["EinheitBetriebsstatus"],
                "commissioning": commissioning_label(row),
            },
        })

    out = {
        "type": "FeatureCollection",
        "properties": {
            "source": "Marktstammdatenregister (MaStR), local pull via open-mastr",
            "threshold_kw": LARGE_NRW_KW,
            "generated_at": date.today().isoformat(),
        },
        "features": features,
    }
    OUT_NRW.write_text(json.dumps(out), encoding="utf-8")
    print(f"Saved: {OUT_NRW} ({len(features)} located units)")


def main():
    if not DB_PATH.exists():
        raise SystemExit(f"MaStR database not found at {DB_PATH}. Run scripts/fetch_mastr.py first.")
    conn = sqlite3.connect(DB_PATH)
    try:
        build_duesseldorf(conn)
        build_nrw_large(conn)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
