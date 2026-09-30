# Duesseldorf Solar + Storage Potential

One web page, one map of Duesseldorf. It answers one question: if every suitable roof in the city carried solar, how much would it generate, and what does heat do to that?

The core scenario is every qualifying roof carrying solar; a build-out control also scales that down to today's measured rate, 30%, or 50%, so a visitor can see the potential at less than full build-out too. A real heatwave is then applied on top of the selected build-out, to show how much panels lose to heat, and what that means for a cooling load competing with the same rooftops for electricity. Existing installations (from Germany's own renewable energy registry) are shown alongside as context, to compute a realization rate, never as an input to the potential model itself. It is a portfolio piece, not a research paper or a planning tool: it has to load fast, look competent, and every number on it has to trace to a script in this repo and a named public source.

Full plan, decisions, and the reasoning behind them: [SCOPE.md](SCOPE.md). Read that first; it is the authority this README is checked against.

## Live site

https://bnoone.github.io/duesseldorf-solar-storage/

The header states the potential in four figures (possible capacity, annual generation, what is built already, realization), the map shows roof potential by Stadtteil (neighbourhood), and a side panel runs the heatwave scenario: today's answer first, then a normal-day-versus-heatwave comparison, the controls, and an hourly loss strip. Click a Stadtteil to see its own qualifying buildings and the postcodes it overlaps.

## The three data sources

Everything on the site traces back to exactly three public datasets, each providing a different kind of fact. Nothing is estimated from a fourth source or from a model of a model.

1. **Solarkataster NRW** (opengeodata.nrw.de), a roof-by-roof PV potential cadastre for the state of North Rhine-Westphalia. For every roof facet in Duesseldorf it gives geometry, tilt, compass direction, theoretical kWp, and theoretical annual yield at a fixed panel efficiency. This is the only source for **potential**: it carries no field of any kind indicating whether a roof already has solar installed. Downloaded as a shapefile, roughly 98 MB, ~306,000 facets across ~142,000 buildings in Duesseldorf.
2. **Marktstammdatenregister (MaStR)**, Germany's renewable energy registry. This is the only source for **what is already built**: every registered PV and battery storage unit in the country, with capacity, technology, commissioning status, and location, addressed by postcode always and by coordinates only for larger installations. Pulled locally via the `open-mastr` package into a SQLite database (several GB, one-time download).
3. **ERA5**, via the Open-Meteo Historical Weather API, a reanalysis weather dataset. This is the only source for **weather**: hourly irradiance (global tilted irradiance, the input a solar panel actually sees) and air temperature, fetched once per Stadtteil centroid (50 locations) for the full year 2025 and for June 2026, the month of the heatwave this site models.

## The roof rule

A roof counts as suitable if its **building** clears 10 kWp once its qualifying facets are summed, never tested per facet. A typical pitched roof splits into two or more facets of a few kWp each; testing 10 kWp against a single facet would exclude most ordinary houses even though the building as a whole clearly qualifies. Facets are summed by the cadastre's own building key (`geb_id`) before the 10 kWp test.

A facet qualifies for that sum unless it is a **north-facing pitched roof face** (the cadastre's own compass field, checked before the building sum). East and west-facing facets stay, that is standard practice. Flat roofs always stay regardless of their raw surface tilt, since real installations on flat roofs are racked to face south.

Within the qualifying set, buildings are ranked and colour-coded by the cadastre's own **`kwh_kwp`** (capacity-weighted specific yield: a building's total annual yield divided by its total kWp), bucketed into three fixed, citywide thresholds (Fair, Good, Excellent) set once from the real distribution, not recomputed per neighbourhood, so "Good" means the same roof quality in every Stadtteil.

Citywide, this rule qualifies 48,475 buildings, 1,392,501 kWp of potential, 1,115,838 MWh of annual yield, an 801.3 kWh/kWp capacity-weighted specific yield. Against 161,328 kWp registered (MaStR), that is 11.6% realization.

