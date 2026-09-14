"""
Shared constants and helpers for the Solarkataster build scripts.

Pulled out after build_stadtteile.py and build_roofs.py both needed the
exact same north-facing exclusion rule. Keeping it in one place means a
future change to the rule cannot drift between the two scripts the way the
registered PV figure once did between SCOPE.md's sections.
"""

from pathlib import Path

BASE = Path(__file__).resolve().parent.parent

SOLARKATASTER_SHP = (
    BASE / "data" / "raw" / "solarkataster"
    / "Solarkataster-Potentiale-Photovoltaik_05111000_Duesseldorf.shp"
)
STADTTEILE_GEOJSON = BASE / "data" / "raw" / "stadtteile_wgs84.geojson"

MIN_KWP_PER_BUILDING = 10.0
BATTERY_KWH_PER_KWP = 1.5

QUALIFYING_RULE_SENTENCE = (
    "North-facing roof faces are excluded. "
    "Flat roofs count, since panels on them are angled south."
)

# Registered PV capacity, Duesseldorf, from the local MaStR pull, queried
# directly against ~/.open-MaStR/data/sqlite/open-mastr.db (dated
# 2026-07-10):
#   SELECT SUM(Bruttoleistung) FROM solar_extended
#   WHERE Landkreis = 'Duesseldorf' AND Energietraeger = 'Solare Strahlungsenergie'
# Result: 161,327.6 kWp across 11,804 units.
REGISTERED_PV_KWP = 161_327.6

# --- Heatwave derate model (SCOPE.md section 4, decided, do not re-open) ---

# Temperature coefficient on Pmax, percent per degree C of CELL temperature
# (never air temperature, which understates the derate roughly fourfold).
# -0.35%/degC is the point estimate; the page states the -0.29 to -0.40
# range too, since a city's roof stock spans many module ages and makers.
TEMP_COEFF_PCT_PER_C = -0.35
TEMP_COEFF_RANGE_PCT_PER_C = (-0.29, -0.40)

# NOCT cell temperature model. T_cell = T_air + (NOCT - 20) / 800 * GTI.
NOCT_C = 45.0

# Derate = max(0, (T_cell - 25) * 0.35%). No efficiency gain modelled below
# 25 degC.
DERATE_REFERENCE_TEMP_C = 25.0

# GTI fetch convention, matching fetch_era5.py and the v1-validated choice.
GTI_TILT_DEG = 35
GTI_AZIMUTH_DEG = 0  # Open-Meteo convention: 0 = south

# Heatwave window and matched normal day, found by
# scripts/find_heatwave_window.py from the fetched ERA5 data (citywide mean
# across the 50 Stadtteil centroids). Germany's national records on 26-28
# June 2026 were set in Saarland and Brandenburg; Duesseldorf's own peak
# lands one day later than the coolest edge of that window and one day
# earlier at the hot edge, a five-day stretch, not a single day.
HEATWAVE_WINDOW = ["2026-06-24", "2026-06-25", "2026-06-26", "2026-06-27", "2026-06-28"]
HEATWAVE_WORST_DAY = "2026-06-26"  # 38.1 degC citywide mean daily max
MATCHED_NORMAL_DAY = "2025-08-25"  # GTI within 0.6% of the worst day, max temp 24.2 degC

# Duesseldorf electricity consumption, 2022, Landeshauptstadt Duesseldorf,
# "Energie- und Treibhausgasbilanz 2022" (Amt fuer Umwelt- und
# Verbraucherschutz), page 14, "Energieverbrauch in GWh" table, Strom row,
# summed across all four sectors as the report itself presents it:
#   GHDI 1,599 + KE 107 + HH 1,171 + V 172 = 3,049 GWh
# Source: https://www.duesseldorf.de/fileadmin/Amt19/umweltamt/klimaschutz/pdf/klimaschutz/19_Klimafreundliches_Duesseldorf_2022_web_bf.pdf
CITY_ELECTRICITY_CONSUMPTION_GWH = 3049.0
CITY_ELECTRICITY_CONSUMPTION_YEAR = 2022


def exclude_north_facing_pitched(facets):
    """Drop facets where dachtyp == 'geneigt' and himmel_kat == 'Nord'.

    Flat roofs carry himmel_kat == 'Flach', never 'Nord', so they are
    untouched by this filter without needing a separate dachtyp check on
    their side; the geneigt condition is kept explicit anyway so the rule
    reads the same way it is written in SCOPE.md section 3.
    """
    north_pitched = (facets["dachtyp"] == "geneigt") & (facets["himmel_kat"] == "Nord")
    excluded_kwp = facets.loc[north_pitched, "kw"].sum()
    print(f"North-facing pitched facets excluded: {north_pitched.sum():,} ({excluded_kwp:,.1f} kWp)")
    return facets[~north_pitched].copy()


def slugify(name):
    """German-aware slug: lowercase, umlauts transliterated, spaces to hyphens."""
    replacements = {
        "ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss",
        "Ä": "Ae", "Ö": "Oe", "Ü": "Ue",
    }
    out = name
    for src, dst in replacements.items():
        out = out.replace(src, dst)
    out = out.lower().strip()
    out = "".join(c if c.isalnum() else "-" for c in out)
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-")
