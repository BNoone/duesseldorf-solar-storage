# Duesseldorf Solar + Storage Potential

One web page, one map of Duesseldorf, answering one question: how much rooftop solar could this city have, and how much battery storage would that call for.

Full plan, decisions, and reasoning: [SCOPE.md](SCOPE.md). Read that first.

## Live site

https://bnoone.github.io/duesseldorf-solar-storage/

Currently an empty Leaflet map centred on Duesseldorf. Layers, data, and the scenario panel are not wired up yet.

## What is built so far

- `index.html` / `app.js`: the map itself. Plain HTML, vanilla JavaScript, Leaflet from a CDN, OpenStreetMap tiles. No build step, no framework.
