const DUESSELDORF_CENTER = [51.2277, 6.7735];
const DEFAULT_ZOOM = 12;

// ColorBrewer "Oranges", 5-class sequential single-hue scale.
const CHOROPLETH_COLORS = ["#feedde", "#fdbe85", "#fd8d3c", "#e6550d", "#a63603"];

// Roof-quality bands on the cadastre's own kwh_kwp (capacity-weighted
// specific yield), set once from the real citywide distribution and
// fixed (scripts/compute_roof_quality_bands.py, common.py). Absolute
// thresholds, not per-district quantiles, so "Good" means the same roof
// quality in every neighbourhood, not "average for this one".
const ROOF_QUALITY_FAIR_GOOD_KWH_KWP = 730.0;
const ROOF_QUALITY_GOOD_EXCELLENT_KWH_KWP = 830.0;

function roofQualityBand(kwhKwp) {
  if (kwhKwp >= ROOF_QUALITY_GOOD_EXCELLENT_KWH_KWP) return "Excellent";
  if (kwhKwp >= ROOF_QUALITY_FAIR_GOOD_KWH_KWP) return "Good";
  return "Fair";
}

const ROOF_QUALITY_COLORS = {
  Fair: { fillColor: "#fdd0a2", color: "#c97f2e" },
  Good: { fillColor: "#fd8d3c", color: "#a1551f" },
  Excellent: { fillColor: "#a63603", color: "#5c1e02" },
};

const map = L.map("map").setView(DUESSELDORF_CENTER, DEFAULT_ZOOM);

let stadtteilLayer = null;
let stadtteilLabels = null;
let cityBounds = null;
let buildingLayer = null;
let storageDusLayer = null;
let storageNrwLayer = null;

function slugify(name) {
  const replacements = { "ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss" };
  let out = name.toLowerCase();
  for (const [src, dst] of Object.entries(replacements)) {
    out = out.split(src).join(dst);
  }
  out = out.replace(/[^a-z0-9]+/g, "-");
  out = out.replace(/-+/g, "-").replace(/^-|-$/g, "");
  return out;
}

// --- Info modal: what the page models, the suitability rule, sources,
// and the cooling-demand caveat, all moved out of the main page into one
// place a visitor opens on purpose. ---------------------------------------

function openInfoModal() {
  document.getElementById("info-modal").hidden = false;
}

function closeInfoModal() {
  document.getElementById("info-modal").hidden = true;
}

document.getElementById("info-button").addEventListener("click", openInfoModal);
document.getElementById("info-close").addEventListener("click", closeInfoModal);
document.getElementById("info-backdrop").addEventListener("click", closeInfoModal);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !document.getElementById("info-modal").hidden) closeInfoModal();
});

// --- Side panel: open by default, collapsible without hiding content
// behind a button someone has to discover first. -------------------------

let sidePanelCollapsed = false;

function setSidePanelCollapsed(collapsed) {
  sidePanelCollapsed = collapsed;
  document.getElementById("side-panel").classList.toggle("collapsed", collapsed);
  document.getElementById("panel-toggle").textContent = collapsed ? "Scenarios" : "Hide";
  // The map's flex-basis changes as the panel collapses/expands; Leaflet
  // needs to remeasure after the CSS transition settles, not mid-flight.
  setTimeout(() => map.invalidateSize(), 200);
}

document.getElementById("panel-toggle").addEventListener("click", () => {
  setSidePanelCollapsed(!sidePanelCollapsed);
});

// The panel's top line used to be pinned to the 100% build-out case
// always (data/headline.json), stated once and never updated, while
// every other number in the panel followed whatever build-out level was
// selected: two scenarios described in the same panel, which is why the
// build-out control looked like it did nothing to the headline. Now the
// build-out control is the panel's first control and every number below
// it, including this heading, describes the selected level; see
// renderLevelAnswer(). scripts/build_headline.py and data/headline.json
// are no longer read by the page (see SCOPE.md v3.2).

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
  maxZoom: 19,
}).addTo(map);

function quantile(sortedValues, q) {
  const pos = (sortedValues.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sortedValues[base + 1] !== undefined) {
    return sortedValues[base] + rest * (sortedValues[base + 1] - sortedValues[base]);
  }
  return sortedValues[base];
}

