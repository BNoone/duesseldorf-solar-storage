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

// --- Panel's top line: the direct answer to the header's own subtitle,
// precomputed (scripts/build_headline.py) from two figures already
// verified elsewhere on the page, never calculated here. -----------------

fetch("data/headline.json")
  .then((res) => res.json())
  .then((data) => {
    document.getElementById("answer-full-pct").textContent = `${data.full_buildout_coverage_pct}%`;
    document.getElementById("answer-heat-pct").textContent = `${data.heatwave_coverage_pct}%`;
  })
  .catch((err) => console.error(err));

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
function updateCityStrip(features, properties) {
  const totalKwp = features.reduce((sum, f) => sum + f.properties.total_kwp, 0);
  const totalMwh = features.reduce((sum, f) => sum + f.properties.total_mwh, 0);
  const registeredKwp = properties.registered_pv_kwp || 0;
  const realizationPct = registeredKwp ? (registeredKwp / totalKwp) * 100 : 0;

  document.getElementById("stat-potential").textContent = formatGW(totalKwp);
  document.getElementById("stat-annual").textContent = formatTWh(totalMwh);
  document.getElementById("stat-built").textContent = formatGW(registeredKwp);
  document.getElementById("stat-realization").textContent = `${realizationPct.toFixed(1)}%`;
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

function storagePopupHtml(props) {
  const planned = props.status === "In Planung";
  return `
    <div class="storage-popup">
      <h3>${formatKw(props.kw)} storage unit</h3>
      ${planned ? '<div class="planned-warning">Not yet built, In Planung</div>' : ""}
      <table>
        <tr><td class="label">Capacity</td><td class="value">${formatKw(props.kw)}</td></tr>
        <tr><td class="label">Chemistry</td><td class="value">${props.chemistry}</td></tr>
        <tr><td class="label">Commissioning</td><td class="value">${props.commissioning}</td></tr>
        <tr><td class="label">Status</td><td class="value">${props.status}</td></tr>
      </table>
    </div>`;
}

function storageNrwPopupHtml(props) {
  return `
    <div class="storage-popup">
      <h3>${formatKw(props.kw)} storage unit</h3>
      <table>
        <tr><td class="label">Capacity</td><td class="value">${formatKw(props.kw)}</td></tr>
        <tr><td class="label">Chemistry</td><td class="value">${props.chemistry}</td></tr>
        <tr><td class="label">Landkreis</td><td class="value">${props.landkreis}</td></tr>
        <tr><td class="label">Status</td><td class="value">${props.status}</td></tr>
      </table>
    </div>`;
}

fetch("data/storage_duesseldorf.json")
  .then((res) => res.json())
  .then((data) => {
    storageDusLayer = L.geoJSON(data, {
      pointToLayer: (feature, latlng) => L.circleMarker(latlng, storageDusStyle(feature)),
      onEachFeature: (feature, layer) => {
        layer.bindPopup(storagePopupHtml(feature.properties), { className: "storage-popup" });
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
        layer.bindPopup(storageNrwPopupHtml(feature.properties), { className: "storage-popup" });
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
// All three datasets here are fully precomputed (scripts/build_generation.py,
// build_coverage.py, build_battery.py); this file only ever selects a value
// out of them for the current toggle state, never calculates one. See
// SCOPE.md section 4.

let generationData = null;
let coverageData = null;
let batteryData = null;
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

// The payoff of the panel: normal day vs heatwave day, always both shown
// together (not swapped by the heatwave toggle, which instead picks
// which of the two the chart below plots hour by hour). City-level
// figures, so MWh, the same tier the rest of this comparison already
// uses (see build_generation.py's own headline print).
function renderBigNumbers() {
  const normalC = generationData.citywide["normal_" + buildoutKeySuffix()];
  const heatC = generationData.citywide["heatwave_" + buildoutKeySuffix()];
  const normalMwh = normalC.total_derated_kwh / 1000;
  const heatMwh = heatC.total_derated_kwh / 1000;
  const diffPct = (1 - heatMwh / normalMwh) * 100;

  document.getElementById("big-numbers").innerHTML = `
    <div class="big-number">
      <div class="big-number-label">Normal day</div>
      <div class="big-number-value">${formatNumber(normalMwh)} MWh</div>
    </div>
    <div class="big-number">
      <div class="big-number-label">Heatwave day</div>
      <div class="big-number-value">${formatNumber(heatMwh)} MWh
        <span class="big-number-delta">(${diffPct.toFixed(1)}% less)</span></div>
    </div>`;
}

function renderScenarioHeadline() {
  const key = scenarioKey();
  const c = generationData.citywide[key];
  const cov = coverageData.levels.find((l) => l.buildout_pct === scenarioBuildoutPct);

  let html = "";
  if (scenarioHeatwave) {
    const windowLostKwh = c.window_total_rated_kwh - c.window_total_derated_kwh;
    html += `Worst-hour derate <strong>${c.worst_hour_derate_pct}%</strong>. Across the full 24&ndash;28 June ` +
      `window: ${formatNumber(c.window_total_derated_kwh)} kWh generated, ${formatNumber(windowLostKwh)} kWh ` +
      `lost to derate, average daylight derate ${c.avg_daylight_derate_pct}%.`;
  } else {
    const lostPct = (1 - c.total_derated_kwh / c.total_rated_kwh) * 100;
    html += `Rated ${formatNumber(c.total_rated_kwh)} kWh, ${lostPct.toFixed(1)}% lost to ordinary heat derate, ` +
      `not a heatwave effect.`;
  }
  html += `<span class="headline-note">At ${cov.buildout_label} build-out, Duesseldorf's rooftops generate ` +
    `${formatTWhFromGwh(cov.annual_gwh)} a year, ${cov.coverage_pct}% of the city's own ` +
    `${formatTWhFromGwh(coverageData.city_consumption_gwh)} electricity use (${coverageData.city_consumption_year}).</span>`;

  document.getElementById("scenario-headline").innerHTML = html;
}

function renderScenarioStats() {
  const b = batteryData.citywide[scenarioKey()];
  document.getElementById("scenario-stats").innerHTML = `
    <h3>Battery case, 1.5 kWh/kWp</h3>
    <table>
      <tr><td class="label">Battery capacity</td><td class="value">${formatNumber(b.battery_kwh)} kWh</td></tr>
      <tr><td class="label">Midday generation (11:00&ndash;15:59)</td><td class="value">${formatNumber(b.midday_kwh)} kWh</td></tr>
      <tr><td class="label">Evening generation (18:00&ndash;21:59)</td><td class="value">${formatNumber(b.evening_kwh)} kWh</td></tr>
      <tr><td class="label">Shiftable to evening</td><td class="value">${formatNumber(b.shiftable_kwh)} kWh</td></tr>
      <tr><td class="label">Evening with battery</td><td class="value">${formatNumber(b.evening_with_battery_kwh)} kWh</td></tr>
    </table>
    <div class="stats-note">A battery this size could shift ${b.shiftable_pct_of_midday}% of midday's generation,
    raising evening generation to ${b.evening_multiple}&times; what those hours produce on their own. Capacity limit
    only, no round-trip loss modelled.</div>`;
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
// already used throughout this file (renderBigNumbers' diffPct,
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
  if (!generationData || !coverageData || !batteryData) return;
  renderBigNumbers();
  renderScenarioHeadline();
  renderLossStrip();
  renderScenarioStats();
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
  fetch("data/battery_case.json").then((res) => res.json()),
])
  .then(([gen, cov, batt]) => {
    generationData = gen;
    coverageData = cov;
    batteryData = batt;
    updateScenarioView();
  })
  .catch((err) => {
    document.getElementById("scenario-headline").textContent = "Could not load scenario data.";
    console.error(err);
  });
