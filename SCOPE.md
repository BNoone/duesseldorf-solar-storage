# Duesseldorf Solar + Storage Potential Map · Scope v2.3

**Status:** active
**Replaces:** iteration 1 (`NRW_BESS_Screener`, now private and archived)
**Written:** 2026-09-12
**Amended:** 2026-09-14 (v2.3, see Changelog)

Read this file at the start of every session, before anything else. If the repo and this file disagree, that gets fixed before new work starts.

---

## 0. Changelog

**v2.3 (2026-09-14):** one geography, not two. The PLZ choropleth built in v2.1/v2.2 is removed.

A live version briefly shipped both a Stadtteil potential view and a PLZ realization view, switched by a radio control. Two views of the same city, on two geographies that do not nest, read as competing rather than complementary. Before changing anything, measured how much the two geographies actually cross, weighted by roof potential across the 48,467 qualifying buildings that got both a Stadtteil and a PLZ assignment:

- Median Stadtteil draws **96.6%** of its own roof potential from a single overlapping PLZ, and touches a median of **2.5** distinct postcodes. 36 of 50 Stadtteile are above 80% concentration; only 2 are below 50% (Stadtmitte 34.3%, Bilk 48.5%).
- The mirror is messier: median PLZ draws only **80.2%** of its potential from a single overlapping Stadtteil, and touches a median of **3** distinct neighbourhoods. 5 of 37 postcodes are below 50% concentration (worst: 40489 at 29.6%).

Two options were considered. Apportion each PLZ's registered PV across its overlapping Stadtteile by roof-potential share, to get a Stadtteil-level realization rate (rejected: the assumption that PV uptake is proportional to roof potential within a postcode has no empirical support, and the apportionment is weakest in exactly the dense central Stadtteile people click first, Stadtmitte and Bilk both under 50% concentration, Pempelfort/Derendorf/Unterbilk/Duesseltal all under 55%. A rate shown on Stadtmitte would mostly be a fact about somewhere else). Move the potential view onto PLZ shapes instead, labelled with the neighbourhoods each mainly covers (rejected: PLZ is the coarser, messier unit, per the numbers above, and Stadtteil recognisability was the entire reason this project chose neighbourhoods over postcodes in the first place, see v2.1 below).

**Decision: Stadtteil is the only geography on the map.** Registered PV, realization, and storage counts are exact MaStR facts, addressed by their own `Postleitzahl` field, and are shown as postcode facts inside each Stadtteil's panel, clearly attributed to the postcode, never blended into a per-Stadtteil rate. See section 3.

**v2.2 (2026-09-13):** the building-level sum picked up weak roof faces along with the strong ones.

1. **North-facing pitched roof faces excluded from the building sum.** Checking the distribution behind v2.1's building-level figures showed 27.5% of qualifying kWp sat on facets below 700 kWh/kWp, and 94.6% of all north-facing capacity fell below that line. Summing every facet by building, with no per-facet floor, had pulled that roof area in by accident. Excluded using the cadastre's own compass field (`himmel_kat = "Nord"`, pitched roofs only; flat roofs always stay, their racking faces south regardless of the raw surface tilt), a categorical rule rather than a numeric threshold, so the page can state it in one sentence. Potential dropped from 1,683,379 kWp to 1,392,501 kWp, realization rose from 9.6% to 11.6% (same registered capacity, smaller and more honest potential). Full figures in section 11.
2. **Registered PV figure reconciled.** A second mention of 161,365 kWp survived in section 3 after v2.1 corrected section 11's carry-over table to 161,328. Both now read 161,328, the script's computed value.

**v2.1 (2026-09-13):** three changes, made together after a data check.

