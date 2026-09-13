# Duesseldorf Solar + Storage Potential

One web page, one map of Duesseldorf, answering one question: how much rooftop solar could this city have, and how much battery storage would that call for.

Full plan, decisions, and reasoning: [SCOPE.md](SCOPE.md). Read that first.

## Live site

https://bnoone.github.io/duesseldorf-solar-storage/

Shows the 50 Duesseldorf Stadtteile, coloured by roof potential (kWp). The scenario panel, the PLZ layer for existing installations, and the building drill-down are not wired up yet.

## What is built so far

- `index.html` / `app.js` / `style.css`: the map. Plain HTML, vanilla JavaScript, Leaflet from a CDN, OpenStreetMap tiles. No build step, no framework.
- The Stadtteil layer: filled polygons coloured by total roof potential (kWp), a quantile-binned sequential scale (ColorBrewer Oranges, 5 classes) rather than a linear one, since Bilk's 89,536 kWp against Knittkuhl's 3,863 kWp would flatten a linear scale's middle. A legend shows the actual kWp value at each bin edge. Hovering a Stadtteil highlights it and shows its name; clicking opens a popup with qualifying buildings, roof potential, annual yield, and battery potential. The header totals and footer pull date are read live from `data/stadtteile.json`, not hardcoded.
- `data/stadtteile.json`: per-Stadtteil roof potential, precomputed.

## Reproducing the data

Requires Python 3 and the packages in `requirements.txt`.

```bash
pip install -r requirements.txt
python3 scripts/fetch_solarkataster.py
python3 scripts/fetch_stadtteile.py
python3 scripts/build_stadtteile.py
```

- `fetch_solarkataster.py` downloads the Solarkataster NRW roof-potential shapefile for Duesseldorf (opengeodata.nrw.de, ~98 MB, skips if already present).
- `fetch_stadtteile.py` downloads the 50 Duesseldorf Stadtteil boundaries (Open Data Duesseldorf, already in WGS84).
- `build_stadtteile.py` sums Solarkataster facets by building (`geb_id`), keeps buildings at or above 10 kWp, reprojects to WGS84, spatial-joins buildings into Stadtteile, and writes `data/stadtteile.json`.

Downloaded source files land in `data/raw/`, gitignored, not committed.
