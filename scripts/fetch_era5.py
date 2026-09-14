"""
Fetch hourly ERA5 weather (global tilted irradiance + air temperature) for
all 50 Stadtteil centroids, full year 2025 and June 2026.

Per SCOPE.md section 5 and the v2.4 scenario-panel decisions: 2025 carries
the annual generation figures (a complete year), June 2026 carries the
heatwave comparison (the actual record event, available now because ERA5
runs about 5 days behind real time). The two periods are fetched
separately, not as one continuous range, because the months between them
(July 2025 to May 2026) are not needed by either figure and fetching them
would only add unused data to the cache.

Scale is deliberately one series per Stadtteil centroid (50 locations), not
per building (roughly 117,000 locations, a different and much larger
number, ruled out separately). 100 calls total (50 locations x 2 periods).
Temperature does not vary meaningfully within a neighbourhood the size of
a Stadtteil, so a centroid series is not a meaningful accuracy loss for
the derate this batch is built around.

GTI is fetched at a fixed tilt=35 degrees, azimuth=0 (south), matching the
same convention v1 validated. This is a proxy for "typical panel
orientation" to shape the hourly profile; it is not meant to re-derive the
Solarkataster's own per-roof orientation mix, which already accounts for
the real mix of pitched, flat, east and west-facing roofs in each
Stadtteil's annual kWh figure (see build_generation.py for how the two are
reconciled).

Fetch-retry-checkpoint pattern reused from v1 (pp2_layer1_thread_a_bess_sizing.py):
retries with exponential backoff, and every successful fetch is written to
the checkpoint file immediately, so a rerun after a network failure never
re-fetches what it already has.

Run: python3 scripts/fetch_era5.py
"""

import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

import geopandas as gpd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import BASE, STADTTEILE_GEOJSON, slugify  # noqa: E402

CHECKPOINT_PATH = BASE / "data" / "raw" / "era5_checkpoint.json"

TILT_DEG = 35
AZIMUTH_DEG = 0  # Open-Meteo convention: 0 = south
TIMEZONE = "Europe/Berlin"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
DELAY_S = 0.4

PERIODS = {
    "2025": ("2025-01-01", "2025-12-31"),
    "2026_06": ("2026-06-01", "2026-06-30"),
}


def _fetch_with_retry(url, max_tries=4, timeout=60):
    last_err = None
    for attempt in range(max_tries):
        try:
            with urllib.request.urlopen(url, timeout=timeout) as resp:
                return json.load(resp)
        except Exception as exc:
            last_err = exc
            wait = 2 ** attempt
            print(f" [retry {attempt + 1}/{max_tries} after {wait}s: {exc}]", end="", flush=True)
            time.sleep(wait)
    raise last_err


def load_centroids():
    gdf = gpd.read_file(STADTTEILE_GEOJSON, engine="pyogrio")
    gdf_proj = gdf.to_crs("EPSG:25832")
    centroids_wgs84 = gdf_proj.geometry.centroid.to_crs("EPSG:4326")
    gdf["lon"] = centroids_wgs84.x
    gdf["lat"] = centroids_wgs84.y
    return gdf[["Name", "lon", "lat"]].to_dict("records")


def fetch_hourly(lat, lon, start_date, end_date):
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": start_date,
        "end_date": end_date,
        "hourly": "global_tilted_irradiance,temperature_2m",
        "tilt": TILT_DEG,
        "azimuth": AZIMUTH_DEG,
        "timezone": TIMEZONE,
        "models": "era5",
    }
    url = f"{ARCHIVE_URL}?{urllib.parse.urlencode(params)}"
    data = _fetch_with_retry(url)
    return {
        "time": data["hourly"]["time"],
        "gti": [v if v is not None else 0.0 for v in data["hourly"]["global_tilted_irradiance"]],
        "temp": [v if v is not None else None for v in data["hourly"]["temperature_2m"]],
    }


def main():
    CHECKPOINT_PATH.parent.mkdir(parents=True, exist_ok=True)

    checkpoint = {}
    if CHECKPOINT_PATH.exists():
        checkpoint = json.loads(CHECKPOINT_PATH.read_text(encoding="utf-8"))
        print(f"Resuming from checkpoint: {len(checkpoint)} series already cached.\n")

    centroids = load_centroids()
    print(f"Stadtteil centroids: {len(centroids)}")

    total_jobs = len(centroids) * len(PERIODS)
    done = 0
    start_time = time.time()

    for period_key, (start_date, end_date) in PERIODS.items():
        for c in centroids:
            key = f"{slugify(c['Name'])}_{period_key}"
            done += 1
            if key in checkpoint:
                print(f"[{done:>3}/{total_jobs}] {key} (cached)")
                continue

            print(f"[{done:>3}/{total_jobs}] {key}  lat={c['lat']:.4f} lon={c['lon']:.4f}", end="  ", flush=True)
            series = fetch_hourly(c["lat"], c["lon"], start_date, end_date)
            print(f"{len(series['time'])} hours")

            checkpoint[key] = series
            CHECKPOINT_PATH.write_text(json.dumps(checkpoint), encoding="utf-8")
            time.sleep(DELAY_S)

    elapsed = time.time() - start_time
    print(f"\nDone. {total_jobs} series, {elapsed:.0f}s this run.")
    print(f"Checkpoint: {CHECKPOINT_PATH} ({CHECKPOINT_PATH.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
