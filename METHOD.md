# Method

How the site's numbers are produced. For what the project does and does not cover, see [SCOPE.md](SCOPE.md).

## The three data sources

Everything traces back to exactly three public datasets, each providing a different kind of fact. Nothing is estimated from a fourth source or from a model of a model.

**Solarkataster NRW** (opengeodata.nrw.de) is a roof-by-roof PV potential cadastre for North Rhine-Westphalia. For every roof facet in Düsseldorf it gives geometry, tilt, compass direction, theoretical kWp and theoretical annual yield at a fixed panel efficiency. This is the only source for **potential**. It carries no field of any kind indicating whether a roof already has solar on it. Roughly 98 MB as a shapefile, about 306,000 facets across about 142,000 buildings.

**Marktstammdatenregister (MaStR)** is Germany's renewable energy registry and the only source for **what is already built**: every registered PV and battery unit, with capacity, technology, commissioning status and location. Addressed by postcode always, by coordinates only for larger installations. Pulled locally via `open-mastr` into a SQLite database, several GB, one-time download.

**ERA5**, via the Open-Meteo Historical Weather API, is the only source for **weather**: hourly global tilted irradiance and air temperature, fetched once per Stadtteil centroid (50 locations) for the full year 2025 and for June 2026.

## The roof rule

A roof counts as suitable if its **building** clears 10 kWp once its qualifying facets are summed. Never tested per facet: a typical pitched roof splits into two or more facets of a few kWp each, so testing 10 kWp against a single facet would exclude most ordinary houses even though the building clearly qualifies. Facets are summed by the cadastre's own building key (`geb_id`) first.

A facet qualifies for that sum unless it is a **north-facing pitched roof face**, checked against the cadastre's own compass field before the building sum. East and west facets stay, which is standard practice. Flat roofs always stay regardless of raw surface tilt, since real flat-roof installations are racked to face south.

Within the qualifying set, buildings are ranked and coloured by the cadastre's own `kwh_kwp` (capacity-weighted specific yield), bucketed into three fixed citywide thresholds (Fair, Good, Excellent) set once from the real distribution, not recomputed per neighbourhood, so "Good" means the same roof quality in every Stadtteil.

Citywide this qualifies **48,475 buildings**, **1,392,501 kWp** of potential, **1,115,838 MWh** of annual yield, an **801.3 kWh/kWp** capacity-weighted specific yield. Against **161,328 kWp** registered in MaStR, that is **11.6%** realization.

## Geography: Stadtteil only

Stadtteil, Düsseldorf's 50 official neighbourhoods, is the only shape drawn on the map. The Solarkataster's geometry is exact, so every building is placed in its Stadtteil by point-in-polygon join.

Existing installations cannot be placed the same way. MaStR's coordinate field is sparse, and sparse by installation size rather than randomly: essentially 0% of PV units under 30 kWp carry coordinates, against 86 to 100% at 30 kWp and above. The pattern is the same for storage, 0.4% overall. Spatial-joining installations by coordinate would keep the handful of commercial systems and silently erase almost the entire residential fleet.

What MaStR does carry reliably for every unit is its postcode. So installed capacity, realization and registered storage are never estimated at Stadtteil level. They appear as **postcode facts**: exact MaStR numbers attributed to their own postcode, shown inside the panel of whichever Stadtteil overlaps it.

Apportioning a postcode's installed capacity across the Stadtteile it touches, weighted by roof potential, was considered and rejected. It rests on an assumption with no empirical support (that PV uptake is proportional to roof potential within a postcode) and it is weakest in exactly the dense central neighbourhoods a visitor is most likely to click. There is therefore no per-Stadtteil realization rate anywhere on the site.

## The heatwave derate model

Panels lose output as they heat up. The site uses the standard NOCT approach, applied to the panel's **cell** temperature, not the surrounding air temperature. Using air temperature directly would understate the effect roughly fourfold.

```
T_cell = T_air + (NOCT - 20) / 800 * GTI      (NOCT = 45 °C)
derate = max(0, (T_cell - 25) * 0.35%)
```

The 0.35%/°C coefficient is a point estimate. The page also states the realistic range, 0.29 to 0.40%/°C, since a city's roof stock spans many module ages and manufacturers. No efficiency gain is modelled below 25 °C.

Düsseldorf's own heatwave window was found from ERA5 rather than assumed to match national headlines: **24 to 28 June 2026**, worst day 26 June at 38.1 °C citywide mean. It is compared against a **matched normal day**, 25 August 2025, chosen by searching 2025's summer for the day whose citywide irradiance total is closest to the heatwave's, so the comparison isolates heat rather than also measuring cloud cover.

Both days' derates are stated against the same baseline, the panel's lab rating at 25 °C. An earlier version measured the heatwave day against the normal day's output instead, which made two percentages read as comparable when they were not.

## The cooling balance

