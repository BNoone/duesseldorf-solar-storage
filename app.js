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

function showLegend(title, breaks, minValue, maxValue) {
  const legend = L.control({ position: "bottomright" });
  legend.onAdd = function () {
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
  legend.addTo(map);
}

function updateHeaderTotals(features, properties) {
  const totalBuildings = features.reduce((sum, f) => sum + f.properties.qualifying_buildings, 0);
  const totalKwp = features.reduce((sum, f) => sum + f.properties.total_kwp, 0);
  const totalMwh = features.reduce((sum, f) => sum + f.properties.total_mwh, 0);

  let html =
    `<strong>${formatNumber(totalBuildings)}</strong> qualifying buildings &middot; ` +
    `<strong>${formatNumber(totalKwp)} kWp</strong> roof potential &middot; ` +
    `<strong>${formatNumber(totalMwh)} MWh</strong>/year`;

  if (properties.registered_pv_kwp) {
    const realizationPct = (properties.registered_pv_kwp / totalKwp) * 100;
    html +=
      ` &middot; <strong>${formatNumber(properties.registered_pv_kwp)} kWp</strong> registered, ` +
      `<strong>${realizationPct.toFixed(1)}%</strong> of potential built`;
  }

  document.getElementById("header-totals").innerHTML = html;

  if (properties.qualifying_rule_sentence) {
    document.getElementById("header-rule").textContent = properties.qualifying_rule_sentence;
  }
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
    const breaks = quantileBreaks(values, CHOROPLETH_COLORS.length);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);

    function styleFeature(feature) {
      return {
        fillColor: colorForValue(feature.properties.total_kwp, breaks),
        fillOpacity: 0.8,
        color: "#ffffff",
        weight: 1,
      };
    }

    function highlightFeature(e) {
      const layer = e.target;
      layer.setStyle({ weight: 3, color: "#1f2933" });
      layer.bringToFront();
    }

    function resetFeature(e) {
      stadtteilLayer.resetStyle(e.target);
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
      style: styleFeature,
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

    showLegend("Roof potential (kWp)", breaks, minValue, maxValue);
    updateHeaderTotals(data.features, data.properties);
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
    document.getElementById("header-totals").textContent = "Could not load stadtteile.json.";
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
