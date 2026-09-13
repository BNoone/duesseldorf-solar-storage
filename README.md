# Duesseldorf Solar + Storage Potential

One web page, one map of Duesseldorf, answering one question: how much rooftop solar could this city have, and how much battery storage would that call for.

Full plan, decisions, and reasoning: [SCOPE.md](SCOPE.md). Read that first.

## Live site

https://bnoone.github.io/duesseldorf-solar-storage/

Shows the 50 Duesseldorf Stadtteile, coloured by roof potential (kWp). Click one to see every qualifying building in it. Toggle the storage layer to see Duesseldorf's large battery units and NRW's for scale. Switch the VIEW control to see realization by postcode instead. The scenario panel is not wired up yet.

## What is built so far

- `index.html` / `app.js` / `style.css`: the map. Plain HTML, vanilla JavaScript, Leaflet from a CDN, OpenStreetMap tiles. No build step, no framework.
- The Stadtteil layer: filled polygons coloured by total roof potential (kWp), a quantile-binned sequential scale (ColorBrewer Oranges, 5 classes) rather than a linear one, since Bilk's 89,536 kWp against Knittkuhl's 3,863 kWp would flatten a linear scale's middle. A legend shows the actual kWp value at each bin edge. Every Stadtteil shows its name on hover; the 15 largest by area also carry a permanent label, so the map reads as named neighbourhoods without needing to hover each one. The header totals, the realization rate, and the footer pull date are read live from `data/stadtteile.json`, not hardcoded.
- The map's initial zoom is fixed after load: header and footer text (which affects the map container's flex height) is written to the DOM before `map.invalidateSize()` and `map.fitBounds()` run, and both are deferred to a `requestAnimationFrame` so Leaflet measures the container after the browser has finished laying it out, not before.
- The header also shows the citywide realization rate: registered PV (MaStR) divided by roof potential. Currently 11.6%, the most interesting number the project produces.
- A one-sentence rule under the header states what counts as a suitable roof: north-facing pitched roof faces are excluded, flat roofs always count.
- The building drill-down: clicking a Stadtteil hides the choropleth, loads that Stadtteil's `data/roofs/<slug>.json` on demand, and draws every qualifying building. The 20 highest-yield buildings in that Stadtteil are filled gold, the rest orange, same dataset, no separate layer. A panel replaces the old Stadtteil popup, showing that Stadtteil's own numbers (qualifying buildings, roof potential, annual yield, battery potential) plus the suitability rule in one sentence, so the city-wide header stays visible and a visitor never loses context. A back button restores the citywide view. Clicking a building opens a popup with its roof potential, annual yield, specific yield, and facet count.
- `data/stadtteile.json`: per-Stadtteil roof potential, precomputed. North-facing pitched facets are excluded before the building sum, see `build_stadtteile.py`.
- `data/roofs/<slug>.json`: one file per Stadtteil, every qualifying building in it (geometry, kWp, kWh, capacity-weighted kwh_kwp, facet count, and whether it is one of the 20 highest-yield in that Stadtteil), loaded only when that Stadtteil is clicked, never all 50 at once. 50 files, 17 MB total, largest (Bilk) just under 1 MB. Buildings with more than 15 vertices after simplification (mostly large apartment blocks and factory complexes) are shown as a convex hull instead of their exact outline, since exact shape at that scale cost far more file size than it was worth.
- The storage layer, off by default, toggled from the LAYERS panel: the 6 Duesseldorf storage units above 100 kW, plotted at their real coordinates, sized roughly by capacity so the planned 10 MW unit in PLZ 40549 is unmistakably the largest object on the layer. It is drawn with a dashed outline and low fill opacity rather than solid fill, and its popup opens with "Not yet built, In Planung" in place, because it has not been built. A second toggle shows NRW-wide units above 1 MW as small grey dots for scale, with a note that most of them sit outside Duesseldorf and need zooming out to see. A permanent note in the panel states the honest citywide line: Duesseldorf has 6,660 registered storage units totalling 50,512 kW, and only 28 of them carry usable coordinates, so the rest (home batteries) are never plotted as points.
- `data/storage_duesseldorf.json` / `data/storage_nrw_large.json`: the two storage datasets above, precomputed from the local MaStR pull.
- The PLZ realization view, switched from the VIEW control: the same building-level roof potential aggregated to Duesseldorf's 37 postcodes instead of its 50 Stadtteile, coloured by realization rate (registered PV divided by potential) on its own quantile-binned green scale, so it never looks like the orange potential view. A note in the control panel states why the two views use different shapes: potential by neighbourhood, existing installations by postcode, because postcode is the finest location MaStR publishes for systems under 30 kWp. Realization ranges from 0.7% (PLZ 40213) to 40.0% (PLZ 40474) across the city.
- `data/plz.json`: per-postcode roof potential and registered PV, precomputed.

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
```

- `fetch_solarkataster.py` downloads the Solarkataster NRW roof-potential shapefile for Duesseldorf (opengeodata.nrw.de, ~98 MB, skips if already present).
- `fetch_stadtteile.py` downloads the 50 Duesseldorf Stadtteil boundaries (Open Data Duesseldorf, already in WGS84).
- `fetch_plz_boundaries.py` downloads all of Germany's postcode boundaries (yetzt/postleitzahlen, OSM-derived, ODbL, about 500 MB decompressed), streams through them without loading the whole file, and keeps only Duesseldorf's 37 postcodes (40210-40629, Deutsche Post's own range; a plain "starts with 40" match would wrongly pull in Ratingen too).
- `fetch_mastr.py` bulk-downloads the MaStR storage and solar tables into a local SQLite database via `open-mastr`. Several GB, 15-30 minutes on a first run; skips the download if the database already has data.
- `build_stadtteile.py` drops north-facing pitched facets, sums the rest by building (`geb_id`), keeps buildings at or above 10 kWp, reprojects to WGS84, spatial-joins buildings into Stadtteile, and writes `data/stadtteile.json`.
- `build_roofs.py` does the same filtering and building sum, then dissolves each qualifying building's facets into one footprint, simplifies it, and writes one file per Stadtteil under `data/roofs/`.
- `build_storage.py` queries the local MaStR database for Duesseldorf units above 100 kW, NRW units above 1 MW, and the Duesseldorf citywide unit count and combined capacity, and writes the two storage JSON files.
- `build_plz.py` reuses `build_stadtteile.py`'s building-level potential, aggregates it to postcode instead of Stadtteil, joins registered PV from MaStR's own `Postleitzahl` field, and writes `data/plz.json`.
- `common.py` holds the constants and the exclusion rule shared by the roof-potential build scripts, so the rule cannot drift between them.

Downloaded source files land in `data/raw/`, gitignored, not committed.
