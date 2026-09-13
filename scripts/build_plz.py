"""
Aggregate roof potential and registered PV to Duesseldorf postcodes (PLZ).

Per SCOPE.md section 3: potential is shown by Stadtteil, existing
installations by postcode, because postcode is the finest location the
national registry (MaStR) publishes for systems under 30 kWp, which is
most of them. The two geographies cross and do not nest, and are never
compared shape-to-shape; this script produces a second, independent view,
not a variant of the Stadtteil one.

Building-level potential is computed exactly as in build_stadtteile.py
(same exclusion rule, same script, reused here) and aggregated to PLZ
instead of Stadtteil, via the same reliable building-centroid spatial join.
Registered PV is read from MaStR's own Postleitzahl field directly, not a
spatial join, since MaStR coordinates are only usable for a small,
size-biased slice of units (SCOPE.md section 3).

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
from common import BASE, BATTERY_KWH_PER_KWP  # noqa: E402
from build_stadtteile import load_qualifying_buildings  # noqa: E402

PLZ_GEOJSON = BASE / "data" / "raw" / "plz_duesseldorf.geojson"
DB_PATH = BASE / "data" / "raw" / "open-mastr" / "data" / "sqlite" / "open-mastr.db"
OUT_PATH = BASE / "data" / "plz.json"
SIMPLIFY_TOLERANCE_DEG = 0.0002


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

    return joined, plz


def aggregate_per_plz(joined, plz):
    agg = joined.dropna(subset=["PLZ"]).groupby("PLZ").agg(
        qualifying_buildings=("geb_id", "count"),
        total_kwp=("kw_sum", "sum"),
        total_kwh=("str_sum", "sum"),
    )
    agg["total_mwh"] = agg["total_kwh"] / 1000.0
    agg["battery_potential_kwh"] = agg["total_kwp"] * BATTERY_KWH_PER_KWP

    result = plz.merge(agg, on="PLZ", how="left")
    for col in ["qualifying_buildings", "total_kwp", "total_mwh", "battery_potential_kwh"]:
        result[col] = result[col].fillna(0)
    result["qualifying_buildings"] = result["qualifying_buildings"].astype(int)
    return result


def load_registered_pv_by_plz():
    # A handful of MaStR rows tag Landkreis = 'Düsseldorf' but carry a
    # Postleitzahl outside the 37 real Duesseldorf postcodes (40699 Erkrath,
    # 40721 Hilden, 40882 Ratingen, 41460 Neuss): border addresses with an
    # inconsistent Landkreis field. Checked: 208 kWp total, 0.13% of
    # Duesseldorf's registered PV. Rows keyed to a PLZ not in the 37-postcode
    # boundary set below are silently dropped from the per-PLZ map, so the
    # sum of registered_kwp across all PLZ features is about 208 kWp less
    # than the citywide REGISTERED_PV_KWP figure in common.py. Immaterial to
    # any number that reaches the page, but worth knowing if the two are
    # ever compared directly.
    if not DB_PATH.exists():
        raise SystemExit(f"MaStR database not found at {DB_PATH}. Run scripts/fetch_mastr.py first.")
    conn = sqlite3.connect(DB_PATH)
    cur = conn.execute("""
        SELECT Postleitzahl, SUM(Bruttoleistung)
        FROM solar_extended
        WHERE Landkreis = 'Düsseldorf' AND Energietraeger = 'Solare Strahlungsenergie'
        GROUP BY Postleitzahl
    """)
    result = {plz: kwp for plz, kwp in cur.fetchall()}
    conn.close()
    print(f"Registered PV found for {len(result)} PLZ")
    return result


def write_geojson(result, registered_by_plz):
    result = result.copy()
    result["geometry"] = result.geometry.simplify(SIMPLIFY_TOLERANCE_DEG, preserve_topology=True)

    features = []
    for _, row in result.iterrows():
        plz_code = row["PLZ"]
        registered_kwp = registered_by_plz.get(plz_code, 0.0) or 0.0
        total_kwp = float(row["total_kwp"])
        realization_pct = (registered_kwp / total_kwp * 100) if total_kwp > 0 else 0.0

        features.append({
            "type": "Feature",
            "properties": {
                "plz": plz_code,
                "qualifying_buildings": int(row["qualifying_buildings"]),
                "total_kwp": round(total_kwp, 1),
                "total_mwh": round(float(row["total_mwh"]), 1),
                "battery_potential_kwh": round(float(row["battery_potential_kwh"]), 1),
                "registered_kwp": round(registered_kwp, 1),
                "realization_pct": round(realization_pct, 1),
            },
            "geometry": json.loads(gpd.GeoSeries([row.geometry]).to_json())["features"][0]["geometry"],
        })

    out = {
        "type": "FeatureCollection",
        "properties": {
            "source_solarkataster": "Solarkataster NRW, Gemeindeschluessel 05111000, opengeodata.nrw.de",
            "source_plz": "yetzt/postleitzahlen (OpenStreetMap contributors, ODbL)",
            "source_registered_pv": "Marktstammdatenregister (MaStR), Postleitzahl field",
            "note": "Potential is shown by neighbourhood (Stadtteil), existing installations by "
                    "postcode, because postcode is the finest location MaStR publishes for "
                    "systems under 30 kWp, which is most of them.",
            "generated_at": date.today().isoformat(),
        },
        "features": features,
    }
    OUT_PATH.write_text(json.dumps(out), encoding="utf-8")
    print(f"\nSaved: {OUT_PATH} ({len(features)} features, {OUT_PATH.stat().st_size / 1024:.0f} KB)")


def main():
    buildings = load_qualifying_buildings()
    joined, plz = join_to_plz(buildings)
    result = aggregate_per_plz(joined, plz)
    registered_by_plz = load_registered_pv_by_plz()
    write_geojson(result, registered_by_plz)

    print("\n--- Per-PLZ summary, sorted by realization ---")
    rows = []
    for _, row in result.iterrows():
        reg = registered_by_plz.get(row["PLZ"], 0.0) or 0.0
        pct = (reg / row["total_kwp"] * 100) if row["total_kwp"] > 0 else 0.0
        rows.append((row["PLZ"], row["qualifying_buildings"], row["total_kwp"], reg, pct))
    df = pd.DataFrame(rows, columns=["PLZ", "buildings", "total_kwp", "registered_kwp", "realization_pct"])
    print(df.sort_values("realization_pct", ascending=False).to_string(index=False))


if __name__ == "__main__":
    main()
