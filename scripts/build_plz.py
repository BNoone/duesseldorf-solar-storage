"""
Compute each Duesseldorf postcode's (PLZ) own exact facts: roof potential,
registered PV, realization, and registered storage.

Per SCOPE.md section 3 (v2.3): PLZ is not a map layer. It is the only
geography MaStR's registry data can honestly support (coordinates are only
usable for a small, size-biased slice of units), so its numbers are shown
as postcode facts inside each Stadtteil's panel (see
build_postcode_facts.py), never blended into a per-Stadtteil rate. This
script produces the postcode-only numbers those facts are built from; it
carries no geometry in its output, because nothing renders it as a shape.

Building-level potential is computed exactly as in build_stadtteile.py
(same exclusion rule, same function, reused here) and aggregated to PLZ
instead of Stadtteil, via the same building-centroid spatial join.
Registered PV and storage are read from MaStR's own Postleitzahl field
directly, not a spatial join, since MaStR coordinates are only usable for a
small, size-biased slice of units.

Run: python3 scripts/build_plz.py
Requires scripts/fetch_solarkataster.py, scripts/fetch_plz_boundaries.py,
and scripts/fetch_mastr.py to have been run first.
"""

import json
import sqlite3
import sys
from datetime import date
from pathlib import Path

import geopandas as gpd
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import BASE  # noqa: E402
from build_stadtteile import load_qualifying_buildings  # noqa: E402

PLZ_GEOJSON = BASE / "data" / "raw" / "plz_duesseldorf.geojson"
DB_PATH = BASE / "data" / "raw" / "open-mastr" / "data" / "sqlite" / "open-mastr.db"
OUT_PATH = BASE / "data" / "plz.json"

BATTERY_TECHS = ("Lithium-Batterie", "Blei-Batterie", "Redox-Flow-Batterie", "Hochtemperaturbatterie")


def join_to_plz(buildings):
    plz = gpd.read_file(PLZ_GEOJSON, engine="pyogrio")
    plz = plz.set_crs("EPSG:4326", allow_override=True)
    plz = plz.rename(columns={"postcode": "PLZ"})
    print(f"PLZ areas loaded: {len(plz)}")

    points = gpd.GeoDataFrame(
        buildings,
        geometry=gpd.points_from_xy(buildings["lon"], buildings["lat"]),
        crs="EPSG:4326",
    )
    joined = gpd.sjoin(points, plz[["PLZ", "geometry"]], how="left", predicate="within")
    unmatched = joined["PLZ"].isna().sum()
    print(f"Buildings not matched to any PLZ: {unmatched:,} of {len(joined):,}")

    return joined, sorted(plz["PLZ"].tolist())


def aggregate_per_plz(joined, all_plz_codes):
    agg = joined.dropna(subset=["PLZ"]).groupby("PLZ").agg(
        qualifying_buildings=("geb_id", "count"),
        total_kwp=("kw_sum", "sum"),
        total_kwh=("str_sum", "sum"),
    )
    agg = agg.reindex(all_plz_codes, fill_value=0.0)
    agg["qualifying_buildings"] = agg["qualifying_buildings"].astype(int)
    return agg


def load_registered_pv_by_plz(conn):
    # A handful of MaStR rows tag Landkreis = 'Düsseldorf' but carry a
    # Postleitzahl outside the 37 real Duesseldorf postcodes (40699 Erkrath,
    # 40721 Hilden, 40882 Ratingen, 41460 Neuss): border addresses with an
    # inconsistent Landkreis field. Checked: 208 kWp total, 0.13% of
    # Duesseldorf's registered PV. Rows keyed to a PLZ not in the 37-postcode
    # set are silently dropped here, so the sum of registered_kwp across all
    # PLZ is about 208 kWp less than the citywide REGISTERED_PV_KWP figure
    # in common.py. Immaterial to any number that reaches the page, but
    # worth knowing if the two are ever compared directly.
    cur = conn.execute("""
        SELECT Postleitzahl, SUM(Bruttoleistung)
        FROM solar_extended
        WHERE Landkreis = 'Düsseldorf' AND Energietraeger = 'Solare Strahlungsenergie'
        GROUP BY Postleitzahl
    """)
    result = {plz: kwp for plz, kwp in cur.fetchall()}
    print(f"Registered PV found for {len(result)} PLZ")
    return result


