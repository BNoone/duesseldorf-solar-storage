"""
Build per-Stadtteil roof files for the building drill-down.

Per SCOPE.md section 3: clicking a Stadtteil draws every qualifying
building in it, not just the top 20. This script writes one file per
Stadtteil so the page can load buildings for a single neighbourhood on
click, never all 48,475 qualifying buildings at once.

Same qualifying rule as build_stadtteile.py (scripts/common.py): facets
summed by building (geb_id), north-facing pitched facets excluded before
that sum, kWp >= 10 on what remains.

Steps:
  1. Load Solarkataster facets, exclude north-facing pitched, EPSG:25832.
  2. Sum kw and str per geb_id; keep buildings with summed kw >= 10.
  3. Dissolve each qualifying building's remaining facets into one
     footprint geometry (unary union), in EPSG:25832.
  4. Simplify (Douglas-Peucker, 3 m tolerance). Buildings still over 15
     vertices after that (large apartment blocks and factory complexes,
     24.6% of buildings, 61% of all vertices before this step) fall back
     to a convex hull instead: the file-size budget could not be hit
     otherwise, and this is a recognition map, not a survey product.
  5. Reproject footprints and centroids to WGS84 (EPSG:4326), round
     coordinates to 5 decimal places (about 1 m).
  6. Spatial-join building centroids into the 50 Stadtteil polygons.
  7. Within each Stadtteil, rank buildings by capacity-weighted specific
     yield (str_sum / kw_sum) and mark the top 20 as highlighted.
  8. Write data/roofs/<slug>.json per Stadtteil, one feature per building.

Run: python3 scripts/build_roofs.py
Requires scripts/fetch_solarkataster.py and scripts/fetch_stadtteile.py to
have been run first.
"""

import json
import sys
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely.ops import transform as shapely_transform

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (  # noqa: E402
    BASE, SOLARKATASTER_SHP, STADTTEILE_GEOJSON, MIN_KWP_PER_BUILDING,
    exclude_north_facing_pitched, slugify,
)

OUT_DIR = BASE / "data" / "roofs"
TOP_N_HIGHLIGHTED = 20
SIMPLIFY_TOLERANCE_M = 3.0  # in EPSG:25832 metres, applied before reprojecting
COORD_DECIMALS = 5  # about 1 m

# A small number of buildings (large apartment blocks, factory complexes)
# dissolve into many-sided shapes that Douglas-Peucker simplification
# cannot shrink much without breaking topology: 24.6% of buildings carry
# more than 30 vertices after simplify(), and that 24.6% accounts for 61%
# of all vertices citywide. Falling back to a convex hull for just that
# group cuts total vertex count by 45% with a mean of 18 vertices in the
# hulled group (vs. hundreds for the worst offenders). The shape is no
# longer exact for these buildings, but this is a drill-down recognition
# map, not a survey product, and the alternative was missing the file-size
# budget by close to 50%.
VERTEX_CAP_FOR_HULL = 15


def round_coords(geom):
    def _round(x, y, z=None):
        rx = [round(v, COORD_DECIMALS) for v in x]
        ry = [round(v, COORD_DECIMALS) for v in y]
        return (rx, ry) if z is None else (rx, ry, [round(v, COORD_DECIMALS) for v in z])
    return shapely_transform(_round, geom)


def load_qualifying_buildings():
    facets = gpd.read_file(
        SOLARKATASTER_SHP, engine="pyogrio",
        columns=["geb_id", "kw", "str", "dachtyp", "himmel_kat"],
    )
    print(f"Facets loaded: {len(facets):,}")

    facets = exclude_north_facing_pitched(facets)

    bld_kw = facets.groupby("geb_id")["kw"].sum()
    qualifying_ids = set(bld_kw[bld_kw >= MIN_KWP_PER_BUILDING].index)
    print(f"Qualifying buildings (kw_sum >= {MIN_KWP_PER_BUILDING}): {len(qualifying_ids):,}")

    facets = facets[facets["geb_id"].isin(qualifying_ids)].copy()
    print(f"Facets belonging to qualifying buildings: {len(facets):,}")

    agg = facets.groupby("geb_id").agg(
        kw_sum=("kw", "sum"),
        str_sum=("str", "sum"),
        n_facets=("kw", "count"),
    )

    print("Dissolving facets into per-building footprints ...")
    dissolved = facets.dissolve(by="geb_id")
    buildings = dissolved.join(agg)
    buildings["kwh_kwp"] = buildings["str_sum"] / buildings["kw_sum"]

    return buildings.reset_index()


def vertex_count(geom):
    if geom.geom_type == "Polygon":
        return len(geom.exterior.coords) + sum(len(i.coords) for i in geom.interiors)
    if geom.geom_type == "MultiPolygon":
        return sum(len(p.exterior.coords) + sum(len(i.coords) for i in p.interiors)
                   for p in geom.geoms)
    return 0


