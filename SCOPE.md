# Düsseldorf Solar + Storage Potential Map · Scope v2

**Status:** active
**Replaces:** iteration 1 (`NRW_BESS_Screener`, now private and archived)
**Written:** 2026-09-12

Read this file at the start of every session, before anything else. If the repo and this file disagree, that gets fixed before new work starts.

---

## 1. What this is

**One web page. One map. A few toggles.** A visitor opens it, sees Düsseldorf, and can answer one question: *how much rooftop solar could this city have, and how much battery storage would that call for?*

It is a portfolio piece for hiring managers. It has to load fast on a laptop, look competent, and every number on it has to trace to a named public source. It is not a research paper, not a planning tool, and not a simulation.

## 2. The page

```
+--------------------------------------------------+
|  Düsseldorf Solar + Storage Potential             |
+---------------------------+----------------------+
|                           |  LAYERS              |
|                           |  [x] Solar potential |
|         THE MAP           |  [ ] Existing PV     |
|    (PLZ areas, click      |  [ ] Existing BESS   |
|     one to drill into     |                      |
|     its best roofs)       |  SCENARIOS           |
|                           |  [ ] Heatwave: PV    |
|                           |      derate          |
|                           |  [ ] Heatwave: AC    |
|                           |      demand surge    |
|                           |  Built out: 14% /    |
|                           |      30% / 50%       |
|                           |                      |
|                           |  NUMBERS             |
|                           |  (update live as     |
|                           |   toggles change)    |
+---------------------------+----------------------+
```

One map. Layer checkboxes decide what is drawn on it. The scenario panel changes the numbers. Nothing navigates away.

## 3. The data model: PLZ first, buildings second

This is the core of the project. **Potential is the subject, not inventory.**

### Level 1 · Postcode (PLZ)

Every Düsseldorf postcode gets one shape on the map carrying:

| Field | Meaning |
|---|---|
| Roof potential (kWp) | Sum of suitable roof area in this PLZ |
| Annual yield (MWh) | What that PV would generate in a normal year |
| Suitable roofs (count) | How many buildings clear the suitability bar |
| Existing PV (kWp) | What is already registered here, from MaStR |
| Realization rate (%) | Existing ÷ potential |
| **Battery potential (kWh)** | Derived from PV potential, see below |
| Existing BESS (kWh, units) | What batteries are already registered here |

### Level 2 · Buildings, on click

Clicking a PLZ zooms in and draws **only the best roofs**, not all of them. Most roofs are not worth showing: wrong orientation, too shaded, too small.

**The suitability rule is two fields, both already in the cadastre:**

1. Rank by the Solarkataster's own specific yield (`kwh_kwp`)
2. Require kWp ≥ 10

Orientation, tilt and shading are deliberately *not* separate filters. The cadastre's specific yield already reflects all three, so filtering on them again would double-count and make the rule harder to explain.

The page must say, in one sentence, what "suitable" means. A visitor who cannot see the rule cannot trust the map.

### Battery potential, and where the number comes from

Battery potential is derived from solar potential, using the published HTW Berlin sizing recommendation: **usable storage capacity should not exceed 1.5 kWh per 1 kW of PV output**. That is an upper bound for sensible home storage, not a forecast.

So: `battery potential (kWh) = roof potential (kWp) × 1.5`

Labelled on the page as "sensible upper bound, HTW Berlin sizing recommendation", with the link. If a better source turns up, swap the coefficient in one place.