def load_storage_by_plz(conn):
    # NutzbareSpeicherkapazitaet (kWh) is null for every row in
    # storage_extended, at every scale, nationwide, always. The real kWh
    # value lives on the Anlage-level record in storage_units, joined via
    # VerknuepfteEinheit -> EinheitMastrNummer (SCOPE.md section 13).
    placeholders = ", ".join("?" for _ in BATTERY_TECHS)
    cur = conn.execute(f"""
        SELECT se.Postleitzahl, COUNT(*), SUM(su.NutzbareSpeicherkapazitaet)
        FROM storage_extended se
        LEFT JOIN storage_units su ON su.VerknuepfteEinheit = se.EinheitMastrNummer
        WHERE se.Landkreis = 'Düsseldorf'
          AND se.Batterietechnologie IN ({placeholders})
        GROUP BY se.Postleitzahl
    """, BATTERY_TECHS)
    units, kwh = {}, {}
    for plz, n, total_kwh in cur.fetchall():
        units[plz] = n
        kwh[plz] = total_kwh or 0.0
    print(f"Storage units found for {len(units)} PLZ")
    return units, kwh


def write_output(agg, registered_by_plz, storage_units_by_plz, storage_kwh_by_plz):
    plz_facts = {}
    for plz_code, row in agg.iterrows():
        registered_kwp = registered_by_plz.get(plz_code, 0.0) or 0.0
        total_kwp = float(row["total_kwp"])
        realization_pct = (registered_kwp / total_kwp * 100) if total_kwp > 0 else 0.0

        plz_facts[plz_code] = {
            "qualifying_buildings": int(row["qualifying_buildings"]),
            "total_kwp": round(total_kwp, 1),
            "total_mwh": round(float(row["total_kwh"]) / 1000.0, 1),
            "registered_kwp": round(registered_kwp, 1),
            "realization_pct": round(realization_pct, 1),
            "storage_units": int(storage_units_by_plz.get(plz_code, 0)),
            "storage_kwh": round(storage_kwh_by_plz.get(plz_code, 0.0), 1),
        }

    out = {
        "source_solarkataster": "Solarkataster NRW, Gemeindeschluessel 05111000, opengeodata.nrw.de",
        "source_plz": "yetzt/postleitzahlen (OpenStreetMap contributors, ODbL)",
        "source_registered_pv": "Marktstammdatenregister (MaStR), Postleitzahl field",
        "source_storage": "Marktstammdatenregister (MaStR), storage_units join for kWh",
        "generated_at": date.today().isoformat(),
        "plz": plz_facts,
    }
    OUT_PATH.write_text(json.dumps(out), encoding="utf-8")
    print(f"\nSaved: {OUT_PATH} ({len(plz_facts)} postcodes, {OUT_PATH.stat().st_size / 1024:.0f} KB)")
    return plz_facts


def main():
    buildings = load_qualifying_buildings()
    joined, all_plz_codes = join_to_plz(buildings)
    agg = aggregate_per_plz(joined, all_plz_codes)

    if not DB_PATH.exists():
        raise SystemExit(f"MaStR database not found at {DB_PATH}. Run scripts/fetch_mastr.py first.")
    db_conn = sqlite3.connect(DB_PATH)
    try:
        registered_by_plz = load_registered_pv_by_plz(db_conn)
        storage_units_by_plz, storage_kwh_by_plz = load_storage_by_plz(db_conn)
    finally:
        db_conn.close()

    plz_facts = write_output(agg, registered_by_plz, storage_units_by_plz, storage_kwh_by_plz)

    print("\n--- Per-PLZ summary, sorted by realization ---")
    df = pd.DataFrame(
        [{"PLZ": k, **v} for k, v in plz_facts.items()]
    ).sort_values("realization_pct", ascending=False)
    print(df.to_string(index=False))


if __name__ == "__main__":
    main()
