const DUESSELDORF_CENTER = [51.2277, 6.7735];
const DEFAULT_ZOOM = 12;

const map = L.map("map").setView(DUESSELDORF_CENTER, DEFAULT_ZOOM);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
  maxZoom: 19,
}).addTo(map);