1. **Qualifying threshold moved from per-facet to per-building.** A typical single-family roof splits across two facets of 5-6 kWp each; neither cleared the old 10 kWp facet filter, so the house was excluded even though it would obviously carry a 10+ kWp system. Facets are now summed by `geb_id` (the Solarkataster's own building key) before the 10 kWp test. This raised total potential from 1,156,084 kWp to 1,683,379 kWp and dropped realization from 14.0% to 9.6%. The old per-facet figures are superseded, not deleted; see section 11.
2. **Geography split into three tiers**, replacing the single PLZ layer: building (`geb_id`) for the suitability math, Stadtteil for the potential map and drill-down, PLZ for existing installations and realization. Driven by a data check (section 9) showing MaStR coordinate coverage is a function of unit size, not randomly missing.
3. **Storage reframed toward grid-scale.** Home batteries remain visible as context; the interesting number is large units, contrasted against an NRW-wide layer, because Duesseldorf's own fleet above 1 MW is a single unit, and it is not yet built.

## 1. What this is

**One web page. One map. A few toggles.** A visitor opens it, sees Duesseldorf, and can answer one question: *how much rooftop solar could this city have, and how much battery storage would that call for?*

It is a portfolio piece for hiring managers. It has to load fast on a laptop, look competent, and every number on it has to trace to a named public source. It is not a research paper, not a planning tool, and not a simulation.

**What the site actually models:** a scenario in which every suitable rooftop in Duesseldorf carries solar feeding storage, then the heatwave PV derate and the AC demand surge are applied on top of that built-out scenario. This scenario runs on the Solarkataster and ERA5 alone and needs no registry data at all. Existing installations, from MaStR, are shown alongside as context, to compute a realization rate, never as an input to the potential model itself.

## 2. The page

```
+--------------------------------------------------+
|  Duesseldorf Solar + Storage Potential            |
+---------------------------+----------------------+
|                           |  LAYERS              |
|                           |  [ ] Large storage,  |
|         THE MAP           |      Duesseldorf     |
|    (Stadtteil shapes,     |  [ ] Large storage,  |
|     the only geography;   |      NRW above 1 MW  |
|     click one to drill    |                      |
|     into its buildings.   |  SCENARIOS           |
|     Its panel then shows  |  [ ] Heatwave: PV    |
|     the postcodes it      |      derate          |
|     sits in, each with    |  [ ] Heatwave: AC    |
|     its own exact PV,     |      demand surge    |
|     realization, and      |  Built out: 12% /    |
|     storage facts)        |      30% / 50%       |
|                           |                      |
|                           |  NUMBERS             |
|                           |  (update live as     |
|                           |   toggles change)    |
+---------------------------+----------------------+
```

One map, one geography. Layer checkboxes decide what else is drawn on it. Clicking a Stadtteil opens a panel with that neighbourhood's own numbers and the postcodes inside it. The scenario panel changes the numbers. Nothing navigates away.

## 3. The data model: one geography, postcode facts in the panel

Potential is the subject, not inventory. That has not changed. What changed, twice now, is which shape carries which fact.

### One geography on the map

**Stadtteil (50 neighbourhoods) is the only shape drawn on the map.** Solarkataster geometry is exact, so a point-in-polygon join of each building's centroid to a Stadtteil shape is reliable for every building, small or large. Boundaries: [Open Data Duesseldorf, Stadtteile Duesseldorf](https://opendata.duesseldorf.de/dataset/stadtteile-d%C3%BCsseldorf).

Postcode (PLZ) still exists in the data, because it is the only geography MaStR's registry data can honestly support (see the check below), but it is not a second map layer. Its numbers appear as facts inside each Stadtteil's panel, addressed to their own postcode, never blended into a neighbourhood-level rate. Why, and how, is its own subsection below.

**The check that forced postcode onto MaStR data in the first place** (MaStR pull, local database dated 2026-07-10):

- PV coordinate coverage by size, Duesseldorf: <10 kWp 0% (8,969 units), 10-30 kWp 0% (2,425 units), 30-100 kWp 85.8% (295 units), 100 kWp-1 MWp 100% (107 units), >=1 MWp 100% (8 units). Overall 368 of 11,804 units, 3.1%.
- Storage coordinate coverage, Duesseldorf: 28 of 6,660 units, 0.4%, and the pattern is the same, coordinates exist almost only above 100 kW.
- The Solarkataster itself carries no field indicating an existing installation anywhere. Checked the full attribute dictionary (`Metadaten_PV_Dach_2024_09_opendata.xlsx`): every field describes roof geometry, orientation, irradiance, or a theoretical yield at a fixed 21.7% efficiency. It is a pure potential cadastre. Realization can only ever come from joining against MaStR, never from the cadastre alone.
- **Confirmed empirically, not just from the schema:** spatial-joined the 368 located Duesseldorf PV units against the nearest Solarkataster facet centroid. 361 of 368 matched within 100 m, median distance 6.7 m. Matched facets carry entirely normal `kw` and `kwh_kwp` values, including facets reporting under 1 kWp of theoretical potential at addresses where hundreds of kWp are actually installed. The cadastre is gross, not net: existing installations never reduce a roof's reported potential.

Coordinate coverage is not a random gap, it is a step function of installation size. A spatial join of existing installations to Stadtteil shapes would keep the handful of commercial and grid-scale systems and silently erase almost the entire residential fleet, which is the majority of units. PLZ, addressed through the registry's own `Postleitzahl` field rather than through coordinates, does not have this problem. This is exactly why PLZ cannot simply disappear: it is the only geography the registry data can be honestly tied to at all.

### The suitability rule: building level, north-facing pitched faces excluded

**A roof counts as suitable if its building clears 10 kWp when its qualifying facets are summed, and ranking for the highlighted set is by that building's yield-weighted specific yield (`kwh_kwp`, computed as the building's total annual yield divided by its total kWp).**

