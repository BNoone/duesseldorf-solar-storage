const DUESSELDORF_CENTER = [51.2277, 6.7735];
const DEFAULT_ZOOM = 12;

// ColorBrewer "Oranges", 5-class sequential single-hue scale.
const CHOROPLETH_COLORS = ["#feedde", "#fdbe85", "#fd8d3c", "#e6550d", "#a63603"];

const map = L.map("map").setView(DUESSELDORF_CENTER, DEFAULT_ZOOM);

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

function buildLegend(breaks, minValue, maxValue) {
  const legend = L.control({ position: "bottomright" });
  legend.onAdd = function () {
    const div = L.DomUtil.create("div", "legend");
    const edges = [minValue, ...breaks, maxValue];
    let html = '<div class="legend-title">Roof potential (kWp)</div>';
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

function popupHtml(props) {
  return `
    <div class="stadtteil-popup">
      <h3>${props.name}</h3>
      <table>
        <tr><td class="label">Qualifying buildings</td><td class="value">${formatNumber(props.qualifying_buildings)}</td></tr>
        <tr><td class="label">Roof potential</td><td class="value">${formatNumber(props.total_kwp)} kWp</td></tr>
        <tr><td class="label">Annual yield</td><td class="value">${formatNumber(props.total_mwh)} MWh</td></tr>
        <tr><td class="label">Battery potential</td><td class="value">${formatNumber(props.battery_potential_kwh)} kWh</td></tr>
      </table>
    </div>`;
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
      geojsonLayer.resetStyle(e.target);
    }

    function onEachFeature(feature, layer) {
      // Hover tooltip on every Stadtteil, so no shape is ever unnamed.
      layer.bindTooltip(feature.properties.name, {
        sticky: true,
        className: "stadtteil-tooltip",
      });
      layer.bindPopup(popupHtml(feature.properties), { className: "stadtteil-popup" });
      layer.on({
        mouseover: highlightFeature,
        mouseout: resetFeature,
      });
    }

    const geojsonLayer = L.geoJSON(data, {
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
    withArea.slice(0, LABEL_COUNT).forEach((s) => {
      if (!s.centroid) return;
      L.marker([s.centroid[1], s.centroid[0]], {
        icon: L.divIcon({
          className: "stadtteil-label",
          html: s.name,
          iconSize: null,
        }),
        interactive: false,
      }).addTo(map);
    });

    buildLegend(breaks, minValue, maxValue);
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
      map.fitBounds(geojsonLayer.getBounds(), { padding: [10, 10] });
    });
  })
  .catch((err) => {
    document.getElementById("header-totals").textContent = "Could not load stadtteile.json.";
    console.error(err);
  });
