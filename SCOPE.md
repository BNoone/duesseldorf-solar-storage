# Duesseldorf Solar + Storage Potential Map · Scope v3.2

**Status:** active
**Replaces:** iteration 1 (`NRW_BESS_Screener`, now private and archived)
**Written:** 2026-09-12
**Amended:** 2026-09-15 (v3.2, see Changelog)

Read this file at the start of every session, before anything else. If the repo and this file disagree, that gets fixed before new work starts.

---

## 0. Changelog

**v3.2 (2026-09-15):** all five commits from v3.1's plan shipped and tested; this entry confirms what actually landed, the plan below is the historical record of intent, not a duplicate of it.

Commit 1 (chart to loss strip), commit 2 (the derate ladder), and commit 4 (storage to one line, dots hover like districts) landed as planned below. Commit 4 additionally found and fixed a real, unplanned bug while checking the honest-line paragraph's figures as asked: neither cited storage total (6,660 on the page, 6,672 in SCOPE.md's own "superseded" note) was actually current, the true figure was a third number, 7,025 units, 52,230 kW, because `build_storage.py`'s citywide_note hardcoded its coordinate-coverage clause as a literal string instead of computing it, so a corrected total could never have produced a correct note. Fixed and re-run; section 3's carry-over table now reads 7,025/28.

Commit 3 (build-out becomes the subject) turned out to require more than presentation: the panel's top line was pinned to the 100% case always while every other number followed the selected level, so it now describes the selected level throughout, the build-out control moved to be the panel's first control, and `data/headline.json`/`build_headline.py` (added for the fixed top line) are no longer read, superseded by reading `data/coverage.json` per level directly.

Commit 5 (units, the (i)) enforced the district-level MW/GWh/MWh tier on the drill-down panel and postcode breakdown, not just the scenario panel; Bilk's annual yield was a 5-digit MWh figure before this, a real violation of "never more than four digits" that the original unit-tier work (an earlier UX pass) had missed.

See section 4 for the current, specific state of every subsection this touched.

Before shipping any of it: verified the "3,049 GWh" 2022 electricity consumption figure against the actual source PDF (`pdftotext` on the real document, not recalled from memory), page 14, table "Energieverbrauch in GWh", row "Strom", GHDI 1,599 + KE 107 + HH 1,171 + V 172 = 3,049, the report's own printed total, not scaled, not estimated, not a national or NRW figure. The footer never cited this source; it does now (section 4, this changelog entry's own commit 5).