Never per facet. A typical pitched roof splits into two or more facets of a few kWp each; testing 10 kWp against a single facet excluded most ordinary houses even though the building as a whole clearly qualifies.

**A facet qualifies for the sum unless it is a north-facing pitched roof face.** The exclusion uses the cadastre's own compass field, `himmel_kat = "Nord"`, applied only where `dachtyp = "geneigt"`, checked before the building sum, not after. East and west-facing facets stay, they are standard practice. Flat roofs (`dachtyp = "flach"`, `himmel_kat = "Flach"`) always stay regardless of the raw LiDAR surface tilt, because real installations on flat roofs are racked to face south.

**Sentence for the page:** *"North-facing roof faces are excluded. Flat roofs count, since panels on them are angled south."*

**Why:** summing all facets by building (no per-facet floor) pulled in roof area the old per-facet rule had excluded only by accident. Checked: across the 58,631 buildings that qualified before this exclusion, 27.5% of their combined kWp sat on facets below 700 kWh/kWp, and 94.6% of all north-facing capacity in those buildings fell below that line. East and west-facing weak facets existed too, but nowhere near as concentrated. A categorical, cadastre-native rule (compass direction) was chosen over a numeric `kwh_kwp` threshold so the page can state the rule in one sentence without citing a cutoff number that would need re-justifying.

Checked against the Duesseldorf Solarkataster (305,939 facets, 142,377 distinct buildings, EPSG:25832):

- 43,617 north-facing pitched facets excluded (260,042 kWp, before the building sum)
- 48,475 buildings clear 10 kWp on their remaining facets (down from 58,631 before the exclusion; 10,156 buildings dropped out because their north face was the only thing pushing them over 10 kWp)
- Total potential: 1,392,501 kWp (down from 1,683,379)
- Total annual yield: 1,115,838 MWh/year (down from 1,301,697)
- Capacity-weighted specific yield: 801.3 kWh/kWp (up from 773.3, since the weakest facets are gone)
- Realization against 161,328 kWp registered (MaStR): **11.6%** (up from 9.6%, same registered capacity against a smaller, more honest potential figure)
- No Stadtteil moved more than 5 places in the total-kWp ranking; the largest move was Lichtenbroich, 35th to 30th. Flingern Nord held at 15th.

