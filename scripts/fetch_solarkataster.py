"""
Download the Solarkataster NRW roof-potential shapefile for Duesseldorf.

Source: opengeodata.nrw.de, Solarkataster NRW - Potenziale Photovoltaik
Dachflaechen, Gemeindeschluessel 05111000 (Duesseldorf), EPSG:25832,
Datenlizenz Deutschland - Zero - Version 2.0.

Skips the download if the shapefile is already present, so re-running this
script is cheap. The zip is about 98 MB.
"""

import zipfile
from pathlib import Path
from urllib.request import urlretrieve

BASE = Path(__file__).resolve().parent.parent
RAW_DIR = BASE / "data" / "raw" / "solarkataster"
ZIP_PATH = RAW_DIR / "Solarkataster-Potentiale-Photovoltaik_05111000_Duesseldorf_EPSG25832_Shape.zip"
SHP_PATH = RAW_DIR / "Solarkataster-Potentiale-Photovoltaik_05111000_Duesseldorf.shp"

SOURCE_URL = (
    "https://www.opengeodata.nrw.de/produkte/umwelt_klima/energie/"
    "solarkataster/photovoltaik/"
    "Solarkataster-Potentiale-Photovoltaik_05111000_Duesseldorf_EPSG25832_Shape.zip"
)


def main():
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    if SHP_PATH.exists():
        print(f"Already present: {SHP_PATH}")
        return

    if not ZIP_PATH.exists():
        print(f"Downloading: {SOURCE_URL}")
        urlretrieve(SOURCE_URL, ZIP_PATH)
        print(f"Saved: {ZIP_PATH} ({ZIP_PATH.stat().st_size / 1e6:.1f} MB)")

    print(f"Extracting to: {RAW_DIR}")
    with zipfile.ZipFile(ZIP_PATH) as zf:
        zf.extractall(RAW_DIR)

    if not SHP_PATH.exists():
        raise SystemExit(f"Expected shapefile not found after extraction: {SHP_PATH}")

    print(f"Ready: {SHP_PATH}")


if __name__ == "__main__":
    main()