function quantileBreaks(values, nClasses) {
  const sorted = [...values].sort((a, b) => a - b);
  const breaks = [];
  for (let i = 1; i < nClasses; i++) {
    breaks.push(quantile(sorted, i / nClasses));
  }
  return breaks;
}

function colorForValue(value, breaks) {
  for (let i = 0; i < breaks.length; i++) {
    if (value <= breaks[i]) return CHOROPLETH_COLORS[i];
  }
  return CHOROPLETH_COLORS[CHOROPLETH_COLORS.length - 1];
}

function formatNumber(n) {
  return Math.round(n).toLocaleString("en-US");
}

// Unit tiers (SCOPE.md-adjacent UX rule, not a data change): city level
// shows capacity in GW and annual energy in TWh, district level MW and
// GWh, building level kW and kWh. Never mix tiers on one screen, never
// more than four digits before the decimal. City-level figures use 2
// significant figures (matches "1.4 GW", "0.16 GW" on the page); district
// and building figures use fixed decimals, since they never approach a
// range where significant-figure rounding would matter.
function formatGW(kwp) {
  return `${Number(kwp / 1e6).toPrecision(2)} GW`;
}

function formatTWh(mwh) {
  return `${Number(mwh / 1e6).toPrecision(2)} TWh`;
}

// Planar shoelace formula on raw lon/lat. Not a true geodesic area, but
// Duesseldorf's Stadtteile all sit within about 0.2 degrees of latitude of
// each other, so the distortion is close to uniform and relative ranking
// (which shapes are "the big ones") comes out the same as a proper
// projection would give. Only used to decide which names get a permanent
// label, never displayed as a number.
function ringArea(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

function ringCentroid(ring) {
  let cx = 0, cy = 0, area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    const cross = x1 * y2 - x2 * y1;
    area += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  area = area / 2;
  if (area === 0) return ring[0];
  return [cx / (6 * area), cy / (6 * area)];
}

function polygonAreaAndCentroid(geometry) {
  const polys = geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates];
  let totalArea = 0;
  let best = { area: 0, centroid: null };
  for (const poly of polys) {
    const outer = poly[0];
    const area = ringArea(outer);
    totalArea += area;
    if (area > best.area) {
      best = { area, centroid: ringCentroid(outer) };
    }
  }
  return { totalArea, centroid: best.centroid };
}

// No legend: the choropleth is always roof potential, and hover now
// explains it directly (name, possible capacity, qualifying buildings)
// instead of asking a visitor to cross-reference a corner legend.
let potentialBreaksInfo = null;

function activeStyleFn(feature) {
  return {
    fillColor: colorForValue(feature.properties.total_kwp, potentialBreaksInfo.breaks),
    fillOpacity: 0.8,
    color: "#ffffff",
    weight: 1.5,
  };
}

// District hover tooltip: name, possible capacity (MW, the district unit
// tier), and qualifying buildings. Built/installed capacity is
// deliberately left out here, MaStR only reliably geocodes to postcode,
// not Stadtteil (SCOPE.md section 3), and apportioning it by roof-potential
// share was tried once already and rejected as methodologically unsound,
// worst in exactly the districts people click first. Postcode-level
// installed capacity is still exact, it lives in the drill-down panel.
function districtTooltipHtml(props) {
  const mw = props.total_kwp / 1000;
  return (
    `<div class="district-tooltip-name">${props.name}</div>` +
    `<div class="district-tooltip-row">${mw.toFixed(1)} MW possible &middot; ` +
    `${formatNumber(props.qualifying_buildings)} qualifying buildings</div>`
  );
}

// Four labelled figures, not a run-on sentence, each in the city-level
// unit tier (GW capacity, TWh annual energy). The suitability-rule
// sentence that used to sit under these moved into the (i) panel, it
// never belonged in a stats strip.
let cityTotalKwp = null;

