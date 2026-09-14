# Duesseldorf Solar + Storage Potential

One web page, one map of Duesseldorf, answering one question: how much rooftop solar could this city have, and how much battery storage would that call for.

Full plan, decisions, and reasoning: [SCOPE.md](SCOPE.md). Read that first.

## Live site

https://bnoone.github.io/duesseldorf-solar-storage/

Shows the 50 Duesseldorf Stadtteile, coloured by roof potential (kWp), the only geography on the map. Click one to see every qualifying building in it, plus the postcodes it sits in and their own exact PV, realization, and storage figures. Toggle the storage layer to see Duesseldorf's large battery units and NRW's for scale. The scenario panel is not wired up yet.

## What is built so far

- `index.html` / `app.js` / `style.css`: the map. Plain HTML, vanilla JavaScript, Leaflet from a CDN, OpenStreetMap tiles. No build step, no framework.
- The Stadtteil layer, the only geography on the map: filled polygons coloured by total roof potential (kWp), a quantile-binned sequential scale (ColorBrewer Oranges, 5 classes) rather than a linear one, since Bilk's 89,536 kWp against Knittkuhl's 3,863 kWp would flatten a linear scale's middle. A legend shows the actual kWp value at each bin edge. Every Stadtteil shows its name on hover; the 15 largest by area also carry a permanent label, so the map reads as named neighbourhoods without needing to hover each one. The header totals, the realization rate, and the footer pull date are read live from `data/stadtteile.json`, not hardcoded.
- The map's initial zoom is fixed after load: header and footer text (which affects the map container's flex height) is written to the DOM before `map.invalidateSize()` and `map.fitBounds()` run, and both are deferred to a `requestAnimationFrame` so Leaflet measures the container after the browser has finished laying it out, not before.
- The header also shows the citywide realization rate: registered PV (MaStR) divided by roof potential. Currently 11.6%, exact, the same figure regardless of geography, so it needs no postcode or neighbourhood breakdown.
- A one-sentence rule under the header states what counts as a suitable roof: north-facing pitched roof faces are excluded, flat roofs always count.
- The building drill-down: clicking a Stadtteil hides the choropleth, loads that Stadtteil's `data/roofs/<slug>.json` on demand, and draws every qualifying building. The 20 highest-yield buildings in that Stadtteil are filled gold, the rest orange, same dataset, no separate layer. A panel shows that Stadtteil's own numbers (qualifying buildings, roof potential, annual yield, battery potential) plus the suitability rule in one sentence, so the city-wide header stays visible and a visitor never loses context. A back button restores the citywide view. Clicking a building opens a popup with its roof potential, annual yield, specific yield, and facet count.
- The postcode breakdown, inside the same panel: every postcode the clicked Stadtteil overlaps, ordered by that postcode's share of the Stadtteil's own roof potential, each with its own exact installed PV, own roof potential, own realization rate, and registered storage (units and kWh), never apportioned to the neighbourhood. Headline reads "Mostly in postcode 40233" when one postcode holds 70% or more of the Stadtteil's potential, otherwise "Spans 40213, 40210, 40211". A one-sentence note explains why: the national registry publishes no location finer than postcode for systems under 30 kWp. There is no per-Stadtteil realization rate anywhere on the page; see SCOPE.md's v2.3 changelog for why that was rejected.
- `data/stadtteile.json`: per-Stadtteil roof potential, precomputed. North-facing pitched facets are excluded before the building sum, see `build_stadtteile.py`.
- `data/roofs/<slug>.json`: one file per Stadtteil, every qualifying building in it (geometry, kWp, kWh, capacity-weighted kwh_kwp, facet count, and whether it is one of the 20 highest-yield in that Stadtteil), loaded only when that Stadtteil is clicked, never all 50 at once. 50 files, 17 MB total, largest (Bilk) just under 1 MB. Buildings with more than 15 vertices after simplification (mostly large apartment blocks and factory complexes) are shown as a convex hull instead of their exact outline, since exact shape at that scale cost far more file size than it was worth.
- The storage layer, off by default, toggled from the LAYERS panel: the 6 Duesseldorf storage units above 100 kW, plotted at their real coordinates, sized roughly by capacity so the planned 10 MW unit in PLZ 40549 is unmistakably the largest object on the layer. It is drawn with a dashed outline and low fill opacity rather than solid fill, and its popup opens with "Not yet built, In Planung" in place, because it has not been built. A second toggle shows NRW-wide units above 1 MW as small grey dots for scale, with a note that most of them sit outside Duesseldorf and need zooming out to see. Home batteries (the other 6,654 Duesseldorf units) are never plotted; their counts and kWh appear as postcode facts in the Stadtteil panel instead, same pattern as PV.
- `data/storage_duesseldorf.json` / `data/storage_nrw_large.json`: the two storage map datasets above, precomputed from the local MaStR pull.
- `data/plz.json`: each Duesseldorf postcode's own exact roof potential, registered PV, realization, and registered storage (units and kWh). Not a map layer, carries no geometry; it exists only to feed the postcode breakdown below.
- `data/postcode_facts.json`: the Stadtteil-to-postcode breakdown itself, one entry per Stadtteil, each an ordered list of the postcodes it overlaps with their own facts attached from `data/plz.json`.

