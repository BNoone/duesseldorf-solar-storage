const DUESSELDORF_CENTER = [51.2277, 6.7735];
const DEFAULT_ZOOM = 12;

// ColorBrewer "Oranges", 5-class sequential single-hue scale.
const CHOROPLETH_COLORS = ["#feedde", "#fdbe85", "#fd8d3c", "#e6550d", "#a63603"];

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

let legendControl = null;

// Re-callable so the scenario panel's "colour the map" toggle can swap the
// legend between roof potential and scenario generation without leaving a
// stale control behind.
function updateLegend(title, breaks, minValue, maxValue) {
  if (legendControl) map.removeControl(legendControl);
  legendControl = L.control({ position: "bottomright" });
  legendControl.onAdd = function () {
    const div = L.DomUtil.create("div", "legend");
    const edges = [minValue, ...breaks, maxValue];
    let html = `<div class="legend-title">${title}</div>`;
    for (let i = 0; i < CHOROPLETH_COLORS.length; i++) {
      const lo = formatNumber(edges[i]);
      const hi = formatNumber(edges[i + 1]);
      html += `
        <div class="legend-row">
          <span class="swatch" style="background:${CHOROPLETH_COLORS[i]}"></span>
          <span>${lo} &ndash; ${hi}</span>
        </div>`;
    }
    div.innerHTML = html;
    return div;
  };
  legendControl.addTo(map);
}

// Which per-Stadtteil value currently drives the choropleth: static roof
// potential (the default, always available) or the selected scenario's
// generation (only once the scenario panel's own data has loaded and its
// "colour the map" toggle is on). Kept as one function so hover/reset and
// the initial paint never disagree about the current styling.
let colorMode = "potential";
let potentialBreaksInfo = null;
let scenarioBreaksInfo = null;

function activeStyleFn(feature) {
  if (colorMode === "scenario" && scenarioBreaksInfo) {
    const st = generationData.by_stadtteil[feature.properties.name];
    const val = st ? st[scenarioKey()].total_derated_kwh : 0;
    return {
      fillColor: colorForValue(val, scenarioBreaksInfo.breaks),
      fillOpacity: 0.8,
      color: "#ffffff",
      weight: 1,
    };
  }
  return {
    fillColor: colorForValue(feature.properties.total_kwp, potentialBreaksInfo.breaks),
    fillOpacity: 0.8,
    color: "#ffffff",
    weight: 1,
  };
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

function buildingPopupHtml(props) {
  return `
    <div class="building-popup">
      <h3>${props.highlighted ? "Top 20 building" : "Building"}</h3>
      <table>
        <tr><td class="label">Roof potential</td><td class="value">${formatNumber(props.total_kwp)} kWp</td></tr>
        <tr><td class="label">Annual yield</td><td class="value">${formatNumber(props.total_kwh / 1000)} MWh</td></tr>
        <tr><td class="label">Specific yield</td><td class="value">${formatNumber(props.kwh_kwp)} kWh/kWp</td></tr>
        <tr><td class="label">Facets</td><td class="value">${props.facet_count}</td></tr>
      </table>
    </div>`;
}

function buildingStyle(feature) {
  return feature.properties.highlighted
    ? { fillColor: "#ffd700", fillOpacity: 0.9, color: "#8a6d00", weight: 1 }
    : { fillColor: "#fd8d3c", fillOpacity: 0.7, color: "#a1551f", weight: 0.5 };
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
      // Hover tooltip on every Stadtteil, so no shape is ever unnamed.
      layer.bindTooltip(feature.properties.name, {
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

    updateLegend("Roof potential (kWp)", potentialBreaksInfo.breaks, potentialBreaksInfo.min, potentialBreaksInfo.max);
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
let scenarioChart = null;
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
// for Duesseldorf; this single cited figure only shades and labels the
// chart's existing evening window. It changes no generation number.
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

function formatGwh(n) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 1 }) + " GWh";
}

function formatDate(iso) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${months[m - 1]} ${y}`;
}

function computeScenarioBreaks(key) {
  const values = Object.values(generationData.by_stadtteil).map((st) => st[key].total_derated_kwh);
  return {
    breaks: quantileBreaks(values, CHOROPLETH_COLORS.length),
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function recolorMap() {
  if (!stadtteilLayer || !generationData) return;
  if (colorMode === "scenario") {
    scenarioBreaksInfo = computeScenarioBreaks(scenarioKey());
    const dayLabel = scenarioHeatwave ? "Heatwave worst day" : "Normal day";
    updateLegend(`${dayLabel} generation (kWh)`, scenarioBreaksInfo.breaks, scenarioBreaksInfo.min, scenarioBreaksInfo.max);
  } else {
    updateLegend("Roof potential (kWp)", potentialBreaksInfo.breaks, potentialBreaksInfo.min, potentialBreaksInfo.max);
  }
  stadtteilLayer.eachLayer((l) => l.setStyle(activeStyleFn(l.feature)));
}

function renderScenarioHeadline() {
  const key = scenarioKey();
  const c = generationData.citywide[key];
  const cov = coverageData.levels.find((l) => l.buildout_pct === scenarioBuildoutPct);

  let html = "";
  if (scenarioHeatwave) {
    const normalC = generationData.citywide["normal_" + buildoutKeySuffix()];
    const diffKwh = normalC.total_derated_kwh - c.total_derated_kwh;
    const diffPct = (diffKwh / normalC.total_derated_kwh) * 100;
    const windowLostKwh = c.window_total_rated_kwh - c.window_total_derated_kwh;
    html += `<strong>${formatNumber(c.total_derated_kwh)} kWh</strong> generated on the heatwave's worst day ` +
      `(${formatDate(c.day)}), against <strong>${formatNumber(normalC.total_derated_kwh)} kWh</strong> on the ` +
      `matched normal day (${formatDate(normalC.day)}): <strong>${formatNumber(diffKwh)} kWh less, ${diffPct.toFixed(1)}%</strong>, ` +
      `at ${cov.buildout_label} build-out.`;
    html += `<span class="headline-note">Worst-hour derate ${c.worst_hour_derate_pct}%. Across the full ` +
      `24&ndash;28 June window: ${formatNumber(c.window_total_derated_kwh)} kWh generated, ` +
      `${formatNumber(windowLostKwh)} kWh lost to derate, average daylight derate ${c.avg_daylight_derate_pct}%.</span>`;
  } else {
    const lostPct = (1 - c.total_derated_kwh / c.total_rated_kwh) * 100;
    html += `<strong>${formatNumber(c.total_derated_kwh)} kWh</strong> generated on a matched normal day ` +
      `(${formatDate(c.day)}) at ${cov.buildout_label} build-out (rated ${formatNumber(c.total_rated_kwh)} kWh, ` +
      `${lostPct.toFixed(1)}% lost to ordinary heat derate, not a heatwave effect).`;
  }
  html += `<span class="headline-note">At ${cov.buildout_label} build-out, Duesseldorf's rooftops generate ` +
    `${formatGwh(cov.annual_gwh)} a year, ${cov.coverage_pct}% of the city's own ${formatGwh(coverageData.city_consumption_gwh)} ` +
    `electricity use (${coverageData.city_consumption_year}).</span>`;

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

