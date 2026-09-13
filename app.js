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

function updateHeaderTotals(features) {
  const totalBuildings = features.reduce((sum, f) => sum + f.properties.qualifying_buildings, 0);
  const totalKwp = features.reduce((sum, f) => sum + f.properties.total_kwp, 0);
  const totalMwh = features.reduce((sum, f) => sum + f.properties.total_mwh, 0);

  document.getElementById("header-totals").innerHTML =
    `<strong>${formatNumber(totalBuildings)}</strong> qualifying buildings &middot; ` +
    `<strong>${formatNumber(totalKwp)} kWp</strong> roof potential &middot; ` +
    `<strong>${formatNumber(totalMwh)} MWh</strong>/year`;
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

    map.fitBounds(geojsonLayer.getBounds(), { padding: [10, 10] });

    buildLegend(breaks, minValue, maxValue);
    updateHeaderTotals(data.features);
    updateFooter(data.properties);
  })
  .catch((err) => {
    document.getElementById("header-totals").textContent = "Could not load stadtteile.json.";
    console.error(err);
  });