## Geography: Stadtteil only

**Stadtteil (Duesseldorf's 50 official neighbourhoods) is the only shape drawn on the map.** The Solarkataster's geometry is exact, so every building can be reliably placed in its Stadtteil by a point-in-polygon join.

Existing installations cannot be placed the same way. MaStR's coordinate field is sparse and sparse by installation size, not randomly: essentially 0% of PV units under 30 kWp carry coordinates, versus 86-100% at 30 kWp and above (the pattern is the same for storage, 0.4% overall). Spatial-joining installations onto Stadtteil shapes by coordinate would keep the handful of commercial systems and silently erase almost the entire residential fleet, the majority of units. What MaStR does carry reliably, for every unit, is its postcode (`Postleitzahl`).

So installed capacity, realization, and registered storage are never estimated at Stadtteil level. They are shown as **postcode facts**, exact MaStR numbers attributed to their own postcode, inside the panel of whichever Stadtteil overlaps that postcode. A Stadtteil typically overlaps more than one postcode and a postcode typically overlaps more than one Stadtteil, so apportioning a postcode's installed capacity across the Stadtteile it touches, weighted by roof potential, would rest on an assumption (that PV uptake is proportional to roof potential within a postcode) with no empirical support, and it would be weakest in exactly the dense central neighbourhoods a visitor is most likely to click. Rather than estimate a per-Stadtteil realization rate on that assumption, the site states postcode figures as postcode figures and leaves it there.

## The heatwave derate model

Solar panels lose output as they heat up. The site models this with the standard NOCT (nominal operating cell temperature) approach, applied to the panel's **cell** temperature, not the surrounding air temperature (using air temperature directly would understate the effect roughly fourfold):

```
T_cell = T_air + (NOCT - 20) / 800 * GTI      (NOCT = 45 degC)
derate = max(0, (T_cell - 25) * 0.35%)
```

The 0.35%/degC coefficient is a point estimate; the page also states the realistic range, -0.29 to -0.40%/degC, since a city's roof stock spans many module ages and manufacturers. No efficiency gain is modelled below 25 degC.

Duesseldorf's own heatwave window was found from ERA5 rather than assumed to match national headlines: 24-28 June 2026, worst day 26 June at 38.1 degC citywide mean. It is compared against a matched normal day, 25 August 2025, chosen by searching 2025's summer for the day whose citywide irradiance total is closest to the heatwave's, so the comparison isolates heat rather than also measuring cloud cover.

**Both the normal day's and the heatwave day's derate are stated as a percentage lost against the same baseline: the panel's lab rating (its undegraded output at 25 degC).** An earlier version of this comparison measured the two days against different baselines (the heatwave day against the normal day's own output, not the lab rating), which made the two percentages read as comparable when they were not. Both now share one baseline, so they can be read side by side honestly.

## City electricity consumption

Every "share of the city's electricity" figure on the site is computed against one number: **3,049 GWh**, Duesseldorf's total electricity consumption in 2022.

Source: Landeshauptstadt Duesseldorf, *Energie- und Treibhausgasbilanz 2022* (Amt fuer Umwelt- und Verbraucherschutz), page 14, table "Energieverbrauch in GWh", row "Strom", summed across the report's own four sectors as it presents them (GHDI 1,599 + KE 107 + HH 1,171 + V 172 = 3,049 GWh). Verified against the actual source PDF before use, not recalled from memory. [PDF](https://www.duesseldorf.de/fileadmin/Amt19/umweltamt/klimaschutz/pdf/klimaschutz/19_Klimafreundliches_Duesseldorf_2022_web_bf.pdf)

## What is deliberately out of scope