**The subject of this project changes.** It was "how much rooftop solar could this city have, and how much battery storage would that call for": a potential-plus-storage-sizing pitch. It is now "how much rooftop solar could this city have, and what does heat and cooling demand do to that": a potential-plus-heat pitch. Storage was never wrong, exactly, but the battery-dispatch table (capacity, midday generation, evening generation, shiftable kWh, evening-with-battery, the 70.1% and 4.25x findings from the earlier scenario-panel batch) asked a visitor to absorb a second, separate quantitative argument (how much of a day's generation a 1.5 kWh/kWp battery could shift) on top of the heat argument the page already makes, and diluted both. Storage survives as one line in the panel, the capacity these rooftops would justify at 1.5 kWh/kWp (HTW Berlin), and as the existing large-unit dots on the map. The line and the dots are a fact stated, not an argument made.

**What was cut, specifically:** `scripts/build_battery.py` and `data/battery_case.json` are no longer read by the page (script kept in the repo; a future scope could resurrect it, this is a presentation decision about what the page argues, not a claim the underlying computation was wrong). The battery-case table, its stats-note sentence, and the "midday hours"/"evening hours" framing are removed from `app.js`/`index.html`/`style.css`. Section 4's "Battery case: midday surplus, evening gap" subsection below is replaced accordingly.

Also cut: the rated-vs-derated line chart (Chart.js). Diagnosis, so this is not repeated: the chart was correct, 24 points, a real zero-based axis, not the reported "growing/exponential" shape. The actual problem was scale: a 5.3% heatwave-vs-normal difference is invisible on a 0-to-~93,000-kWh axis, rendering as two hairline-apart curves. Replaced with an hourly loss strip (commit 1 below) that plots the derate percentage directly instead of two near-identical absolute curves, which is the shape that actually needed to be legible.

The header is four labelled figures in the city-level unit tier (1.4 GW possible, 1.1 TWh a year, 0.16 GW built, 11.6% used) instead of a run-on sentence mixing kWp and MWh, under a subtitle that states the page's actual question. An (i) button opens a modal holding what used to clutter the header: what the page models, the suitability rule, data sources, and the cooling-demand France analogue with its caveat. Units are now tiered and enforced: city level GW/TWh, district level MW/GWh, building level kW/kWh, never mixed on one screen.

The screen splits map (about 70%) and the scenario panel (about 30%), side by side, panel open by default, a "Hide" toggle collapsing it to a narrow tab rather than hiding its content behind a control someone has to find. The panel's very first line now answers the subtitle directly (full build-out coverage, and what it drops to on the hottest days, both precomputed from figures already verified elsewhere on the page, see section 4), before any other number.

The map's legend is gone; hovering a district now shows its name, possible capacity, and qualifying buildings directly. Built/installed capacity stays out of that hover on purpose, see section 3, that apportionment was already rejected once (v2.3). The "colour the map by this scenario's generation" control and its own legend are gone too: none of the panel's toggles change the map any more, it stays roof potential, full stop. The top-20-by-yield gold building highlight is gone, it was never explained on the page; buildings are now coloured by roof quality instead (Fair/Good/Excellent, fixed citywide thresholds on the cadastre's own kwh_kwp, section 4). The building popup drops "specific yield" and "facets" for plain language, with an (i) explaining what counts as a qualifying building.

The scenario panel now leads with two big numbers, normal day vs heatwave day in MWh, always both shown, above a chart that was already a single day and 24 points (the reported lag traced to Chart.js's default 1000ms transition, not data volume, now 200ms). Exactly three controls remain, all in the panel, none on the map: build-out (now labelled "Today" for the current rate, plus 30/50/100%), heatwave on/off, and a plainly-labelled cooling-demand-surge toggle (its France-analogue caveat lives only in the (i) panel now).

The evening demand-surge toggle is wired in: checking it darkens and labels the chart's existing evening shading with the cited France-analogue figure (+25%, IEA, 28 July 2025) and swaps in a supply/demand asymmetry note. No demand curve is drawn and no generation number changes when it is toggled, since it is a demand-side citation, not a supply figure; `data/generation_scenarios.json` stays exactly 8 combinations, not 16 (see section 4's architecture note and section 9, both corrected from the earlier "16 combinations" framing, which would have implied AC surge affects supply). With this, all four required commits plus the optional fifth are merged and live: the scenario panel is complete.

**v2.4 (2026-09-14):** the scenario panel gets its actual model. Section 4 rewritten in full.

The heatwave PV derate now has a real formula (NOCT cell temperature model, temperature coefficient applied to cell temperature, never air temperature, which was flagged in advance as the easiest thing in this batch to get wrong). Duesseldorf's own heatwave window was checked against ERA5 rather than assumed to match the national records: 24-28 June 2026, five days, worst day 26 June at 38.1 degC citywide mean. A matched normal day (25 August 2025) was found by searching 2025's summer for the closest GTI total, so the heatwave comparison isolates temperature rather than also measuring cloud cover. The built-out control gains a 100% step, required because the project's own premise is "every suitable rooftop carries solar." The AC demand surge toggle is decided (IEA France-analogue figure, +25% on the evening peak, never presented as a Duesseldorf measurement) even though it ships last, in an optional commit 5. City electricity consumption (3,049 GWh, 2022) is sourced to Duesseldorf's own Energie- und Treibhausgasbilanz, not a national or regional dataset. Annual generation at each build-out level was then set against that consumption figure to produce the page's headline sentence: at full build-out, rooftop solar alone would cover 37% of the city's own electricity use.

Also fixed: the `fetch_mastr.py` known-trap entry (section 13) still listed the old two-table download, missing `storage_units`, after that was already corrected in v2.3's own commit. Both now agree.

The battery case is computed (`scripts/build_battery.py`): a 1.5 kWh/kWp battery can absorb about 70% of midday generation at every build-out level alike, a fixed property of the sizing choice, not of how much of the city is built out. The whole panel, heatwave toggle, four-step build-out control, hourly chart (Chart.js), and battery-case stats, is now wired into the live page, reading only precomputed JSON, never computing in the browser. A fourth, off-by-default control recolours the Stadtteil choropleth by the selected scenario's own generation instead of roof potential.

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

**One web page. One map. A few toggles.** A visitor opens it, sees Duesseldorf, and can answer one question: *how much rooftop solar could this city have, and what does heat and cooling demand do to that potential?* (Changed in v3.1; was "...and how much battery storage would that call for", see changelog. Storage is now a fact stated, one line and dots on the map, not the second argument the page makes.)

It is a portfolio piece for hiring managers. It has to load fast on a laptop, look competent, and every number on it has to trace to a named public source. It is not a research paper, not a planning tool, and not a simulation.

**What the site actually models:** a scenario in which every suitable rooftop in Duesseldorf carries solar, then the heatwave PV derate and the cooling demand surge are applied on top of that built-out scenario. This scenario runs on the Solarkataster and ERA5 alone and needs no registry data at all. Existing installations, from MaStR, are shown alongside as context, to compute a realization rate, never as an input to the potential model itself.

## 2. The page

```
+----------------------------------------------------------------+
|  Duesseldorf Solar + Storage (i)                                |
|  If every suitable roof in Duesseldorf had solar, would it      |
|  power the city? And what happens when it gets hot?             |
|                                                                   |
|  1.4 GW      1.1 TWh      0.16 GW      11.6%                    |
|  possible    per year     built        used                     |
+---------------------------------------+-------------------------+
|                                        | [Hide]                  |
|  BESS OVERVIEW                        | Build-out: [Today] [30%]|
|  [ ] Large storage, Duesseldorf        |   [50%] [100%]         |
|  [ ] Large storage, NRW above 1 MW     |                         |
|  (honest-line paragraph: unit count,  | At today's build-out    |
|   combined capacity, why only 6 dots) | 0.13 TWh a year  4.2%   |
|                                        |                         |
|         THE MAP                       | Normal day vs heatwave  |
|    (Stadtteil shapes, roof potential; | [ ] Heatwave [ ] Cooling|
|     hover for name, possible MW,      |                         |
|     qualifying buildings, no legend;  | Lab rating      648 MWh |
|     click one to drill into its       | Normal day      606 MWh|
|     buildings, coloured by roof       |   6.5% lost to everyday |
|     quality. Its panel then shows     | Heatwave day    574 MWh|
|     the postcodes it sits in, each    |   5.3% lost again       |
|     with its own exact PV,            |                         |
|     realization, and storage facts.   | [ hourly loss strip ]   |
|     Large-storage dots hover like     | worst: 9.4% at 14:00    |
|     districts do. Never changes with  |                         |
|     the panel's toggles, it stays     | These roofs would       |
|     a map.)                           | justify ~242 MWh of     |
|                                        | storage (HTW Berlin)    |
+---------------------------------------+-------------------------+
```

Map about 70%, panel about 30%, open by default; a "Hide" toggle collapses it to a narrow tab rather than hiding its content behind a control someone has to discover first. The build-out control is the panel's first control, and every number below it, including the "At [level]" heading, describes the selected level, never a fixed one. Clicking a Stadtteil opens a panel with that neighbourhood's own numbers and the postcodes inside it. The scenario panel's toggles change the panel's own numbers, never the map, which stays roof potential regardless of any toggle state. Nothing navigates away.

## 3. The data model: one geography, postcode facts in the panel

Potential is the subject, not inventory. That has not changed. What changed, twice now, is which shape carries which fact.

### One geography on the map

**Stadtteil (50 neighbourhoods) is the only shape drawn on the map.** Solarkataster geometry is exact, so a point-in-polygon join of each building's centroid to a Stadtteil shape is reliable for every building, small or large. Boundaries: [Open Data Duesseldorf, Stadtteile Duesseldorf](https://opendata.duesseldorf.de/dataset/stadtteile-d%C3%BCsseldorf).

Postcode (PLZ) still exists in the data, because it is the only geography MaStR's registry data can honestly support (see the check below), but it is not a second map layer. Its numbers appear as facts inside each Stadtteil's panel, addressed to their own postcode, never blended into a neighbourhood-level rate. Why, and how, is its own subsection below.

**The check that forced postcode onto MaStR data in the first place** (MaStR pull, local database dated 2026-07-10):

- PV coordinate coverage by size, Duesseldorf: <10 kWp 0% (8,969 units), 10-30 kWp 0% (2,425 units), 30-100 kWp 85.8% (295 units), 100 kWp-1 MWp 100% (107 units), >=1 MWp 100% (8 units). Overall 368 of 11,804 units, 3.1%.
- Storage coordinate coverage, Duesseldorf: 28 of 7,025 units, 0.4%, and the pattern is the same, coordinates exist almost only above 100 kW.
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

Clicking a Stadtteil zooms in and draws **every qualifying building** in it, loaded one Stadtteil at a time, not the whole city at once, coloured by roof quality (UX pass v3.0): Fair, Good, or Excellent, three fixed citywide bands on building-level `kwh_kwp` (`scripts/compute_roof_quality_bands.py`), absolute thresholds set once from the real distribution, not per-district quantiles, so "Good" means the same roof quality in Stadtmitte as in Wittlaer. An earlier version highlighted the 20 highest-yield buildings per Stadtteil in gold instead; removed, it was never explained on the page and answered a question ("which are the best few roofs here") nobody was asking, roof quality answers the one visitors actually have ("is this roof any good").

**Aggregates (the Stadtteil's roof potential, annual yield, and building count) always count every qualifying building**, regardless of its quality band.

The page must say, in one sentence, what "qualifying" means. A visitor who cannot see the rule cannot trust the map. It lives in two places: the drill-down panel's own one-line rule, and an (i) toggle on every building popup, so the explanation is never more than one click away from the building itself.

**Sentence for the page:** *"A building qualifies once its roof faces sum to at least 10 kW, excluding north-facing pitched faces. Flat roofs always qualify, since panels on them are angled south."*

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

Only 28 of 7,025 Duesseldorf battery units carry usable coordinates. v2.1 and v2.2 planned to show the rest **aggregated to their postcode as map clusters**; superseded by v2.3. A cluster is still one geography competing with Stadtteil on the same map, the exact problem this version removes. The fix is the same one applied to PV: registered storage unit counts and kWh are **postcode facts inside the Stadtteil panel** (see above), never their own map layer, never apportioned to a neighbourhood.

**Storage focus stays on larger units.** Home batteries are context, not the interesting part of the story. Checked: Duesseldorf has exactly 6 storage units above 100 kW, and all 6 carry real coordinates (coordinate coverage is not the problem at this size). Only 1 exceeds 1 MW, a 10 MW unit at PLZ 40549, and its `EinheitBetriebsstatus` is "In Planung", not yet built. Duesseldorf's own grid-scale battery fleet is, honestly, not built yet. These 6 units are shown as exact dots at their real coordinates, unchanged by this revision, because they have real coordinates and do not need postcode aggregation at all.

That is why an **NRW-wide layer showing only units above 1 MW** is added, for contrast: it gives a visitor something to compare Duesseldorf's near-empty grid-scale tier against, using the same MaStR pull, filtered to `Bruttoleistung > 1000` across all of NRW rather than just Duesseldorf. This layer is also exact dots, not a geography, so it does not reintroduce the competing-shapes problem.

## 4. The scenario panel

**The spine of this panel is one comparison: the same rooftops, two conditions.** How much energy on a normal day, how much on a heatwave day, what the difference is. Everything below hangs off that comparison. The page must say plainly, in its own words, that this is a thought experiment, not a forecast.

### Toggle 1 · Heatwave: PV derate

Hot panels produce less. This is the one calculation in the whole project with real potential to be gotten wrong, so the model is written out in full here, not just described.

**Cell temperature, not air temperature.** The temperature coefficient below applies to the PV cell's own temperature, which on a sunny day runs well above the air temperature around it. Using air temperature directly understates the derate roughly fourfold. Cell temperature is modelled with the standard NOCT approach:

`T_cell = T_air + (NOCT - 20) / 800 * GTI`

NOCT (nominal operating cell temperature) = 45 degC. GTI is global tilted irradiance, W/m².

**Derate:**

`derate = max(0, (T_cell - 25) * 0.35%)`

No efficiency gain is modelled below 25 degC; the derate floors at zero rather than going negative. The 0.35%/degC coefficient is a point estimate; the page also states the realistic range, -0.29 to -0.40 %/degC, since a city's roof stock spans many module ages and manufacturers and no single value is exactly right for all of it.

**The heatwave is a real, named event, not an abstraction, and Duesseldorf gets its own numbers, not borrowed national ones.** Germany broke its all-time national temperature record on three consecutive days in late June 2026 (41.3 degC Saarbruecken on the 26th, 41.5 degC Drewitz on the 27th, 41.7 degC Coschen on the 28th), and NRW was affected enough that regional rail was suspended for six hours. Those records were set in Saarland and Brandenburg, not here, so Duesseldorf's own peak was checked separately rather than assumed to match.

Found from ERA5 (citywide mean across the 50 Stadtteil centroids, `scripts/find_heatwave_window.py`): Duesseldorf's own heatwave window is **24 to 28 June 2026**, five days, not one.

| Date | Daily max (citywide mean) |
|---|---|
| 24 June | 34.3 degC |
| 25 June | 34.3 degC |
| **26 June** | **38.1 degC (worst day)** |
| 27 June | 36.3 degC |
| 28 June | 31.9 degC |

Peak single-hour GTI in the window: 934.5 W/m² at 14:00 on 25 June.

**Matched normal day, so the comparison measures heat, not cloud:** comparing the worst heatwave day to a mild, cloudy 2025 day would mostly measure the difference in sunshine, not the difference in temperature. **25 August 2025** was found by searching 2025's summer (June-August) days for the one whose citywide daily GTI total is closest to 26 June 2026's, then, among close matches, the one whose own daily max temperature sits closest to the 2025 summer median (24.7 degC), so the match is not itself a small heat event or an unusually cool outlier.

| | Heatwave day (26 June 2026) | Matched normal day (25 Aug 2025) |
|---|---|---|
| GTI total | 6,685 Wh/m² | 6,724 Wh/m² (+0.6%) |
| Daily max temp | 38.1 degC | 24.2 degC (-13.9 degC) |

The page states this as a three-step ladder now, not a single sentence (UX pass round two, commit 2): lab rating (25 degC, undegraded) down to a normal summer day (ordinary heat derate) down to the heatwave day (the heatwave's own derate on top of that). Two derate figures used to sit side by side reading as a contradiction, "5.3% less" (heatwave vs normal) next to "6.5% lost" (normal vs lab rating), measuring different things; the ladder states both as one descent from the same starting point instead.

Sources: [2026 European heatwaves](https://en.wikipedia.org/wiki/2026_European_heatwaves); [Open-Meteo Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api) (ERA5) for both the heatwave window and the matched normal day.

**Computed** (`scripts/build_generation.py`, citywide, at today's 11.6% build-out; every build-out level scales linearly from these, since build-out below 100% is modelled as a uniform scaling of the whole city's output, not a choice of which roofs get built):

| | Normal day (25 Aug 2025) | Heatwave worst day (26 Jun 2026) |
|---|---|---|
| Rated (undegraded) | 647,970 kWh | 643,965 kWh (-0.6%, the GTI match) |
| Derated | 606,166 kWh | 574,275 kWh |
| Lost to derate | 6.45% | 10.82% |

**Headline (ladder, 574 MWh vs 606 MWh, 5.3% less):** that 5.3% is smaller than the worst-hour derate (14.18%) because derate only bites during the hottest, sunniest hours; mornings and evenings barely notice. It is also smaller than the raw heat-versus-normal derate gap (10.82% minus 6.45% = 4.37 points) because the two days do not start from identical sun either, the GTI match is close (+0.6%) but not exact.

**Worth stating on the page, since it is genuinely surprising:** even the matched *normal* day loses 6.45% to derate. That is not a bug. Panels run well above air temperature in full midday sun on any clear summer day (the NOCT model adds roughly 28 degC to a 900 W/m² midday reading), so some derate is ordinary, not a heatwave-specific effect. What the heatwave actually adds is the difference between 6.45% and 10.82%, not the full 10.82%. This is exactly what the ladder's own caption states plainly now: panels are rated at 25 degC and run hotter than that on every sunny day, not only during heatwaves.

**Across the full 24-28 June window**, not just the worst day: 3,073,892 kWh derated total, average daylight derate 6.56%, 345,203 kWh lost to derate over the five days (shown in the panel as MWh, the day-figure tier, commit 5). The worst single hour anywhere in the window reached 14.18% derate.

**The hourly loss strip** (UX pass round two, commit 1, replaces an earlier rated-vs-derated line chart): 24 blocks, one per hour, shaded by that hour's own derate percentage relative to the day's worst hour, worst hour labelled underneath ("worst: 9.4% at 14:00" for the normal day at today's build-out). Diagnosis for the record, so the chart's removal is not repeated as a mistake: the chart was not broken, it plotted 24 points correctly on a real zero-based axis. The problem was scale, a roughly 5% difference is invisible next to a ~93,000 kWh axis at full build-out, so it rendered as two hairline-apart curves. The strip plots the derate percentage directly instead, computed client-side as `1 - derated/rated` per hour from the same two precomputed arrays the chart used, a display ratio from already-precomputed numbers, the same pattern already used elsewhere in `app.js` (realization percentages, coverage percentages), not a new calculation of anything the Python side does not already model.

### Toggle 2 · Cooling demand surge

Labelled "Cooling demand surge" on the page (UX pass v3.0, plain language, was "AC demand surge (France analogue)"); the France analogue and its caveat moved into the (i) panel, so they are stated once, not repeated next to the toggle.

Evening demand rises during heat. There is no Duesseldorf consumption dataset, and none is invented. Instead: **+25% on the evening peak**, sourced to the IEA commentary ["Staying cool without overheating the energy system"](https://www.iea.org/commentaries/staying-cool-without-overheating-the-energy-system) (28 July 2025), which reports France at 25% above off-season demand during the 2025 heatwaves. France is the stated analogue because German residential air conditioning ownership is low, so a German figure of this kind does not really exist to cite.

Labelled on the page as a **France analogue**, never as a Duesseldorf measurement. No demand curve is drawn; there is no hourly demand data for Duesseldorf, and inventing one is out of scope. Instead the toggle shades the evening peak window on the generation chart and labels it with the cited figure.

**The resulting asymmetry is stated on the page, not hidden:** supply is modelled hour by hour from ERA5, a real measured input. Demand is a single cited figure applied to a window, because anything finer would be invented rather than sourced. This note now lives in the (i) panel's cooling-demand section (UX pass round two, commit 5), next to the France-analogue caveat it explains, not as a standalone note in the panel body.

**Wired into the page** (`app.js`): a checkbox next to the heatwave toggle. On, it appends a line under the hourly loss strip stating the cited figure ("Cooling demand runs an estimated +25% in the evening (France analogue, see (i))"), explicitly noting it does not change the generation loss shown above. Replaces the earlier chart-shading treatment now that the chart itself is gone (commit 1). It touches no generation number and no precomputed JSON; `data/generation_scenarios.json` stays 8 combinations, not 16, see the architecture note below.

### Control 3 · Built out at Today / 30% / 50% / 100% (the panel's first control on screen, since commit 3 below)

Labelled "Today" on the page, not "12%": the exact rate is redundant with the header strip's own 11.6% figure, and "Today" is the thing a visitor actually needs to know before comparing it against the other three steps. A title attribute still gives the precise rate on hover.

Steps, not a free slider. Shows what the city's generation and battery potential look like at each level of rooftop build-out. 12% is today's measured realization rate (11.6%, rounded), recomputed with north-facing pitched facets excluded, see section 3; this replaces v2.1's 10% (9.6% rounded, before the exclusion) and v2's 14% (the per-facet figure), both now superseded. **100% is required, not optional:** the whole thought experiment this project is built around is "every suitable rooftop carries solar," and a built-out control that stops short of that number never actually answers the question the page opens with.

**Build-out is the subject of the panel now, not a fourth toggle buried among the others (UX pass round two, commit 3).** It moved to the first control, above everything else, and a heading names the selected level ("At today's build-out", "At 30% of roofs covered", ...) directly above that level's own numbers. Every number in the panel, including this heading, describes the selected level; nothing is pinned to a fixed level any more. Before this fix, the panel's own top line was permanently pinned to the 100% case ("at full build-out, 36.6%") while every other number followed the selected level, two scenarios described in one panel, which was why the build-out control looked like it did nothing to the headline.

**City coverage at each level** (`scripts/build_coverage.py`; annual generation at 100% build-out is the Solarkataster cadastre's own total, `data/stadtteile.json`, other levels scale it uniformly; against the city's own annual electricity consumption, 3,049 GWh in 2022, Duesseldorf's Energie- und Treibhausgasbilanz 2022, see section 3):

| Build-out | Annual generation | Share of city consumption |
|---|---|---|
| 12% | 129.4 GWh | 4.2% |
| 30% | 334.8 GWh | 11.0% |
| 50% | 557.9 GWh | 18.3% |
| 100% | 1,115.8 GWh | 36.6% |

**The most important sentence on the site:** Duesseldorf's rooftops could generate 1,116 GWh a year, the city uses 3,049 GWh (2022), so at full build-out rooftop solar alone would cover 37% of it. This is now stated as the "At 100% of roofs covered" heading's own two numbers (1.1 TWh a year, 36.6%, the city-level unit tier, commit 5) rather than a fixed, separate sentence: select 100% to see it.

### Storage: one line, not an argument

Cut in v3.1 (see changelog): the midday-surplus-to-evening-gap battery-dispatch table (battery capacity, midday generation, evening generation, shiftable kWh, evening-with-battery, the 70.1%-at-every-build-out-level and 4.25x/6.04x findings). None of it was wrong, `scripts/build_battery.py` and `data/battery_case.json` still exist and still compute it correctly, it is simply no longer part of what this page argues, see section 1.

What replaces it: **one line**, the storage capacity these rooftops would justify at the selected build-out level, at 1.5 kWh per kWp (HTW Berlin upper bound, section 3), cited plainly. No ratios, no hour windows, no dispatch story. The large-unit storage dots stay on the map (section 3), now with the same hover behaviour as districts, one interaction pattern for the whole page.

### Architecture note specific to this panel

ERA5 is fetched once per Stadtteil centroid (50 locations), not per building. Per-building would be roughly 117,000 locations and run for days; a building-scale derate model does not need building-scale weather, since air temperature does not vary meaningfully within a neighbourhood the size of a Stadtteil. See `scripts/fetch_era5.py`.

Every combination of heatwave on/off and build-out level is precomputed to static JSON. The browser only ever selects a precomputed value, never calculates one. This is the same non-negotiable rule as the rest of the scenario panel (section 6).

**AC surge (commit 5) does not add a ninth data dimension.** It is a demand-side citation, not a generation number, so it changes nothing in `data/generation_scenarios.json`; precomputing 16 combinations for it would just duplicate the same 8 generation figures under two labels, implying AC surge affects supply when it explicitly must not (see Toggle 2 above). Instead the toggle is client-side UI state only: it recolours and labels the chart's existing evening shading and swaps in the asymmetry note, nothing more.

**Wired into the page** (`app.js`): exactly three controls, heatwave on/off, build-out (Today/30/50/100%), and cooling demand surge, all reading straight from `data/generation_scenarios.json`, `data/coverage.json`, and `data/battery_case.json`, never computing anything client-side. Flipping any of them updates the panel's top-line answer, the two big numbers (normal day vs heatwave day, MWh), the hourly chart (Chart.js from cdnjs, rated vs derated, evening shaded, one day, 24 points), the supporting detail text, and the battery-case stats together, since they all key off the same `{normal|heatwave}_{build-out}` pair. None of the three change the map: the choropleth stays roof potential regardless of any toggle state (the UX pass removed an earlier "colour the map by this scenario's generation" control, see v3.0 changelog and section 3's district-hover note), the map is exactly the roof-potential view described in section 3, undisturbed by anything in this panel.

## 5. Two weather years, on purpose

| Used for | Year | Why |
|---|---|---|
| Annual yields, all the headline MWh figures | **2025** | Last complete calendar year. An annual total needs a full year of hours |
| The heatwave toggle | **June 2026** | The actual record event. Available now, ERA5 runs about 5 days behind real time |

2026 cannot carry the annual figures because it is not over. Using it for the heatwave window is fine and makes the page better, because the event is real and recent.

The matched normal day used for the heatwave comparison (section 4) also comes from 2025: 25 August, found by searching 2025's own summer days for the closest GTI match to the heatwave's worst day. It is not an arbitrary "typical day", it is a specific, named, checked date, same as the heatwave window itself.

Both years are named on the page, in one sentence, next to the numbers they produced. Iteration 1's mistake was not picking one year. It was never saying which year, so nobody could tell whether the +17.1% gap was a bug or a sunny summer.

Source: [Open-Meteo Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api) (ERA5, 5 day delay, provides both `temperature_2m` and global tilted irradiance)

## 6. How it is built, and why

**Python precomputes everything. The browser only displays.**

Every combination of the three scenario controls is calculated once in Python and written as static JSON into `/data`. Flipping a toggle picks a precomputed value out of that file. No calculation happens in the browser.

Why:

- **Nothing to host.** GitHub Pages serves files. It cannot run Python. Precomputing means the site is just files, so it is free, permanent, and cannot break at 3am.
- **Nothing to re-derive.** The maths lives in one Python script with a name and a git history. If a number on the site looks wrong, there is exactly one place to look.
- **Fast.** A visitor's laptop is not going to loop over 300,000 roof polygons. Reading a small JSON is instant.
- **Small combination count.** One on/off toggle (heatwave) and four built-out steps is 8 precomputed generation combinations. The AC surge toggle (commit 5) does not add a ninth dimension, it is a demand-side citation with no generation number of its own, so it stays client-side UI state rather than another 8 precomputed answers; see section 4's architecture note. If a future toggle does carry its own generation number, revisit this.

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
- **Postcode field in MaStR:** yes. `Postleitzahl` and `Ort` are both 100% non-null for Duesseldorf, across 7,025 storage units and 11,804 PV units. Coordinates are the sparse field (0.4% for storage, 3.1% for PV), and sparse in a size-biased way, not randomly. This is the finding that made PLZ the only geography the registry data can honestly support at all.
- **Roof suitability rule:** building level (`geb_id` sum), not facet level, kWp >= 10, ranked by that building's yield-weighted `kwh_kwp`. See section 3 for the full reasoning and the corrected potential figures.
- **Suitable-roof display rule:** every qualifying building drawn per Stadtteil, on click, one Stadtteil at a time, coloured by roof quality (Fair/Good/Excellent, fixed citywide `kwh_kwp` thresholds, not a per-district top 20 any more, see section 3); aggregates always count every qualifying building, regardless of band.
- **Storage geography and focus:** postcode facts (unit count, kWh) inside the Stadtteil panel for the rest, large units (>100 kW) called out as exact dots, an NRW-wide >1 MW layer added for contrast, battery potential reframed away from a home-battery count.
- **One geography, not two:** Stadtteil is the only map layer. PLZ realization and PLZ-level potential, briefly a second map view in v2.1/v2.2, are removed as a view; their numbers survive as postcode facts in the Stadtteil panel. See the v2.3 changelog entry for the measured crossing figures and why apportioning a per-Stadtteil realization rate was rejected.

### Still open

None currently.

### Decided since (superseding the earlier recommendations above the line)

- **PV derate coefficient:** -0.35%/degC on cell temperature (range -0.29 to -0.40 stated on the page), NOCT = 45 degC, cell temperature via the standard NOCT model. This replaces the earlier -0.47%/degC NREL PVWatts recommendation; the coefficient applies to cell temperature, never air temperature, see section 4 and section 13.
- **AC surge multiplier:** +25% on the evening peak, sourced to IEA, "Staying cool without overheating the energy system" (28 July 2025), a France analogue, never presented as a Duesseldorf measurement. This replaces the earlier arXiv 2507.13534 recommendation. See section 4.

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
| Duesseldorf BESS units | 7,025, of which 28 carry usable coordinates, 52,230 kW combined capacity | Current (v3.2). Was 6,672/29 (v2), then 6,660/28 (a later pull); both superseded once `storage_units` was joined correctly (session note, `fetch_mastr.py`'s known trap) and `build_storage.py` stopped hardcoding the coordinate count into its citywide_note string, which had let it silently drift out of sync with the total once already |
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

- `open-mastr` pulls stay filtered: `db.download(data=["storage","solar","storage_units"])`. Unfiltered is multi-GB and 30+ minutes. `storage_units` is not optional: it is the only place a battery's usable kWh lives, `storage_extended`'s own copy of that field is null for every row, always, at every scale, nationwide. Omitting it silently means kWh figures are unavailable, not just at unit level, this cost a full re-download once already.
- MaStR usable capacity (kWh) is null at unit level. The `VerknuepfteEinheit -> EinheitMastrNummer` join is mandatory.
- Filter MaStR to NRW in SQL, not in pandas. The national tables are too large to load whole.
- MaStR coordinate coverage is a function of unit size, not a random gap. Do not spatial-join existing installations to Stadtteil, or the residential majority silently disappears. Use `Postleitzahl` directly instead.
- The Solarkataster carries no existing-installation field of any kind. Realization always requires the MaStR join, never the cadastre alone.
- **The PV temperature coefficient applies to cell temperature, never air temperature.** Using air temperature directly understates the heatwave derate roughly fourfold. Compute cell temperature first (NOCT model, section 4), then apply the coefficient to that.
- ERA5 fetches for the scenario panel stay at one series per Stadtteil centroid (50 locations), never per building (roughly 117,000, a different and much larger number), and the two weather periods (2025, June 2026) are fetched separately, not as one continuous range, since the months between them are not needed by either figure.
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
- [Landeshauptstadt Duesseldorf · Energie- und Treibhausgasbilanz 2022](https://www.duesseldorf.de/fileadmin/Amt19/umweltamt/klimaschutz/pdf/klimaschutz/19_Klimafreundliches_Duesseldorf_2022_web_bf.pdf)
- [IEA · Staying cool without overheating the energy system (28 July 2025)](https://www.iea.org/commentaries/staying-cool-without-overheating-the-energy-system)
