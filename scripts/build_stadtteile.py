"""
Aggregate Solarkataster roof potential to Duesseldorf Stadtteile.

Per SCOPE.md section 3: a roof qualifies at the building level, not the
facet level. Facets are summed by geb_id (the Solarkataster's own building
key) before the 10 kWp test, because a typical pitched roof splits into two
or more facets that individually fall well under 10 kWp.

Steps:
  1. Load Solarkataster facets (geb_id, kw, str, geometry), EPSG:25832.
  2. Sum kw and str per geb_id; keep buildings with summed kw >= 10.
  3. Compute each building's representative point as the area-weighted
     mean of its facet centroids, in EPSG:25832, then reproject once to
     WGS84 (EPSG:4326) with pyproj.
  4. Spatial-join building points into the 50 Stadtteil polygons.
  5. Aggregate per Stadtteil: qualifying building count, total kWp, total
     annual MWh, and battery potential at 1.5 kWh per kWp (HTW Berlin).
  6. Write data/stadtteile.json: a GeoJSON FeatureCollection, one feature
     per Stadtteil, simplified geometry, carrying the aggregates above.

Run: python3 scripts/build_stadtteile.py
Requires scripts/fetch_solarkataster.py and scripts/fetch_stadtteile.py to
have been run first (both are cheap to re-run; they skip if already done).
"""

import json
from datetime import date
from pathlib import Path

import geopandas as gpd
import pandas as pd
from pyproj import Transformer

BASE = Path(__file__).resolve().parent.parent
SOLARKATASTER_SHP = (
    BASE / "data" / "raw" / "solarkataster"
    / "Solarkataster-Potentiale-Photovoltaik_05111000_Duesseldorf.shp"
)
STADTTEILE_GEOJSON = BASE / "data" / "raw" / "stadtteile_wgs84.geojson"
OUT_PATH = BASE / "data" / "stadtteile.json"

MIN_KWP_PER_BUILDING = 10.0
BATTERY_KWH_PER_KWP = 1.5
SIMPLIFY_TOLERANCE_DEG = 0.0003  # roughly 25-30 m at this latitude


def load_qualifying_buildings():
    facets = gpd.read_file(
        SOLARKATASTER_SHP, engine="pyogrio", columns=["geb_id", "kw", "str"]
    )
    print(f"Facets loaded: {len(facets):,}")

    facets["cx"] = facets.geometry.centroid.x
    facets["cy"] = facets.geometry.centroid.y
    facets["area"] = facets.geometry.area

    facets["area_cx"] = facets["area"] * facets["cx"]
    facets["area_cy"] = facets["area"] * facets["cy"]

    buildings = facets.groupby("geb_id").agg(
        kw_sum=("kw", "sum"),
        str_sum=("str", "sum"),
        area_sum=("area", "sum"),
        area_cx_sum=("area_cx", "sum"),
        area_cy_sum=("area_cy", "sum"),
        n_facets=("kw", "count"),
    )
    print(f"Distinct buildings (geb_id): {len(buildings):,}")

    buildings = buildings[buildings["kw_sum"] >= MIN_KWP_PER_BUILDING].copy()
    buildings["x_25832"] = buildings["area_cx_sum"] / buildings["area_sum"]
    buildings["y_25832"] = buildings["area_cy_sum"] / buildings["area_sum"]

    print(f"Qualifying buildings (kw_sum >= {MIN_KWP_PER_BUILDING}): {len(buildings):,}")
    print(f"Total kWp: {buildings['kw_sum'].sum():,.1f}")
    print(f"Total annual kWh: {buildings['str_sum'].sum():,.1f}")

    transformer = Transformer.from_crs("EPSG:25832", "EPSG:4326", always_xy=True)
    lons, lats = transformer.transform(
        buildings["x_25832"].values, buildings["y_25832"].values
    )
    buildings["lon"] = lons
    buildings["lat"] = lats

    return buildings.reset_index()[["geb_id", "kw_sum", "str_sum", "lon", "lat"]]


def join_to_stadtteile(buildings):
    stadtteile = gpd.read_file(STADTTEILE_GEOJSON, engine="pyogrio")
    stadtteile = stadtteile.set_crs("EPSG:4326", allow_override=True)
    print(f"Stadtteile loaded: {len(stadtteile)}")

    points = gpd.GeoDataFrame(
        buildings,
        geometry=gpd.points_from_xy(buildings["lon"], buildings["lat"]),
        crs="EPSG:4326",
    )

    joined = gpd.sjoin(points, stadtteile[["Name", "Nummer", "geometry"]],
                        how="left", predicate="within")

    unmatched = joined["Name"].isna().sum()
    print(f"Buildings not matched to any Stadtteil: {unmatched:,} of {len(joined):,}")

    return joined, stadtteile, unmatched


def aggregate_per_stadtteil(joined, stadtteile):
    agg = joined.dropna(subset=["Name"]).groupby("Nummer").agg(
        qualifying_buildings=("geb_id", "count"),
        total_kwp=("kw_sum", "sum"),
        total_kwh=("str_sum", "sum"),
    )
    agg["total_mwh"] = agg["total_kwh"] / 1000.0
    agg["battery_potential_kwh"] = agg["total_kwp"] * BATTERY_KWH_PER_KWP

    result = stadtteile.merge(agg, on="Nummer", how="left")
    for col in ["qualifying_buildings", "total_kwp", "total_mwh", "battery_potential_kwh"]:
        result[col] = result[col].fillna(0)
    result["qualifying_buildings"] = result["qualifying_buildings"].astype(int)

    return result


def write_geojson(result):
    result = result.copy()
    result["geometry"] = result.geometry.simplify(
        SIMPLIFY_TOLERANCE_DEG, preserve_topology=True
    )

    features = []
    for _, row in result.iterrows():
        features.append({
            "type": "Feature",
            "properties": {
                "name": row["Name"],
                "nummer": row["Nummer"],
                "qualifying_buildings": int(row["qualifying_buildings"]),
                "total_kwp": round(float(row["total_kwp"]), 1),
                "total_mwh": round(float(row["total_mwh"]), 1),
                "battery_potential_kwh": round(float(row["battery_potential_kwh"]), 1),
            },
            "geometry": json.loads(gpd.GeoSeries([row.geometry]).to_json())["features"][0]["geometry"],
        })

    out = {
        "type": "FeatureCollection",
        "properties": {
            "source_solarkataster": "Solarkataster NRW, Gemeindeschluessel 05111000, opengeodata.nrw.de",
            "source_stadtteile": "Open Data Duesseldorf, Stadtteilgrenzen Duesseldorf 2025",
            "qualifying_rule": "kWp >= 10 summed per building (geb_id), not per facet",
            "battery_potential_formula": "roof potential (kWp) x 1.5 kWh/kWp, HTW Berlin sizing recommendation",
            "generated_at": date.today().isoformat(),
        },
        "features": features,
    }

    OUT_PATH.write_text(json.dumps(out), encoding="utf-8")
    print(f"\nSaved: {OUT_PATH} ({len(features)} features, {OUT_PATH.stat().st_size / 1024:.0f} KB)")


def main():
    buildings = load_qualifying_buildings()
    joined, stadtteile, unmatched = join_to_stadtteile(buildings)
    result = aggregate_per_stadtteil(joined, stadtteile)
    write_geojson(result)

    print("\n--- Per-Stadtteil summary, sorted by total kWp ---")
    summary = result[["Name", "qualifying_buildings", "total_kwp", "total_mwh"]] \
        .sort_values("total_kwp", ascending=False)
    print(summary.to_string(index=False))


if __name__ == "__main__":
    main()