- **Economics.** No capex, no tariffs, no payback, no ROI. This site states physical potential, not a financial case; adding one would need cost assumptions this project has no authority to pick.
- **Dispatch and storage shifting.** No charge and discharge schedules, no round-trip efficiency, no comparing battery sizes by how much midday surplus they can shift to the evening. Storage appears only as a capacity this much solar would justify, a plain fact, not an argument about how it would be operated.
- **Load profiles and self-consumption modelling.** German standard load profiles (BDEW) are public and could support this, but modelling actual household demand doubles the modelling surface for a project that is about rooftop potential, not household operation. Excluded by choice, not by data availability.
- **Multi-year climate averaging.** The site names two specific, checked years (2025 for annual generation, June 2026 for the heatwave) rather than an averaged "typical year", so a reader always knows exactly which real weather produced a given number.

Anything outside Duesseldorf, and any frontend framework or build step, are out of scope for the same reason: this is a static site with one clear subject.

## Rebuilding the data

Requires Python 3 and the packages in `requirements.txt`. From a clean checkout, this one sequence rebuilds every data file the site reads, in dependency order, with no manual steps or hand-edited paths:

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

- `fetch_solarkataster.py` downloads the Duesseldorf roof-potential shapefile (opengeodata.nrw.de, skips if already present).
- `fetch_stadtteile.py` downloads the 50 Stadtteil boundaries (Open Data Duesseldorf).
- `fetch_plz_boundaries.py` downloads Germany's postcode boundaries (yetzt/postleitzahlen, OSM-derived) and keeps Duesseldorf's 37 postcodes; used only to join buildings to a postcode, never drawn on the map.
- `fetch_mastr.py` bulk-downloads the MaStR storage, solar, and `storage_units` tables via `open-mastr` into a local SQLite database (several GB, 15-30 minutes on a first run). `storage_units` is not optional: it is the only place a battery's usable kWh actually lives.
- `build_stadtteile.py` applies the roof rule, spatial-joins buildings to Stadtteile, and writes `data/stadtteile.json`.
- `build_roofs.py` writes one file per Stadtteil under `data/roofs/`, every qualifying building's geometry and figures, loaded on demand when that Stadtteil is clicked.
- `compute_roof_quality_bands.py` sets the fixed Fair/Good/Excellent `kwh_kwp` thresholds from the real citywide distribution. Writes no data file; re-run only if the underlying roof data changes.
- `build_storage.py` queries MaStR for Duesseldorf's large storage units, an NRW-wide layer for scale, and the citywide unit count, kW, and usable kWh.
- `build_plz.py` aggregates the same building-level potential to postcode and joins registered PV and storage from MaStR's `Postleitzahl` field. Writes `data/plz.json`, no geometry.
- `build_postcode_facts.py` joins Stadtteil and postcode together and writes `data/postcode_facts.json`, the breakdown shown in each Stadtteil's panel.
- `fetch_era5.py` fetches hourly irradiance and temperature for all 50 Stadtteil centroids, full year 2025 plus June 2026 (about 100 calls, checkpointed so a rerun after a network failure does not re-fetch what it already has).
- `find_heatwave_window.py` finds Duesseldorf's own heatwave window and matched normal day from that data.
- `build_generation.py` computes hourly rated and derated generation for both days across every build-out level. Writes `data/generation_scenarios.json`.
- `build_coverage.py` sets annual generation at each build-out level against the city's 3,049 GWh consumption figure. Writes `data/coverage.json`.
- `build_cooling_balance.py` computes the cooling side of the heatwave-afternoon balance shown in the panel. Writes `data/cooling_balance.json`.

Downloaded source files land in `data/raw/`, gitignored, not committed. `scripts/common.py` holds the constants and rules shared across these scripts (the roof rule, the derate model, the found heatwave window), so a change to any of them lives in one place.

**Python precomputes everything; the browser only displays a precomputed value.** GitHub Pages serves static files and cannot run Python, so every scenario the panel can show is calculated once by these scripts and written to static JSON in `/data`. The site itself is `index.html`, `app.js`, and `style.css`: plain HTML, vanilla JavaScript, and Leaflet for the map, no framework and no build step.