## Reproducing the data

Requires Python 3 and the packages in `requirements.txt`.

```bash
pip install -r requirements.txt
python3 scripts/fetch_solarkataster.py
python3 scripts/fetch_stadtteile.py
python3 scripts/fetch_plz_boundaries.py
python3 scripts/fetch_mastr.py
python3 scripts/build_stadtteile.py
python3 scripts/build_roofs.py
python3 scripts/build_storage.py
python3 scripts/build_plz.py
python3 scripts/build_postcode_facts.py
python3 scripts/fetch_era5.py
python3 scripts/find_heatwave_window.py
python3 scripts/build_generation.py
```

- `fetch_solarkataster.py` downloads the Solarkataster NRW roof-potential shapefile for Duesseldorf (opengeodata.nrw.de, ~98 MB, skips if already present).
- `fetch_stadtteile.py` downloads the 50 Duesseldorf Stadtteil boundaries (Open Data Duesseldorf, already in WGS84).
- `fetch_plz_boundaries.py` downloads all of Germany's postcode boundaries (yetzt/postleitzahlen, OSM-derived, ODbL, about 500 MB decompressed), streams through them without loading the whole file, and keeps only Duesseldorf's 37 postcodes (40210-40629, Deutsche Post's own range; a plain "starts with 40" match would wrongly pull in Ratingen too). These boundaries are used only to join buildings to a postcode; nothing from this file is ever drawn on the map.
- `fetch_mastr.py` bulk-downloads the MaStR storage, solar, and storage_units tables into a local SQLite database via `open-mastr`. Several GB, 15-30 minutes on a first run; skips the download if the database already has data. storage_units is not optional: it is the only place a battery's usable kWh actually lives, storage_extended's own copy of that field is null for every row, always.
- `build_stadtteile.py` drops north-facing pitched facets, sums the rest by building (`geb_id`), keeps buildings at or above 10 kWp, reprojects to WGS84, spatial-joins buildings into Stadtteile, and writes `data/stadtteile.json`.
- `build_roofs.py` does the same filtering and building sum, then dissolves each qualifying building's facets into one footprint, simplifies it, and writes one file per Stadtteil under `data/roofs/`.
- `build_storage.py` queries the local MaStR database for Duesseldorf units above 100 kW, NRW units above 1 MW, and the Duesseldorf citywide unit count and combined capacity, and writes the two storage map JSON files.
- `build_plz.py` reuses `build_stadtteile.py`'s building-level potential, aggregates it to postcode instead of Stadtteil, joins registered PV and registered storage (via the storage_units kWh join) from MaStR's own `Postleitzahl` field, and writes `data/plz.json`. No geometry in the output; nothing renders this as a shape.
- `build_postcode_facts.py` joins the same building-level potential to both Stadtteil and PLZ at once, computes each Stadtteil's share of potential per overlapping postcode, attaches that postcode's own facts from `data/plz.json`, and writes `data/postcode_facts.json`.
- `fetch_era5.py` fetches hourly global tilted irradiance and air temperature for all 50 Stadtteil centroids, full year 2025 plus June 2026, from Open-Meteo's ERA5 archive. About 100 calls, 5-10 minutes; cached to `data/raw/era5_checkpoint.json` with a fetch-retry-checkpoint pattern, so a rerun after a network failure never re-fetches what it already has.
- `find_heatwave_window.py` reads that cache and finds Duesseldorf's own heatwave window in June 2026 (24-28 June, worst day 26 June at 38.1 degC citywide mean) and a matched normal day from 2025 (25 August, GTI within 0.6% of the heatwave's worst day, so the comparison isolates heat rather than also measuring cloud cover). Both are recorded in `common.py` for the build scripts that use them.
- `build_generation.py` is the spine of the scenario panel: hourly rated and derated generation on the matched normal day and across the full heatwave window, at every build-out level (11.6%, 30%, 50%, 100%), both citywide and per Stadtteil. Derate uses the NOCT cell temperature model and the -0.35%/degC coefficient applied to cell temperature. Rated generation scales real ERA5 irradiance so the full 2025 year reproduces each Stadtteil's cadastre annual yield exactly at 100% build-out, so this never becomes a second, disagreeing generation figure. Writes `data/generation_scenarios.json` (8 precomputed scenario combinations, 44 KB). Not wired into the page yet.
- `common.py` holds the constants and the exclusion rule shared by the roof-potential build scripts, so the rule cannot drift between them, plus the heatwave derate model constants and the found heatwave window and matched normal day.

Downloaded source files land in `data/raw/`, gitignored, not committed.
