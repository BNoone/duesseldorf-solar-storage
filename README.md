# Düsseldorf Solar + Storage Potential

### ▶ [Open the live map](https://bnoone.github.io/duesseldorf-solar-storage/)

One web page, one map, one question: if every suitable roof in Düsseldorf
carried solar, how much would it generate, and what does heat do to that?

Built from three public datasets. Every number on the page traces to a script
in this repo and a named public source.

## What it found

- **1.39 GW** of rooftop solar is physically possible in Düsseldorf.
  **0.16 GW** is built. That is **11.6%**.
- At full build-out, rooftops would generate **1.12 TWh** a year, covering
  **36.6%** of the city's electricity, and roughly equal to what all
  Düsseldorf households use.
- Panels lose about **6%** of their rated output to heat on any clear summer
  day. During the 24 to 28 June 2026 heatwave, closer to **11%**.
- The city has around **7,000 registered batteries**. Almost all are home
  units in basements. Exactly **one** is above 1 MW, and it is not built yet.

## Data

| Source | Provides |
|---|---|
| [Solarkataster NRW](https://www.opengeodata.nrw.de/produkte/umwelt_klima/energie/solarkataster/photovoltaik/) | Roof geometry, tilt, orientation, theoretical kWp and yield |
| [Marktstammdatenregister](https://www.marktstammdatenregister.de/) | Every registered PV and battery unit in Germany |
| [ERA5 via Open-Meteo](https://open-meteo.com/en/docs/historical-weather-api) | Hourly irradiance and air temperature |

Plus [Stadtteil boundaries](https://opendata.duesseldorf.de/dataset/stadtteile-d%C3%BCsseldorf)
from Open Data Düsseldorf, and city electricity consumption from Düsseldorf's
own [Energie- und Treibhausgasbilanz 2022](https://www.duesseldorf.de/fileadmin/Amt19/umweltamt/klimaschutz/pdf/klimaschutz/19_Klimafreundliches_Duesseldorf_2022_web_bf.pdf).

## How it works

Python precomputes every scenario into static JSON. The browser only displays
a precomputed value. Plain HTML, vanilla JavaScript, Leaflet for the map.
No framework, no build step, no backend.

## Rebuilding

```bash
pip install -r requirements.txt
bash scripts/rebuild_all.sh
```

Full script-by-script detail in [METHOD.md](METHOD.md).

## Documentation

- **[METHOD.md](METHOD.md)** — the roof rule, the derate model, the geography
  decision, and how each data file is produced.
- **[SCOPE.md](SCOPE.md)** — what this project does and deliberately does not
  do, and why. The authority both other documents are checked against.