Source: [HTW Berlin, Empfehlungen zur Auslegung von Solarstromspeichern](https://solar.htw-berlin.de/publikationen/auslegung-von-solarstromspeichern/)

### Existing BESS, shown as postcode clusters

Only 29 of 6,672 Düsseldorf battery units carried usable coordinates in the last pull. So existing batteries are shown **aggregated to their postcode**, matching the potential layer. A cluster reading "PLZ 40233 · 214 units · 2.9 MWh" is honest. A dot pretending to be one battery at an invented address is not.

**Blocking check:** MaStR must carry a usable postcode or `Ort` field for units without coordinates. Verify this before building anything in this layer.

## 4. The scenario panel

Three controls. Each one changes numbers that are already on screen.

### Toggle 1 · Heatwave: PV derate

Hot panels produce less. Applies a temperature derate using a standard module temperature coefficient and a cell temperature model.

**The heatwave is a real, named event, not an abstraction.** Germany broke its all-time national temperature record on three consecutive days in late June 2026 (41.3 °C Saarbrücken on the 26th, 41.5 °C Drewitz on the 27th, 41.7 °C Coschen on the 28th), and NRW was affected enough that regional rail was suspended for six hours. Pull the actual Düsseldorf ERA5 temperature and irradiance for that window and derate against it.

The page then says something concrete: *"During the record heat of 26 to 28 June 2026, these rooftops would have produced X% less than a normal summer day."*

Source: [2026 European heatwaves](https://en.wikipedia.org/wiki/2026_European_heatwaves)

### Toggle 2 · Heatwave: AC demand surge

Evening demand rises during heat. Applies a demand multiplier.

There is no Düsseldorf consumption dataset. Either find one citable source for the multiplier, or ship the toggle labelled "illustrative assumption, not measured" with the assumption written next to it. Both are acceptable. Silently inventing a number is not.

### Control 3 · Built out at 14% / 30% / 50%

Steps, not a free slider. Shows what the city's generation and battery potential look like if more of the rooftop potential were actually built. 14% is today's measured realization rate.

## 5. Two weather years, on purpose

| Used for | Year | Why |
|---|---|---|
| Annual yields, all the headline MWh figures | **2025** | Last complete calendar year. An annual total needs a full year of hours |
| The heatwave toggle | **June 2026** | The actual record event. Available now, ERA5 runs about 5 days behind real time |

2026 cannot carry the annual figures because it is not over. Using it for the heatwave window is fine and makes the page better, because the event is real and recent.

Both years are named on the page, in one sentence, next to the numbers they produced. Iteration 1's mistake was not picking one year. It was never saying which year, so nobody could tell whether the +17.1% gap was a bug or a sunny summer.

Source: [Open-Meteo Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api) (ERA5, 5 day delay, provides both `temperature_2m` and global tilted irradiance)

## 6. How it is built, and why

**Python precomputes everything. The browser only displays.**

Every combination of the three scenario controls is calculated once in Python and written as static JSON into `/data`. Flipping a toggle picks a precomputed value out of that file. No calculation happens in the browser.

Why:

- **Nothing to host.** GitHub Pages serves files. It cannot run Python. Precomputing means the site is just files, so it is free, permanent, and cannot break at 3am.
- **Nothing to re-derive.** The maths lives in one Python script with a name and a git history. If a number on the site looks wrong, there is exactly one place to look.
- **Fast.** A visitor's laptop is not going to loop over 300,000 roof polygons. Reading a small JSON is instant.
- **Small combination count.** Two on/off toggles and three built-out steps is 12 combinations. Precomputing 12 answers is trivial. If the count ever grows past a few dozen, revisit this.

**Frontend: plain HTML, CSS, vanilla JavaScript, Leaflet for the map, one charting library loaded from a CDN.** No React, no npm install, no build step. Push to main, Pages serves it, done.

Why: a build step is a machine that turns source files into different files before they can be served. It is normal in professional work and completely unnecessary here. It adds a toolchain that breaks when versions drift, and this project needs to still work when it is opened again in a year.

## 7. Not in scope

Any request implying one of these is a stop-and-ask:

- **Economics.** No capex, no tariffs, no payback, no ROI. The v1 figures (500 €/kWh, 0.22 €/kWh) were placeholders and are retired.
- **Multi-year climate averaging.** Two named years, as above.
- **Dispatch simulation.** Charge/discharge schedules, round-trip efficiency, 2h vs 4h sizing. Retired from v1.
- **Load profiles and self-consumption modelling.** Note that BDEW standard load profiles are publicly available, so this is excluded by choice, not by impossibility. It is excluded because it doubles the modelling surface for a portfolio piece that is about potential, not operation. If View-level demand ever matters, revisit with eyes open.
- Anything outside Düsseldorf.
- PyPSA-Eur, Zensus 2022, district cooling, wider penetration scenario sets. See glossary in section 12.
- Any frontend framework, bundler, or build tooling.

## 8. Decisions already made

1. **One page, one map.** Layers are checkboxes, scenarios are a side panel. No multi-page navigation.
2. **Potential is the subject.** Existing installations are context, shown to compute a realization rate.
3. **PLZ is the primary unit.** Buildings appear only on drill-down, and only the suitable ones.
4. **Battery potential = PV potential × 1.5 kWh/kWp**, cited to HTW Berlin, labelled as an upper bound.
5. **2025 for annual figures, June 2026 for the heatwave.** Both named on the page.
6. **Repo:** new public repository named `duesseldorf-solar-storage`, cloned to `~/Desktop/Pet_Projects/`. The v1 static site is copied in under `/v1/` so the old click-through stays reachable. The v1 repo stays private and archived and is not linked from the README, because a private link is a 404 for visitors.
7. **Static snapshot.** The site states when the data was pulled and does not pretend to update.
8. **No "Layer 1-4", no "Thread A/B"** anywhere, including filenames and commit messages.

## 9. Open questions

### Decided

- **Repo name:** `duesseldorf-solar-storage`
- **Roof suitability rule:** rank by the cadastre's own specific yield (`kwh_kwp`), and require kWp ≥ 10. Two fields, both already in the Solarkataster. Orientation, tilt and shading are not separate filters, because the cadastre's specific yield already reflects all three.
  Sentence for the page, to refine once the numbers are in: *"A roof counts as suitable if the Solarkataster's own yield figure puts it in the top band and it could carry at least 10 kWp."*

### Still open, for Claude Code to research and recommend

1. **Postcode field in MaStR.** Do units without coordinates carry a usable PLZ or `Ort` field, and for how many of the 6,672 Düsseldorf units? **Check this first**, it decides whether section 3's cluster layer is possible at all.
   → _(pending)_
2. **Where the "top band" cut sits.** Top N per PLZ, top X%, or an absolute `kwh_kwp` threshold? Needs the actual distribution first. The answer must keep the map readable, so it is a design constraint as much as a data one.
   → _(pending)_
3. **PV derate coefficient.** Which module temperature coefficient and which cell temperature model, with the source named.
   → _(pending)_
4. **AC surge multiplier.** One citable source, or ship the toggle labelled as an illustrative assumption.
   → _(pending)_

## 10. Definition of done

- **Works on a laptop browser.** Phone support is welcome but not required.
- A visitor who knows nothing about this can open the page, use the toggles, and leave with one sentence they could repeat to someone else.
- Every number on the site traces to a script in this repo and a named public source.
- **Every script runs from a clean checkout with no manual steps.** Meaning: clone the repo onto a machine that has never seen this project, run one documented command, and the data files rebuild. No "first download this ZIP by hand", no "edit line 40 to your local path", no undocumented file sitting only on one laptop. This is what makes it credible to a hiring manager, who will assume the worst if the repo cannot run.
- **The README describes what the code actually does, updated in the same commit as the code.** Meaning: never ship a behaviour change and a docs change as two separate commits. Iteration 1 died because the README described "Layer 3 and Layer 4" while the session was building "Thread A and Thread B". Same commit, always, and the drift cannot start.
- **No file, function, or commit message uses a name for a piece of work that this file does not use.** Meaning: the vocabulary in this document is the only vocabulary. If something is called the "scenario panel" here, it is not called "the widget" in a filename and "the sidebar" in a commit. One name per thing, everywhere, or in six weeks nobody can tell whether two names mean one feature or two.

## 11. Carry-over facts from v1

Verified in iteration 1. Re-check before any of them reach the site.

| Fact | Value |
|---|---|
| Düsseldorf theoretical rooftop potential | 1,156,084 kWp (pitched + flat, ≥10 kWp) |
| Registered vs theoretical | 161,365 kWp, so 14.0% realized |
| Düsseldorf roof facets in cadastre | 305,939, EPSG:25832 |
| NRW battery units | ~511,000 (4.82 GW / 7.07 GWh, 99.6% lithium) |
| NRW PV units | ~1,163,000 (16.0 GWp) |
| Düsseldorf BESS units | 6,672, of which 29 carry usable coordinates |
| ERA5 2025 vs cadastre baseline | +17.1% mean, 0.28% SD across 100 roofs |

## 12. Glossary of things deliberately excluded

- **PyPSA-Eur** is an open-source model of the entire European electricity grid: power lines, generators, cross-border flows. Enormous, and irrelevant to rooftops in one city.
- **Zensus 2022** is the German census. It would give household counts per area, which could turn into an electricity demand estimate. That is a demand-side project, and this one is supply-side.
- **District cooling** is centralised chilled water piped to buildings, the cooling equivalent of district heating. Interesting, unrelated to rooftop PV.
- **Penetration scenario sets** means modelling the grid at 10 / 30 / 50 / 70 / 90 / 95 / 99% renewable share. That is a grid study. The three built-out steps in section 4 are the small, honest version of the same idea.

## 13. Known traps

- `open-mastr` pulls stay filtered: `db.download(data=["storage","solar"])`. Unfiltered is multi-GB and 30+ minutes.
- MaStR usable capacity (kWh) is null at unit level. The `VerknuepfteEinheit → EinheitMastrNummer` join is mandatory.
- Filter MaStR to NRW in SQL, not in pandas. The national tables are too large to load whole.
- `gh auth login --insecure-storage` is required. The sandboxed process cannot reach the macOS Keychain.
- The repo lives at `~/Desktop/Pet_Projects/duesseldorf-solar-storage`. If iCloud Desktop sync is on, git can occasionally hit a file-locking error there; pausing iCloud sync from the menu bar clears it.
- Solarkataster NRW ships in EPSG:25832. Leaflet wants WGS84. Reproject in Python, once, not in the browser.

## 14. Working rules

- One vocabulary, as defined in section 10.
- A commit that changes behaviour updates the README in the same commit.
- Narrow before wide: one PLZ, then all of them.
- Feature branches, confirmed before merging to main.
- Every number that reaches the site traces to a script and a named public source.
- No em-dashes in any copy, in the repo or on the site.

---

**Sources**

- [HTW Berlin · Empfehlungen zur Auslegung von Solarstromspeichern](https://solar.htw-berlin.de/publikationen/auslegung-von-solarstromspeichern/)
- [Open-Meteo · Historical Weather API (ERA5)](https://open-meteo.com/en/docs/historical-weather-api)
- [Wikipedia · 2026 European heatwaves](https://en.wikipedia.org/wiki/2026_European_heatwaves)