At the heatwave day's afternoon peak hour (15:00), the panel shows what rooftops deliver, what cooling takes, and what is left, all in MW. Not energy over a day, and not an inferred demand curve.

The cooling figure is bottom-up:

```
Düsseldorf households × AC ownership share × 3 kW per split unit × 0.5 diversity
```

Method and coefficients from Jan Rosenow, drawing on Andreou et al. 2020. German AC ownership today, 6%, is Umweltbundesamt. Household count is the city's own statistics office.

Supply is modelled hour by hour from real ERA5 weather. Demand is not: no hourly electricity-consumption dataset exists for Düsseldorf, so the cooling figure is a single cited calculation applied to one hour.

## City electricity consumption

Every "share of the city's electricity" figure is computed against one number: **3,049 GWh**, Düsseldorf's total electricity consumption in 2022.

Landeshauptstadt Düsseldorf, *Energie- und Treibhausgasbilanz 2022*, page 14, table "Energieverbrauch in GWh", row "Strom", summed across the report's own four sectors as it presents them: GHDI 1,599 + KE 107 + HH 1,171 + V 172. Verified against the source PDF before use.

## Data files

| File | Contents |
|---|---|
| `data/stadtteile.json` | Per-Stadtteil roof potential, and the citywide header figures |
| `data/roofs/<slug>.json` | One per Stadtteil, every qualifying building. 50 files, 17 MB total, largest just under 1 MB. Loaded on demand, never all at once |
| `data/plz.json` | Each postcode's own potential, registered PV, realization and storage. No geometry |
| `data/postcode_facts.json` | The Stadtteil-to-postcode breakdown |
| `data/storage_duesseldorf.json` | The 6 Düsseldorf storage units above 100 kW |
| `data/storage_nrw_large.json` | NRW units above 1 MW, for scale |
| `data/generation_scenarios.json` | Hourly rated and derated output, both days, every build-out level |
| `data/coverage.json` | Annual generation against city consumption, per build-out level |
| `data/cooling_balance.json` | The cooling side of the afternoon balance |

Buildings with more than 15 vertices after simplification, mostly large apartment blocks and factory complexes, are drawn as a convex hull rather than their exact outline. Exact shape at that scale cost far more file size than it was worth.

## Rebuilding

Requires Python 3 and the packages in `requirements.txt`. From a clean checkout, in dependency order, no manual steps and no hand-edited paths:

```bash
pip install -r requirements.txt
python3 scripts/fetch_solarkataster.py
python3 scripts/fetch_stadtteile.py
python3 scripts/fetch_plz_boundaries.py
python3 scripts/fetch_mastr.py
python3 scripts/build_stadtteile.py
python3 scripts/build_roofs.py
python3 scripts/compute_roof_quality_bands.py
python3 scripts/build_storage.py
python3 scripts/build_plz.py
python3 scripts/build_postcode_facts.py
python3 scripts/fetch_era5.py
python3 scripts/find_heatwave_window.py
python3 scripts/build_generation.py
python3 scripts/build_coverage.py
python3 scripts/build_cooling_balance.py
```

| Script | What it does |
|---|---|
| `fetch_solarkataster.py` | Downloads the Düsseldorf roof shapefile, skips if present |
| `fetch_stadtteile.py` | Downloads the 50 Stadtteil boundaries |
| `fetch_plz_boundaries.py` | Downloads Germany's postcode boundaries, keeps Düsseldorf's 37. Used only to join buildings to a postcode, never drawn |
| `fetch_mastr.py` | Bulk-downloads MaStR storage, solar and `storage_units` via `open-mastr`. Several GB, 15 to 30 minutes first run. `storage_units` is not optional: it is the only place a battery's usable kWh lives |
| `build_stadtteile.py` | Applies the roof rule, joins buildings to Stadtteile |
| `build_roofs.py` | Writes one file per Stadtteil under `data/roofs/` |
| `compute_roof_quality_bands.py` | Sets the fixed Fair/Good/Excellent thresholds. Writes no data file, re-run only if roof data changes |
| `build_storage.py` | Queries MaStR for large storage, the NRW layer, and citywide totals |
| `build_plz.py` | Aggregates potential to postcode, joins MaStR by `Postleitzahl` |
| `build_postcode_facts.py` | Joins Stadtteil and postcode together |
| `fetch_era5.py` | Hourly irradiance and temperature, 50 centroids, about 100 calls, checkpointed |
| `find_heatwave_window.py` | Finds the heatwave window and matched normal day |
| `build_generation.py` | Hourly rated and derated generation, both days, all build-out levels |
| `build_coverage.py` | Annual generation against the 3,049 GWh consumption figure |
| `build_cooling_balance.py` | The cooling side of the afternoon balance |

Downloaded source files land in `data/raw/`, gitignored. `scripts/common.py` holds the constants shared across these scripts (the roof rule, the derate model, the heatwave window), so a change to any of them lives in one place.