def reproject_and_simplify(buildings):
    buildings = buildings.copy()
    buildings["geometry"] = buildings.geometry.simplify(
        SIMPLIFY_TOLERANCE_M, preserve_topology=True
    )

    verts = buildings.geometry.apply(vertex_count)
    too_complex = verts > VERTEX_CAP_FOR_HULL
    print(f"Buildings simplified to a convex hull (>{VERTEX_CAP_FOR_HULL} vertices): "
          f"{too_complex.sum():,} of {len(buildings):,}")
    buildings.loc[too_complex, "geometry"] = buildings.loc[too_complex].geometry.convex_hull

    # Centroid computed in the projected CRS (metres), before reprojecting,
    # so it is a true planar centroid rather than one taken in degrees.
    centroids_25832 = buildings.geometry.centroid
    buildings = buildings.to_crs("EPSG:4326")
    buildings["geometry"] = buildings.geometry.apply(round_coords)

    centroids_4326 = centroids_25832.to_crs("EPSG:4326")
    buildings["centroid_lon"] = centroids_4326.x
    buildings["centroid_lat"] = centroids_4326.y
    return buildings


def join_to_stadtteile(buildings):
    stadtteile = gpd.read_file(STADTTEILE_GEOJSON, engine="pyogrio")
    stadtteile = stadtteile.set_crs("EPSG:4326", allow_override=True)

    centroids = gpd.GeoDataFrame(
        buildings[["geb_id"]],
        geometry=gpd.points_from_xy(buildings["centroid_lon"], buildings["centroid_lat"]),
        crs="EPSG:4326",
    )
    joined = gpd.sjoin(centroids, stadtteile[["Name", "Nummer", "geometry"]],
                        how="left", predicate="within")
    unmatched = joined["Name"].isna().sum()
    print(f"Buildings not matched to any Stadtteil: {unmatched:,} of {len(joined):,}")

    buildings = buildings.merge(
        joined[["geb_id", "Name"]], on="geb_id", how="left"
    )
    return buildings


def mark_highlighted(buildings):
    buildings = buildings.copy()
    buildings["highlighted"] = False
    for name, group in buildings.groupby("Name"):
        top_ids = group.nlargest(TOP_N_HIGHLIGHTED, "kwh_kwp")["geb_id"]
        buildings.loc[buildings["geb_id"].isin(top_ids), "highlighted"] = True
    return buildings


def write_roof_files(buildings):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    sizes = []
    building_counts = []

    for name, group in buildings.groupby("Name"):
        features = []
        for _, row in group.iterrows():
            features.append({
                "type": "Feature",
                "properties": {
                    "geb_id": row["geb_id"],
                    "total_kwp": round(float(row["kw_sum"]), 1),
                    "total_kwh": round(float(row["str_sum"]), 1),
                    "kwh_kwp": round(float(row["kwh_kwp"]), 1),
                    "facet_count": int(row["n_facets"]),
                    "highlighted": bool(row["highlighted"]),
                },
                "geometry": json.loads(gpd.GeoSeries([row.geometry]).to_json())["features"][0]["geometry"],
            })

        out = {
            "type": "FeatureCollection",
            "properties": {
                "stadtteil": name,
                "qualifying_buildings": len(features),
            },
            "features": features,
        }

        slug = slugify(name)
        out_path = OUT_DIR / f"{slug}.json"
        text = json.dumps(out)
        out_path.write_text(text, encoding="utf-8")

        size_kb = len(text.encode("utf-8")) / 1024
        sizes.append((name, size_kb))
        building_counts.append((name, len(features)))

    return sizes, building_counts


def main():
    buildings = load_qualifying_buildings()
    buildings = reproject_and_simplify(buildings)
    buildings = join_to_stadtteile(buildings)
    buildings = mark_highlighted(buildings)
    sizes, building_counts = write_roof_files(buildings)

    total_kb = sum(s for _, s in sizes)
    largest = max(sizes, key=lambda x: x[1])
    smallest_count = min(building_counts, key=lambda x: x[1])
    largest_count = max(building_counts, key=lambda x: x[1])

    print("\n--- data/roofs/ summary ---")
    print(f"Files written: {len(sizes)}")
    print(f"Total size: {total_kb:,.0f} KB ({total_kb / 1024:.1f} MB)")
    print(f"Largest file: {largest[0]} ({largest[1]:,.0f} KB)")
    print(f"Smallest building count: {smallest_count[0]} ({smallest_count[1]} buildings)")
    print(f"Largest building count: {largest_count[0]} ({largest_count[1]} buildings)")

    over_budget = [s for s in sizes if s[1] > 1024]
    if over_budget:
        print("\nOVER BUDGET (>1 MB per file):")
        for name, kb in over_budget:
            print(f"  {name}: {kb:,.0f} KB")
    if total_kb / 1024 > 25:
        print(f"\nOVER BUDGET: total {total_kb / 1024:.1f} MB exceeds 25 MB")


if __name__ == "__main__":
    main()
