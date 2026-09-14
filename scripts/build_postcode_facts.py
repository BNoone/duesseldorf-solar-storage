"""
Build the postcode breakdown shown inside each Stadtteil's panel.

Per SCOPE.md section 3 (v2.3): Stadtteil is the only geography on the map.
Existing-installation numbers are exact only at postcode granularity, so
they are never turned into a per-Stadtteil rate. Instead, each Stadtteil's
panel lists the postcodes it overlaps, ordered by that postcode's share of
the Stadtteil's own roof potential, and each postcode entry carries its own
exact figures from build_plz.py, never apportioned.

This is the same building-level Stadtteil/PLZ crosswalk used to measure how
much the two geographies cross (SCOPE.md v2.3 changelog), read Stadtteil
first instead of PLZ first: for each Stadtteil, what share of its own kWp
falls in each overlapping postcode.

Run: python3 scripts/build_postcode_facts.py
Requires build_stadtteile.py's and build_plz.py's outputs
(data/stadtteile.json and data/plz.json) and the raw boundary files to
have been fetched first.
"""

import json
import sys
from pathlib import Path

import geopandas as gpd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import BASE, STADTTEILE_GEOJSON  # noqa: E402
from build_stadtteile import load_qualifying_buildings  # noqa: E402

PLZ_GEOJSON = BASE / "data" / "raw" / "plz_duesseldorf.geojson"
PLZ_FACTS_PATH = BASE / "data" / "plz.json"
OUT_PATH = BASE / "data" / "postcode_facts.json"


def crosswalk():
    buildings = load_qualifying_buildings()

    points = gpd.GeoDataFrame(
        buildings,
        geometry=gpd.points_from_xy(buildings["lon"], buildings["lat"]),
        crs="EPSG:4326",
    )

    stadtteile = gpd.read_file(STADTTEILE_GEOJSON, engine="pyogrio").set_crs("EPSG:4326", allow_override=True)
    plz = gpd.read_file(PLZ_GEOJSON, engine="pyogrio").set_crs("EPSG:4326", allow_override=True)
    plz = plz.rename(columns={"postcode": "PLZ"})

    j1 = gpd.sjoin(points, stadtteile[["Name", "geometry"]], how="left", predicate="within")
    j1 = j1.rename(columns={"Name": "stadtteil"}).drop(columns=["index_right"])
    j2 = gpd.sjoin(j1, plz[["PLZ", "geometry"]], how="left", predicate="within")

    both = j2.dropna(subset=["stadtteil", "PLZ"])
    unmatched = len(j2) - len(both)
    print(f"Buildings with both a Stadtteil and a PLZ: {len(both):,} of {len(j2):,} ({unmatched} unmatched)")

    return both.groupby(["stadtteil", "PLZ"])["kw_sum"].sum().reset_index()


def build_breakdown(crossed, plz_facts):
    breakdown = {}
    for stadtteil_name, group in crossed.groupby("stadtteil"):
        total = group["kw_sum"].sum()
        group = group.sort_values("kw_sum", ascending=False)

        entries = []
        for _, row in group.iterrows():
            plz_code = row["PLZ"]
            facts = plz_facts["plz"].get(plz_code)
            if facts is None:
                continue
            entries.append({
                "plz": plz_code,
                "share_pct": round(row["kw_sum"] / total * 100, 1),
                "registered_kwp": facts["registered_kwp"],
                "own_total_kwp": facts["total_kwp"],
                "realization_pct": facts["realization_pct"],
                "storage_units": facts["storage_units"],
                "storage_kwh": facts["storage_kwh"],
            })
        breakdown[stadtteil_name] = entries

    return breakdown


def main():
    if not PLZ_FACTS_PATH.exists():
        raise SystemExit(f"{PLZ_FACTS_PATH} not found. Run scripts/build_plz.py first.")
    plz_facts = json.loads(PLZ_FACTS_PATH.read_text(encoding="utf-8"))

    crossed = crosswalk()
    breakdown = build_breakdown(crossed, plz_facts)

    OUT_PATH.write_text(json.dumps(breakdown), encoding="utf-8")
    print(f"\nSaved: {OUT_PATH} ({len(breakdown)} Stadtteile, {OUT_PATH.stat().st_size / 1024:.0f} KB)")

    print("\n--- Sample: Flingern Nord ---")
    print(json.dumps(breakdown.get("Flingern Nord", []), indent=2))


if __name__ == "__main__":
    main()