function updateCityStrip(features, properties) {
  const totalKwp = features.reduce((sum, f) => sum + f.properties.total_kwp, 0);
  const totalMwh = features.reduce((sum, f) => sum + f.properties.total_mwh, 0);
  const registeredKwp = properties.registered_pv_kwp || 0;
  const realizationPct = registeredKwp ? (registeredKwp / totalKwp) * 100 : 0;
  cityTotalKwp = totalKwp;

  document.getElementById("stat-potential").textContent = formatGW(totalKwp);
  document.getElementById("stat-annual").textContent = formatTWh(totalMwh);
  document.getElementById("stat-built").textContent = formatGW(registeredKwp);
  document.getElementById("stat-realization").textContent = `${realizationPct.toFixed(1)}%`;
  if (cityTotalKwp && coverageData) updateScenarioView();
}

// Plain language: no "specific yield", no "facets" on screen. Roof
// quality replaces both, one word instead of a raw kWh/kWp figure a
// visitor would have no reference point for. The (i) toggle answers
// "what counts as a qualifying building" without leaving the popup.
function buildingPopupHtml(props) {
  const band = roofQualityBand(props.kwh_kwp);
  return `
    <div class="building-popup">
      <h3>Building <button type="button" class="popup-info-btn" onclick="toggleBuildingInfo(this)" aria-label="What counts as a qualifying building">i</button></h3>
      <div class="popup-info-note" hidden>A building qualifies once its roof faces sum to at least 10 kW, excluding north-facing pitched faces. Flat roofs always qualify, since panels on them are angled south.</div>
      <table>
        <tr><td class="label">Space for solar</td><td class="value">${formatNumber(props.total_kwp)} kW</td></tr>
        <tr><td class="label">Would generate</td><td class="value">${formatNumber(props.total_kwh)} kWh a year</td></tr>
        <tr><td class="label">Roof quality</td><td class="value">${band}</td></tr>
      </table>
    </div>`;
}

function toggleBuildingInfo(btn) {
  const note = btn.closest(".building-popup").querySelector(".popup-info-note");
  note.hidden = !note.hidden;
}

// The old top-20-by-yield gold highlight is gone (never explained on the
// page); buildings are now coloured by roof quality instead, the
// cadastre's own kwh_kwp bucketed into three fixed, citywide bands.
function buildingStyle(feature) {
  const band = roofQualityBand(feature.properties.kwh_kwp);
  const colors = ROOF_QUALITY_COLORS[band];
  return { fillColor: colors.fillColor, fillOpacity: 0.75, color: colors.color, weight: 0.5 };
}

let currentDrilldownName = null;

function updateDrilldownPanel(stadtteilFeature) {
  const props = stadtteilFeature.properties;
  currentDrilldownName = props.name;
  document.getElementById("drilldown-title").textContent = props.name;
  document.getElementById("drilldown-buildings").textContent = formatNumber(props.qualifying_buildings);
  document.getElementById("drilldown-kwp").textContent = formatNumber(props.total_kwp) + " kWp";
  document.getElementById("drilldown-mwh").textContent = formatNumber(props.total_mwh) + " MWh";
  document.getElementById("drilldown-battery").textContent = formatNumber(props.battery_potential_kwh) + " kWh";
  document.getElementById("drilldown-status").textContent = "";
  document.getElementById("drilldown-panel").hidden = false;
  updatePostcodeFacts(props.name);
}