// Shades the chart's evening window always; when the AC-surge toggle is on,
// darkens that shading and labels it with the cited France-analogue figure.
// No demand curve is drawn, this plugin only annotates the existing
// generation lines, it never adds a dataset of its own.
function eveningShadePlugin() {
  return {
    id: "eveningShade",
    beforeDatasetsDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      if (!chartArea) return;
      const xScale = scales.x;
      const eveningHours = batteryData.evening_hours;
      // A plain number passed to getPixelForValue is used directly as the
      // category's index and maps to its true position regardless of
      // autoSkip, which only hides tick LABELS, not the underlying scale.
      // getPixelForTick indexes into the post-autoSkip visible-tick array
      // instead, so it silently mispositions the shading once labels skip.
      const hourWidth = xScale.getPixelForValue(1) - xScale.getPixelForValue(0);
      const xStart = xScale.getPixelForValue(eveningHours[0]) - hourWidth / 2;
      const xEnd = xScale.getPixelForValue(eveningHours[eveningHours.length - 1]) + hourWidth / 2;
      ctx.save();
      ctx.fillStyle = scenarioAcSurge ? "rgba(198, 40, 40, 0.16)" : "rgba(166, 54, 3, 0.08)";
      ctx.fillRect(xStart, chartArea.top, xEnd - xStart, chartArea.bottom - chartArea.top);
      if (scenarioAcSurge) {
        const midX = (xStart + xEnd) / 2;
        ctx.fillStyle = "#a61b1b";
        ctx.textAlign = "center";
        ctx.font = "600 11px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillText(`+${AC_SURGE_PCT}% evening demand`, midX, chartArea.top + 14);
        ctx.font = "10px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillText("(France analogue, IEA)", midX, chartArea.top + 27);
      }
      ctx.restore();
    },
  };
}

function renderScenarioChart() {
  const c = generationData.citywide[scenarioKey()];
  const labels = c.hourly_rated_kwh.map((_, h) => String(h).padStart(2, "0") + ":00");

  const data = {
    labels,
    datasets: [
      {
        label: "Rated",
        data: c.hourly_rated_kwh,
        borderColor: "#c9c3b6",
        backgroundColor: "transparent",
        borderDash: [4, 3],
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.25,
      },
      {
        label: "Derated",
        data: c.hourly_derated_kwh,
        borderColor: "#a63603",
        backgroundColor: "rgba(166, 54, 3, 0.1)",
        fill: true,
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.25,
      },
    ],
  };

  if (scenarioChart) {
    scenarioChart.data = data;
    scenarioChart.update();
    return;
  }

  const ctx = document.getElementById("scenario-chart").getContext("2d");
  scenarioChart = new Chart(ctx, {
    type: "line",
    data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12 }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { callback: (v) => formatNumber(v) } },
      },
      plugins: {
        legend: { position: "top", labels: { boxWidth: 12, font: { size: 11 } } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatNumber(ctx.parsed.y)} kWh` } },
      },
    },
    plugins: [eveningShadePlugin()],
  });
}

function renderChartCaption() {
  const caption = document.getElementById("chart-caption");
  caption.textContent = scenarioAcSurge
    ? "Hourly generation, rated (undegraded) vs derated. Evening (18:00–21:59) shaded, labelled with the cited AC-surge figure. That figure describes demand; the generation lines above are unchanged by it."
    : "Hourly generation, rated (undegraded) vs derated. Evening (18:00–21:59) shaded.";
}

function updateScenarioView() {
  if (!generationData || !coverageData || !batteryData) return;
  renderScenarioHeadline();
  renderScenarioChart();
  renderScenarioStats();
  renderChartCaption();
  if (colorMode === "scenario") recolorMap();
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

document.getElementById("toggle-map-color").addEventListener("change", (e) => {
  colorMode = e.target.checked ? "scenario" : "potential";
  recolorMap();
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
