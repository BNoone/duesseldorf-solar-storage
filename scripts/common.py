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