These figures supersede the all-facets-summed-by-building numbers immediately above, which themselves superseded the original per-facet numbers (49,812 facets, 1,156,084 kWp, 14.0%). None of the superseded numbers reach the site. See section 11 for the full lineage.

### Level: Stadtteil

Every Duesseldorf Stadtteil gets one shape carrying:

| Field | Meaning |
|---|---|
| Roof potential (kWp) | Sum of qualifying buildings' potential in this Stadtteil |
| Annual yield (MWh) | What that PV would generate in a normal year (2025) |
| Suitable buildings (count) | How many buildings in this Stadtteil clear the 10 kWp building-level bar |

Existing PV, existing BESS, and realization are never carried on the Stadtteil shape, and no per-Stadtteil realization rate is ever computed. Those numbers are exact only at postcode granularity; showing them per Stadtteil would mean estimating them, and this project does not estimate what it can state exactly instead. See "Postcode facts" below.

### Level: buildings, on click

Clicking a Stadtteil zooms in and draws **every qualifying building** in it, loaded one Stadtteil at a time, not the whole city at once. The 20 highest-yield buildings in that Stadtteil (by building-level `kwh_kwp`) are highlighted.

**Aggregates (the Stadtteil's roof potential, annual yield, and building count) always count every qualifying building, never only the highlighted 20.** Summing only the highlighted set would understate the neighbourhood's real potential by more than an order of magnitude in any Stadtteil with more than 20 qualifying buildings, which is most of them.

The page must say, in one sentence, what "suitable" and "highlighted" mean. A visitor who cannot see the rule cannot trust the map.

**Sentence for the page:** *"A building counts as suitable if its roof facets together could carry at least 10 kWp; the 20 shown in gold are the highest-yield buildings in this neighbourhood, but every qualifying building counts toward the totals."*

### Postcode facts, inside the Stadtteil panel

Clicking a Stadtteil opens a panel (section 2) that, below that Stadtteil's own exact potential figures, lists the postcodes it overlaps, ordered by that postcode's share of the Stadtteil's own roof potential (the same building-level join used everywhere else, just read Stadtteil-first instead of PLZ-first). Each postcode entry carries **its own exact figures**, computed for that postcode alone, never apportioned to the Stadtteil:

| Field | Meaning |
|---|---|
| Installed PV (kWp) | Registered here per MaStR's `Postleitzahl` field, exact |
| Postcode's own roof potential (kWp) | Building-level potential aggregated to this postcode, independent of the Stadtteil breakdown above it |
| Postcode's own realization (%) | Installed PV ÷ the postcode's own potential, exact |
| Registered storage (units, kWh) | All registered batteries in this postcode, MaStR `Postleitzahl`, exact |

**Wording rule, so the page never implies a precision it does not have:**

- If one postcode holds 70% or more of the Stadtteil's roof potential: *"Mostly in postcode 40233."*
- Otherwise, list them: *"Spans 40213, 40210, 40211."*
- **Never a per-Stadtteil realization rate.** Not even labelled as an estimate. The reason is in the changelog above: apportioning a postcode's installed PV across the Stadtteile it overlaps, weighted by roof potential, assumes uptake is proportional to potential within a postcode, an assumption with no empirical support, and it is weakest in exactly the central Stadtteile a visitor is most likely to click.

**Example shape, for the page** (real figures, checked against the current build):

```
Flingern Nord, 35,715 kWp potential
Mostly in postcode 40235 (77% of this neighbourhood's potential): 1,876 kWp installed, 5.7% of that postcode's potential
```

**One sentence, stated once on the page, for why installed figures appear this way:** *"Installed capacity is shown as postcode facts, not neighbourhood facts, because the national registry publishes no location finer than postcode for systems under 30 kWp."*

### Battery potential, and where the number comes from

Battery potential is derived from solar potential, using the published HTW Berlin sizing recommendation: **usable storage capacity should not exceed 1.5 kWh per 1 kW of PV output**. That is an upper bound for sensible storage sizing, not a forecast, and not a count of home batteries. It expresses how much storage a given amount of solar justifies in any form factor, whether that is many small home batteries or one large system serving the same rooftops.

So: `battery potential (kWh) = roof potential (kWp) x 1.5`

Labelled on the page as "sensible upper bound, HTW Berlin sizing recommendation", with the link. If a better source turns up, swap the coefficient in one place.

Source: [HTW Berlin, Empfehlungen zur Auslegung von Solarstromspeichern](https://solar.htw-berlin.de/publikationen/auslegung-von-solarstromspeichern/)

### Existing BESS: postcode facts in the panel, large units the only dots on the map

Only 28 of 6,660 Duesseldorf battery units carry usable coordinates. v2.1 and v2.2 planned to show the rest **aggregated to their postcode as map clusters**; superseded by v2.3. A cluster is still one geography competing with Stadtteil on the same map, the exact problem this version removes. The fix is the same one applied to PV: registered storage unit counts and kWh are **postcode facts inside the Stadtteil panel** (see above), never their own map layer, never apportioned to a neighbourhood.

**Storage focus stays on larger units.** Home batteries are context, not the interesting part of the story. Checked: Duesseldorf has exactly 6 storage units above 100 kW, and all 6 carry real coordinates (coordinate coverage is not the problem at this size). Only 1 exceeds 1 MW, a 10 MW unit at PLZ 40549, and its `EinheitBetriebsstatus` is "In Planung", not yet built. Duesseldorf's own grid-scale battery fleet is, honestly, not built yet. These 6 units are shown as exact dots at their real coordinates, unchanged by this revision, because they have real coordinates and do not need postcode aggregation at all.

That is why an **NRW-wide layer showing only units above 1 MW** is added, for contrast: it gives a visitor something to compare Duesseldorf's near-empty grid-scale tier against, using the same MaStR pull, filtered to `Bruttoleistung > 1000` across all of NRW rather than just Duesseldorf. This layer is also exact dots, not a geography, so it does not reintroduce the competing-shapes problem.

## 4. The scenario panel

Three controls. Each one changes numbers that are already on screen.

### Toggle 1 · Heatwave: PV derate

Hot panels produce less. Applies a temperature derate using a standard module temperature coefficient and a cell temperature model.

**The heatwave is a real, named event, not an abstraction.** Germany broke its all-time national temperature record on three consecutive days in late June 2026 (41.3 degC Saarbruecken on the 26th, 41.5 degC Drewitz on the 27th, 41.7 degC Coschen on the 28th), and NRW was affected enough that regional rail was suspended for six hours. Duesseldorf's own ERA5 peak fell in the same window: 38.2 degC on the 26th, 36.4 degC on the 27th, 32.0 degC on the 28th, against 27.1 degC on the 29th as the heat broke.

The page then says something concrete: *"During the record heat of 26 to 28 June 2026, these rooftops would have produced X% less than a normal summer day."*

Source: [2026 European heatwaves](https://en.wikipedia.org/wiki/2026_European_heatwaves)

### Toggle 2 · Heatwave: AC demand surge

Evening demand rises during heat. Applies a demand multiplier.

There is no Duesseldorf consumption dataset. Either find one citable source for the multiplier, or ship the toggle labelled "illustrative assumption, not measured" with the assumption written next to it. Both are acceptable. Silently inventing a number is not.

### Control 3 · Built out at 12% / 30% / 50%

Steps, not a free slider. Shows what the city's generation and battery potential look like if more of the rooftop potential were actually built. 12% is today's measured realization rate (11.6%, rounded), recomputed with north-facing pitched facets excluded, see section 3. This replaces v2.1's 10% (9.6% rounded, before the exclusion) and v2's 14% (the per-facet figure), both now superseded.

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

- **Economics.** No capex, no tariffs, no payback, no ROI. The v1 figures (500 EUR/kWh, 0.22 EUR/kWh) were placeholders and are retired.
- **Multi-year climate averaging.** Two named years, as above.
- **Dispatch simulation.** Charge/discharge schedules, round-trip efficiency, 2h vs 4h sizing. Retired from v1.
- **Load profiles and self-consumption modelling.** Note that BDEW standard load profiles are publicly available, so this is excluded by choice, not by impossibility. It is excluded because it doubles the modelling surface for a portfolio piece that is about potential, not operation. If load-level demand ever matters, revisit with eyes open.
- Anything outside Duesseldorf.
- PyPSA-Eur, Zensus 2022, district cooling, wider penetration scenario sets. See glossary in section 12.
- Any frontend framework, bundler, or build tooling.

## 8. Decisions already made

1. **One page, one map.** Layers are checkboxes, scenarios are a side panel. No multi-page navigation.
2. **Potential is the subject.** Existing installations are context, shown to compute a realization rate.
3. **Building (`geb_id`) is the unit of suitability.** A roof qualifies at 10 kWp summed across all of its facets, never per facet. **Stadtteil is the only geography drawn on the map.** PLZ still exists in the data, because it is the only geography MaStR's coordinate coverage can honestly support, but its numbers appear as postcode facts inside each Stadtteil's panel, never as a second map layer and never apportioned into a per-Stadtteil rate. Measured before deciding: median Stadtteil draws 96.6% of its potential from one postcode and touches 2.5; median postcode draws only 80.2% of its potential from one Stadtteil and touches 3. See section 3.
4. **Battery potential = PV potential x 1.5 kWh/kWp**, cited to HTW Berlin, labelled as an upper bound on storage a given amount of solar justifies, not a home-battery count.
5. **Storage focus is grid-scale and community-scale.** Home batteries stay visible as postcode facts inside the Stadtteil panel, not a map layer. Existing large units (>100 kW) are called out separately as exact dots, and an NRW-wide layer of units above 1 MW gives Duesseldorf's own near-empty grid-scale tier (1 unit, not yet built) something to be seen against.
6. **2025 for annual figures, June 2026 for the heatwave.** Both named on the page.
7. **Repo:** new public repository named `duesseldorf-solar-storage`, cloned to `~/Desktop/Pet_Projects/`. The v1 static site is copied in under `/v1/` so the old click-through stays reachable. The v1 repo stays private and archived and is not linked from the README, because a private link is a 404 for visitors.
8. **Static snapshot.** The site states when the data was pulled and does not pretend to update.
9. **No "Layer 1-4", no "Thread A/B"** anywhere, including filenames and commit messages.

## 9. Open questions

### Decided

- **Repo name:** `duesseldorf-solar-storage`
- **Postcode field in MaStR:** yes. `Postleitzahl` and `Ort` are both 100% non-null for Duesseldorf, across 6,660 storage units and 11,804 PV units. Coordinates are the sparse field (0.4% for storage, 3.1% for PV), and sparse in a size-biased way, not randomly. This is the finding that made PLZ the only geography the registry data can honestly support at all.
- **Roof suitability rule:** building level (`geb_id` sum), not facet level, kWp >= 10, ranked by that building's yield-weighted `kwh_kwp`. See section 3 for the full reasoning and the corrected potential figures.
- **Suitable-roof display rule:** every qualifying building drawn per Stadtteil, on click, one Stadtteil at a time; the top 20 per Stadtteil by `kwh_kwp` highlighted; aggregates always count every qualifying building, never only the top 20.
- **Storage geography and focus:** postcode facts (unit count, kWh) inside the Stadtteil panel for the rest, large units (>100 kW) called out as exact dots, an NRW-wide >1 MW layer added for contrast, battery potential reframed away from a home-battery count.
- **One geography, not two:** Stadtteil is the only map layer. PLZ realization and PLZ-level potential, briefly a second map view in v2.1/v2.2, are removed as a view; their numbers survive as postcode facts in the Stadtteil panel. See the v2.3 changelog entry for the measured crossing figures and why apportioning a per-Stadtteil realization rate was rejected.

### Still open, for Claude Code to research and recommend

1. **PV derate coefficient.** Recommended: NOCT-based cell temperature model, `T_cell = T_ambient + (NOCT - 20) / 800 x G` (Sandia PVPMC), with a -0.47%/degC temperature coefficient for a standard module (NREL PVWatts V5 Manual, Table 6). Not yet confirmed.
   -> _(pending confirmation)_
2. **AC surge multiplier.** Recommended: label as an illustrative assumption sourced to arXiv 2507.13534 (heatwave-driven AC adoption modeling for Germany, calibrated against July 2025, Bundesnetzagentur load data), rather than a Duesseldorf measurement. Not yet confirmed.
   -> _(pending confirmation)_

## 10. Definition of done

- **Works on a laptop browser.** Phone support is welcome but not required.
- A visitor who knows nothing about this can open the page, use the toggles, and leave with one sentence they could repeat to someone else.
- Every number on the site traces to a script in this repo and a named public source.
- **Every script runs from a clean checkout with no manual steps.** Meaning: clone the repo onto a machine that has never seen this project, run one documented command, and the data files rebuild. No "first download this ZIP by hand", no "edit line 40 to your local path", no undocumented file sitting only on one laptop. This is what makes it credible to a hiring manager, who will assume the worst if the repo cannot run.
- **The README describes what the code actually does, updated in the same commit as the code.** Meaning: never ship a behaviour change and a docs change as two separate commits. Iteration 1 died because the README described "Layer 3 and Layer 4" while the session was building "Thread A and Thread B". Same commit, always, and the drift cannot start.
- **No file, function, or commit message uses a name for a piece of work that this file does not use.** Meaning: the vocabulary in this document is the only vocabulary. If something is called the "scenario panel" here, it is not called "the widget" in a filename and "the sidebar" in a commit. One name per thing, everywhere, or in six weeks nobody can tell whether two names mean one feature or two.

## 11. Carry-over facts

Verified in iteration 1 or in this session. Re-check before any of them reach the site.

| Fact | Value | Status |
|---|---|---|
| Duesseldorf theoretical rooftop potential, per-facet, kWp>=10 | 1,156,084 kWp | Superseded |
| Duesseldorf theoretical rooftop potential, per-building, all facets summed, kWp>=10 | 1,683,379 kWp | Superseded |
| Duesseldorf theoretical rooftop potential, per-building, north-facing pitched facets excluded | **1,392,501 kWp** | Current |
| Duesseldorf annual yield, per-building, all facets summed | 1,301,697 MWh/year | Superseded |
| Duesseldorf annual yield, per-building, north-facing pitched facets excluded | **1,115,838 MWh/year** | Current |
| Duesseldorf capacity-weighted specific yield (kWh/kWp), north-facing pitched facets excluded | **801.3 kWh/kWp** | Current, up from 773.3 before the exclusion |
| Registered PV (MaStR) | 161,328 kWp | Current, corrected from v2's 161,365 (fresh query against the same local MaStR pull, Landkreis Duesseldorf, Energietraeger Solare Strahlungsenergie) |
| Realization, per-facet basis | 14.0% | Superseded |
| Realization, per-building, all facets summed | 9.6% | Superseded |
| Realization, per-building, north-facing pitched facets excluded | **11.6%** | Current |
| Duesseldorf roof facets in cadastre | 305,939, EPSG:25832 | Current |
| Duesseldorf distinct buildings in cadastre (`geb_id`) | 142,377 total; 58,631 qualifying before the north-facing exclusion, 48,475 after | Current |
| Duesseldorf north-facing pitched facets excluded | 43,617 facets, 260,042 kWp, dropped before the building sum | Current |
| Duesseldorf BESS units | 6,660, of which 28 carry usable coordinates | Current, corrected from v2's 6,672/29 |
| Duesseldorf BESS units above 100 kW | 6, all 6 with usable coordinates | Current |
| Duesseldorf BESS units above 1 MW | 1 (10 MW, PLZ 40549, status "In Planung") | Current |
| Duesseldorf PV units by coordinate coverage | 0% below 30 kWp (11,394 units), 85.8-100% at 30 kWp and above (410 units) | Current |
| NRW battery units | ~511,000 (4.82 GW / 7.07 GWh, 99.6% lithium) | Re-check before use |
| NRW PV units | ~1,163,000 (16.0 GWp) | Re-check before use |
| ERA5 2025 vs cadastre baseline | +17.1% mean, 0.28% SD across 100 roofs | Re-check before use; direction (ERA5 above cadastre) contradicted the v1 script's own stated expectation, worth a fresh look before relying on it for the derate baseline |

## 12. Glossary of things deliberately excluded

- **PyPSA-Eur** is an open-source model of the entire European electricity grid: power lines, generators, cross-border flows. Enormous, and irrelevant to rooftops in one city.
- **Zensus 2022** is the German census. It would give household counts per area, which could turn into an electricity demand estimate. That is a demand-side project, and this one is supply-side.
- **District cooling** is centralised chilled water piped to buildings, the cooling equivalent of district heating. Interesting, unrelated to rooftop PV.
- **Penetration scenario sets** means modelling the grid at 10 / 30 / 50 / 70 / 90 / 95 / 99% renewable share. That is a grid study. The three built-out steps in section 4 are the small, honest version of the same idea.

## 13. Known traps

- `open-mastr` pulls stay filtered: `db.download(data=["storage","solar"])`. Unfiltered is multi-GB and 30+ minutes.
- MaStR usable capacity (kWh) is null at unit level. The `VerknuepfteEinheit -> EinheitMastrNummer` join is mandatory.
- Filter MaStR to NRW in SQL, not in pandas. The national tables are too large to load whole.
- MaStR coordinate coverage is a function of unit size, not a random gap. Do not spatial-join existing installations to Stadtteil, or the residential majority silently disappears. Use `Postleitzahl` directly instead.
- The Solarkataster carries no existing-installation field of any kind. Realization always requires the MaStR join, never the cadastre alone.
- `gh auth login --insecure-storage` is required. The sandboxed process cannot reach the macOS Keychain.
- The repo lives at `~/Desktop/Pet_Projects/duesseldorf-solar-storage`. If iCloud Desktop sync is on, git can occasionally hit a file-locking error there; pausing iCloud sync from the menu bar clears it.
- Solarkataster NRW ships in EPSG:25832. Leaflet wants WGS84. Reproject in Python, once, not in the browser.

## 14. Working rules

- One vocabulary, as defined in section 10.
- A commit that changes behaviour updates the README in the same commit.
- Narrow before wide: one Stadtteil, then all of them.
- Feature branches, confirmed before merging to main.
- Every number that reaches the site traces to a script and a named public source.
- No em-dashes in any copy, in the repo or on the site.

---

**Sources**

- [HTW Berlin · Empfehlungen zur Auslegung von Solarstromspeichern](https://solar.htw-berlin.de/publikationen/auslegung-von-solarstromspeichern/)
- [Open-Meteo · Historical Weather API (ERA5)](https://open-meteo.com/en/docs/historical-weather-api)
- [Wikipedia · 2026 European heatwaves](https://en.wikipedia.org/wiki/2026_European_heatwaves)
- [Open Data Duesseldorf · Stadtteile Duesseldorf](https://opendata.duesseldorf.de/dataset/stadtteile-d%C3%BCsseldorf)
- [yetzt/postleitzahlen, German postcode boundaries (OpenStreetMap contributors, ODbL)](https://github.com/yetzt/postleitzahlen)
