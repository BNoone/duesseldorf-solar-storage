"""
Download the Duesseldorf Stadtteil (neighbourhood) boundaries.

Source: Open Data Duesseldorf, "Stadtteilgrenzen Duesseldorf 2025",
https://opendata.duesseldorf.de/dataset/stadtteilgrenzen-d%C3%BCsseldorf-2025
Already published in WGS84 (EPSG:4326), so no reprojection is needed for
this file. 50 features, one per Stadtteil, with "Name" and "Nummer".

Skips the download if the file is already present.
"""

from pathlib import Path
from urllib.request import urlretrieve

BASE = Path(__file__).resolve().parent.parent
RAW_DIR = BASE / "data" / "raw"
OUT_PATH = RAW_DIR / "stadtteile_wgs84.geojson"

SOURCE_URL = (
    "https://opendata.duesseldorf.de/sites/default/files/"
    "Stadtteile_2025_WGS84_EPSG4326_1.geojson"
)


def main():
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    if OUT_PATH.exists():
        print(f"Already present: {OUT_PATH}")
        return

    print(f"Downloading: {SOURCE_URL}")
    urlretrieve(SOURCE_URL, OUT_PATH)
    print(f"Saved: {OUT_PATH} ({OUT_PATH.stat().st_size / 1e3:.0f} KB)")


if __name__ == "__main__":
    main()