function enterDrilldown(stadtteilFeature) {
  updateDrilldownPanel(stadtteilFeature);

  if (stadtteilLayer) map.removeLayer(stadtteilLayer);
  if (buildingLayer) {
    map.removeLayer(buildingLayer);
    buildingLayer = null;
  }

  const slug = slugify(stadtteilFeature.properties.name);
  document.getElementById("drilldown-status").textContent = "Loading buildings...";

  fetch("data/roofs/" + slug + ".json")
    .then((res) => {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then((roofData) => {
      buildingLayer = L.geoJSON(roofData, {
        style: buildingStyle,
        onEachFeature: (feature, layer) => {
          layer.bindPopup(buildingPopupHtml(feature.properties), { className: "building-popup" });
        },
      }).addTo(map);

      document.getElementById("drilldown-status").textContent = "";

      requestAnimationFrame(() => {
        map.invalidateSize();
        map.fitBounds(buildingLayer.getBounds(), { padding: [20, 20] });
      });
    })
    .catch((err) => {
      document.getElementById("drilldown-status").textContent = "Could not load buildings for this Stadtteil.";
      console.error(err);
    });
}

function closeDrilldownPanel() {
  if (buildingLayer) {
    map.removeLayer(buildingLayer);
    buildingLayer = null;
  }
  document.getElementById("drilldown-panel").hidden = true;
}

function exitDrilldown() {
  closeDrilldownPanel();
  if (stadtteilLayer) stadtteilLayer.addTo(map);

  requestAnimationFrame(() => {
    map.invalidateSize();
    if (cityBounds) map.fitBounds(cityBounds, { padding: [10, 10] });
  });
}

document.getElementById("back-to-overview").addEventListener("click", exitDrilldown);

function updateFooter(properties) {
  const footer = document.getElementById("footer");
  if (properties.generated_at) {
    footer.innerHTML =
      "Sources: Solarkataster NRW (opengeodata.nrw.de) and Open Data Duesseldorf, " +
      "Stadtteilgrenzen Duesseldorf 2025. Data pulled " + properties.generated_at + ".";
  }
}

fetch("data/stadtteile.json")
  .then((res) => res.json())
  .then((data) => {
    const values = data.features.map((f) => f.properties.total_kwp);
    potentialBreaksInfo = {
      breaks: quantileBreaks(values, CHOROPLETH_COLORS.length),
      min: Math.min(...values),
      max: Math.max(...values),
    };

    function highlightFeature(e) {
      const layer = e.target;
      layer.setStyle({ weight: 3, color: "#1f2933" });
      layer.bringToFront();
    }

    function resetFeature(e) {
      e.target.setStyle(activeStyleFn(e.target.feature));
    }

    function onEachFeature(feature, layer) {
      // Hover tooltip on every Stadtteil: name, possible capacity, and
      // qualifying buildings, replacing the old legend, since this shows
      // potential in context instead of asking a visitor to read a corner
      // key and do the lookup themselves.
      layer.bindTooltip(districtTooltipHtml(feature.properties), {
        sticky: true,
        className: "stadtteil-tooltip",
      });
      // Click drills into the Stadtteil's buildings; its own numbers move
      // into the drilldown panel, so there is no popup here any more.
      layer.on({
        mouseover: highlightFeature,
        mouseout: resetFeature,
        click: () => enterDrilldown(feature),
      });
    }

    stadtteilLayer = L.geoJSON(data, {
      style: activeStyleFn,
      onEachFeature: onEachFeature,
    }).addTo(map);

    // Permanent labels on the largest Stadtteile by geographic area, so the
    // city reads as named neighbourhoods on first glance, not just on
    // hover. The smaller ones still rely on hover; labelling all 50 at once
    // would clutter the map past readability.
    const withArea = data.features.map((f) => {
      const { totalArea, centroid } = polygonAreaAndCentroid(f.geometry);
      return { name: f.properties.name, area: totalArea, centroid };
    });
    withArea.sort((a, b) => b.area - a.area);
    const LABEL_COUNT = 15;
    stadtteilLabels = L.layerGroup();
    withArea.slice(0, LABEL_COUNT).forEach((s) => {
      if (!s.centroid) return;
      L.marker([s.centroid[1], s.centroid[0]], {
        icon: L.divIcon({
          className: "stadtteil-label",
          html: s.name,
          iconSize: null,
        }),
        interactive: false,
      }).addTo(stadtteilLabels);
    });
    stadtteilLabels.addTo(map);

    updateCityStrip(data.features, data.properties);
    updateFooter(data.properties);

    // Fix: fitBounds/invalidateSize must run after the header and footer
    // text above are in the DOM (their final height changes the map
    // container's flex-computed height) and after the browser has had a
    // chance to lay that out, or Leaflet measures a stale container size.
    // A background tab loading the page can hit the same issue if the
    // layout has not settled by the time this runs, which is why this is
    // also wrapped in requestAnimationFrame rather than run inline.
    requestAnimationFrame(() => {
      map.invalidateSize();
      cityBounds = stadtteilLayer.getBounds();
      map.fitBounds(cityBounds, { padding: [10, 10] });
    });
  })
  .catch((err) => {
    document.getElementById("stat-potential").textContent = "?";
    console.error(err);
  });

// --- Storage layer ---------------------------------------------------------

function formatKw(kw) {
  return kw >= 1000 ? `${(kw / 1000).toLocaleString("en-US")} MW` : `${formatNumber(kw)} kW`;
}

function storageRadius(kw) {
  return Math.min(4 + Math.sqrt(kw) * 0.3, 34);
}

function storageDusStyle(feature) {
  const planned = feature.properties.status === "In Planung";
  return {
    radius: storageRadius(feature.properties.kw),
    fillColor: planned ? "#a63603" : "#2b6cb0",
    fillOpacity: planned ? 0.25 : 0.75,
    color: planned ? "#a63603" : "#1a4971",
    weight: planned ? 2 : 1,
    dashArray: planned ? "4,4" : null,
  };
}

function storageNrwStyle() {
  return {
    radius: 4,
    fillColor: "#6b7280",
    fillOpacity: 0.5,
    color: "#3f4650",
    weight: 1,
  };
}

// One interaction pattern for the whole page: storage dots hover like
// districts do (name/summary line, detail line), not click-for-popup.
// Reuses the same tooltip classes the district hover already uses.
function storageTooltipHtml(props, extraLine) {
  const planned = props.status === "In Planung";
  const statusText = planned ? "Not yet built, In Planung" : props.status;
  return (
    `<div class="district-tooltip-name">${formatKw(props.kw)} storage unit</div>` +
    `<div class="district-tooltip-row">${props.chemistry} &middot; ${props.commissioning}</div>` +
    `<div class="district-tooltip-row">${statusText}${extraLine ? " &middot; " + extraLine : ""}</div>`
  );
}

fetch("data/storage_duesseldorf.json")
  .then((res) => res.json())
  .then((data) => {
    storageDusLayer = L.geoJSON(data, {
      pointToLayer: (feature, latlng) => L.circleMarker(latlng, storageDusStyle(feature)),
      onEachFeature: (feature, layer) => {
        layer.bindTooltip(storageTooltipHtml(feature.properties), {
          sticky: true,
          className: "stadtteil-tooltip",
        });
      },
    });
    // Draw the largest (planned) unit last within the layer so it always
    // renders on top of the smaller built units, since it is meant to be
    // the most prominent object on this layer.
    storageDusLayer.eachLayer((l) => {
      if (l.feature.properties.is_largest) l.bringToFront();
    });

    document.getElementById("storage-note").textContent = data.properties.citywide_note;

    document.getElementById("layer-storage-dus").addEventListener("change", (e) => {
      if (e.target.checked) {
        storageDusLayer.addTo(map);
      } else {
        map.removeLayer(storageDusLayer);
      }
    });
  })
  .catch((err) => console.error(err));

fetch("data/storage_nrw_large.json")
  .then((res) => res.json())
  .then((data) => {
    storageNrwLayer = L.geoJSON(data, {
      pointToLayer: (feature, latlng) => L.circleMarker(latlng, storageNrwStyle(feature)),
      onEachFeature: (feature, layer) => {
        layer.bindTooltip(storageTooltipHtml(feature.properties, feature.properties.landkreis), {
          sticky: true,
          className: "stadtteil-tooltip",
        });
      },
    });

    document.getElementById("layer-storage-nrw").addEventListener("change", (e) => {
      const hint = document.getElementById("nrw-zoom-hint");
      if (e.target.checked) {
        storageNrwLayer.addTo(map);
        hint.hidden = false;
      } else {
        map.removeLayer(storageNrwLayer);
        hint.hidden = true;
      }
    });
  })
  .catch((err) => console.error(err));

// --- Postcode facts, shown inside the Stadtteil drilldown panel ------------

let postcodeFacts = null;

fetch("data/postcode_facts.json")
  .then((res) => res.json())
  .then((data) => {
    postcodeFacts = data;
    if (currentDrilldownName) updatePostcodeFacts(currentDrilldownName);
  })
  .catch((err) => console.error(err));

function postcodeFactsHtml(stadtteilName) {
  if (!postcodeFacts || !postcodeFacts[stadtteilName]) return "";
  const entries = postcodeFacts[stadtteilName];

  let headline;
  if (entries.length === 1 || entries[0].share_pct >= 70) {
    headline = `Mostly in postcode ${entries[0].plz}`;
  } else {
    headline = "Spans " + entries.map((e) => e.plz).join(", ");
  }

  let rows = "";
  entries.forEach((e) => {
    rows += `
      <div class="postcode-row">
        <div class="postcode-row-head">${e.plz} <span class="postcode-share">(${e.share_pct.toFixed(0)}% of this neighbourhood's potential)</span></div>
        <table>
          <tr><td class="label">Installed PV</td><td class="value">${formatNumber(e.registered_kwp)} kWp</td></tr>
          <tr><td class="label">Postcode's own potential</td><td class="value">${formatNumber(e.own_total_kwp)} kWp</td></tr>
          <tr><td class="label">Postcode's realization</td><td class="value">${e.realization_pct.toFixed(1)}%</td></tr>
          <tr><td class="label">Registered storage</td><td class="value">${formatNumber(e.storage_units)} units, ${formatNumber(e.storage_kwh)} kWh</td></tr>
        </table>
      </div>`;
  });

  return `<h3>${headline}</h3>${rows}`;
}

function updatePostcodeFacts(stadtteilName) {
  document.getElementById("drilldown-postcodes").innerHTML = postcodeFactsHtml(stadtteilName);
}

// --- Scenario panel: heatwave derate, city coverage, battery case ----------
//
// Both datasets here are fully precomputed (scripts/build_generation.py,
// build_coverage.py); this file only ever selects a value out of them for
// the current toggle state, never calculates one. See SCOPE.md section 4.
// (build_battery.py's output is no longer read here, see SCOPE.md v3.2.)

let generationData = null;
let coverageData = null;
let scenarioHeatwave = false;
let scenarioBuildoutPct = 11.6;
let scenarioAcSurge = false;

// IEA, "Staying cool without overheating the energy system" (28 July
// 2025), https://www.iea.org/commentaries/staying-cool-without-overheating-the-energy-system
// France's evening electricity demand ran 25% above off-season levels
// during the 2025 heatwaves. A France analogue, never a Duesseldorf
// measurement: German residential air conditioning ownership is low
// enough that a domestic figure of this kind does not really exist to
// cite. No demand curve is drawn, there is no hourly consumption dataset
// for Duesseldorf; this single cited figure is stated as text when the
// toggle is on. It changes no generation number.
const AC_SURGE_PCT = 25;

// generation_scenarios.json's keys come from Python's f"{buildout_pct}"
// (e.g. "normal_30.0"), which always keeps one decimal place. JS drops the
// trailing .0 for whole numbers when a number is concatenated into a
// string, so every lookup must go through this fixed formatting or a
// build-out of 30/50/100% silently misses the key.
function buildoutKeySuffix() {
  return scenarioBuildoutPct.toFixed(1);
}

function scenarioKey() {
  return (scenarioHeatwave ? "heatwave" : "normal") + "_" + buildoutKeySuffix();
}

// City-level annual figures, so TWh (the same tier as the header strip),
// not GWh. coverage.json reports these in GWh, converted here for
// display only.
function formatTWhFromGwh(gwh) {
  return `${Number(gwh / 1000).toPrecision(2)} TWh`;
}

function formatDate(iso) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${months[m - 1]} ${y}`;
}

// The panel's own top line, and it must describe the SELECTED build-out
// level, not a fixed one, or the build-out control looks like it does
// nothing. Both figures already exist in data/coverage.json per level,
// this only ever picks one out, never computes a new one.
function renderLevelAnswer() {
  const cov = coverageData.levels.find((l) => l.buildout_pct === scenarioBuildoutPct);
  const heading = scenarioBuildoutPct === 11.6
    ? "At today's build-out"
    : `At ${cov.buildout_label} of roofs covered`;

  document.getElementById("level-answer-heading").textContent = heading;
  document.getElementById("level-stats").innerHTML = `
    <div class="level-stat">
      <div class="level-stat-value">${formatTWhFromGwh(cov.annual_gwh)}</div>
      <div class="level-stat-label">a year</div>
    </div>
    <div class="level-stat">
      <div class="level-stat-value">${cov.coverage_pct}%</div>
      <div class="level-stat-label">of the city's electricity</div>
    </div>`;
}

// One ladder instead of two separate derate figures that read as a
// contradiction ("5.3% less" next to "6.5% lost", measuring different
// things: heatwave-vs-normal, and normal-vs-lab-rating). Three steps
// down from the same lab rating: normal summer days already run hot in
// full midday sun (panels are rated at 25 degC, not Duesseldorf ambient),
// the heatwave subtracts again on top of that, it does not replace it.
function renderDerateLadder() {
  const normalC = generationData.citywide["normal_" + buildoutKeySuffix()];
  const heatC = generationData.citywide["heatwave_" + buildoutKeySuffix()];
  const labMwh = normalC.total_rated_kwh / 1000;
  const normalMwh = normalC.total_derated_kwh / 1000;
  const heatMwh = heatC.total_derated_kwh / 1000;
  const normalLostPct = (1 - normalC.total_derated_kwh / normalC.total_rated_kwh) * 100;
  const heatLostPct = (1 - heatMwh / normalMwh) * 100;

  document.getElementById("derate-ladder").innerHTML = `
    <table class="ladder-table">
      <tr>
        <td class="ladder-label">Lab rating (25&deg;C)</td>
        <td class="ladder-value">${formatNumber(labMwh)} MWh</td>
        <td class="ladder-note"></td>
      </tr>
      <tr>
        <td class="ladder-label">Normal summer day</td>
        <td class="ladder-value">${formatNumber(normalMwh)} MWh</td>
        <td class="ladder-note">${normalLostPct.toFixed(1)}% lost to everyday heat</td>
      </tr>
      <tr>
        <td class="ladder-label">Heatwave day</td>
        <td class="ladder-value">${formatNumber(heatMwh)} MWh</td>
        <td class="ladder-note">${heatLostPct.toFixed(1)}% lost again to the heatwave</td>
      </tr>
    </table>
    <div class="ladder-caption">Panels are rated at 25&deg;C in a lab and run hotter than that in full sun on any clear summer day, not only during heatwaves.</div>`;
}

// Multi-day window detail, heatwave only; the annual/coverage sentence
// that used to sit here is gone, it duplicated renderLevelAnswer() above.
function renderScenarioHeadline() {
  const headline = document.getElementById("scenario-headline");
  if (!scenarioHeatwave) {
    headline.innerHTML = "";
    return;
  }
  const c = generationData.citywide[scenarioKey()];
  const windowLostKwh = c.window_total_rated_kwh - c.window_total_derated_kwh;
  headline.innerHTML = `Across the full 24&ndash;28 June heatwave window: ` +
    `${formatNumber(c.window_total_derated_kwh / 1000)} MWh generated, ` +
    `${formatNumber(windowLostKwh / 1000)} MWh lost to derate, average daylight derate ` +
    `${c.avg_daylight_derate_pct}%.`;
}

// Storage cut down to one line (UX pass round two, commit 4): the
// battery-dispatch table (shiftable kWh, evening multiples) is gone,
// see SCOPE.md v3.2. No ratios, no hour windows, no dispatch story, just
// the capacity these rooftops would justify at the selected build-out
// level, 1.5 kWh per kW of solar (HTW Berlin upper bound, SCOPE.md
// section 3), a fact stated, not an argument made.
const STORAGE_KWH_PER_KW = 1.5;

function renderStorageLine() {
  const capacityKwh = cityTotalKwp * (scenarioBuildoutPct / 100) * STORAGE_KWH_PER_KW;
  document.getElementById("storage-line").innerHTML =
    `These rooftops would justify about <strong>${formatNumber(capacityKwh / 1000)} MWh</strong> of battery ` +
    `storage, at 1.5 kWh per kW of solar (HTW Berlin).`;
}

// The hourly loss strip replaces the rated-vs-derated line chart
// (removed v3.1). Diagnosis: the chart was correct, 24 points, a real
// zero-based axis, not "growing" or "exponential". The problem was
// scale, a 5.3% heatwave-vs-normal difference is invisible next to a
// ~93,000 kWh axis, so it rendered as two hairline-apart curves. This
// strip plots the derate percentage itself, hour by hour, which is the
// shape that actually needed to be legible: the loss concentrates in
// the hottest hours, it is not spread evenly across the day.
//
// Per-hour loss = 1 - derated/rated, from the same two precomputed
// arrays the old chart plotted (generation_scenarios.json). This is a
// display ratio from two already-precomputed numbers, the same pattern
// already used throughout this file (renderDerateLadder's lost-percent figures,
// updateCityStrip's realizationPct), not a new calculation of anything
// the Python side did not already model.
const LOSS_STRIP_COLOR_LOW = [254, 237, 222]; // #feedde, no loss
const LOSS_STRIP_COLOR_HIGH = [166, 54, 3]; // #a63603, worst hour of the day

function lossStripColor(fraction) {
  const [r0, g0, b0] = LOSS_STRIP_COLOR_LOW;
  const [r1, g1, b1] = LOSS_STRIP_COLOR_HIGH;
  const r = Math.round(r0 + (r1 - r0) * fraction);
  const g = Math.round(g0 + (g1 - g0) * fraction);
  const b = Math.round(b0 + (b1 - b0) * fraction);
  return `rgb(${r}, ${g}, ${b})`;
}

function renderLossStrip() {
  const c = generationData.citywide[scenarioKey()];
  const hourlyLossPct = c.hourly_rated_kwh.map((rated, h) => {
    const derated = c.hourly_derated_kwh[h];
    return rated > 0 ? (1 - derated / rated) * 100 : 0;
  });

  const maxLossPct = Math.max(...hourlyLossPct);
  const worstHour = hourlyLossPct.indexOf(maxLossPct);

  const strip = document.getElementById("loss-strip");
  strip.innerHTML = hourlyLossPct
    .map((pct, h) => {
      const fraction = maxLossPct > 0 ? pct / maxLossPct : 0;
      const label = `${String(h).padStart(2, "0")}:00, ${pct.toFixed(1)}% lost to heat`;
      return `<div class="loss-block" style="background:${lossStripColor(fraction)}" title="${label}"></div>`;
    })
    .join("");

  let caption = `Loss by hour, relative to the day's peak. Worst: ` +
    `${maxLossPct.toFixed(1)}% at ${String(worstHour).padStart(2, "0")}:00.`;
  if (scenarioAcSurge) {
    caption += ` Cooling demand runs an estimated +${AC_SURGE_PCT}% in the evening (France analogue, see (i)); ` +
      `this does not change the generation loss shown above.`;
  }
  document.getElementById("loss-strip-caption").textContent = caption;
}

function updateScenarioView() {
  if (!generationData || !coverageData || cityTotalKwp === null) return;
  renderLevelAnswer();
  renderDerateLadder();
  renderScenarioHeadline();
  renderLossStrip();
  renderStorageLine();
}

document.getElementById("toggle-heatwave").addEventListener("change", (e) => {
  scenarioHeatwave = e.target.checked;
  updateScenarioView();
});

document.getElementById("toggle-ac-surge").addEventListener("change", (e) => {
  scenarioAcSurge = e.target.checked;
  updateScenarioView();
});

document.querySelectorAll(".buildout-step").forEach((btn) => {
  btn.addEventListener("click", () => {
    scenarioBuildoutPct = parseFloat(btn.dataset.pct);
    document.querySelectorAll(".buildout-step").forEach((b) => b.classList.toggle("active", b === btn));
    updateScenarioView();
  });
});

Promise.all([
  fetch("data/generation_scenarios.json").then((res) => res.json()),
  fetch("data/coverage.json").then((res) => res.json()),
])
  .then(([gen, cov]) => {
    generationData = gen;
    coverageData = cov;
    updateScenarioView();
  })
  .catch((err) => {
    document.getElementById("scenario-headline").textContent = "Could not load scenario data.";
    console.error(err);
  });
