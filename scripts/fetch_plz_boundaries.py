"""
Download Duesseldorf's postcode (PLZ) boundaries.

Per SCOPE.md section 3 (v2.3): PLZ is not a map layer, Stadtteil is the
only geography drawn. These boundaries exist only so build_plz.py and
build_postcode_facts.py can spatial-join buildings to a postcode, the
geography MaStR's registry data can actually be tied to. Nothing in the
output geometry itself is ever rendered.

Source: yetzt/postleitzahlen (https://github.com/yetzt/postleitzahlen),
an OSM-derived, ODbL-licensed mirror of German postal code areas, updated
monthly. Ships as a single brotli-compressed GeoJSON covering all of
Germany (about 500 MB decompressed, over 8000 postcodes), so this script
downloads it, streams through it with ijson rather than loading it whole,
and keeps only the Duesseldorf postcodes.

Duesseldorf's postal codes are the contiguous range 40210-40629 (Deutsche
Post's own assignment). A prefix match on "40" is not enough: Ratingen
(40878-40885) and other neighbouring towns also start with 40, and
would leak into a same-city PLZ set that is not actually Duesseldorf.

Run: python3 scripts/fetch_plz_boundaries.py
Requires the `ijson` and `brotli` packages (see requirements.txt).
"""

import json
from pathlib import Path
from urllib.request import urlretrieve

import brotli
import ijson

BASE = Path(__file__).resolve().parent.parent
RAW_DIR = BASE / "data" / "raw"
BR_PATH = RAW_DIR / "plz_germany.geojson.br"
DECOMPRESSED_PATH = RAW_DIR / "plz_germany.geojson"
OUT_PATH = RAW_DIR / "plz_duesseldorf.geojson"

SOURCE_URL = "https://github.com/yetzt/postleitzahlen/releases/download/2026.02/postleitzahlen.geojson.br"

PLZ_MIN = 40210
PLZ_MAX = 40629


def main():
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    if OUT_PATH.exists():
        print(f"Already present: {OUT_PATH}")
        return

    if not DECOMPRESSED_PATH.exists():
        if not BR_PATH.exists():
            print(f"Downloading: {SOURCE_URL}")
            urlretrieve(SOURCE_URL, BR_PATH)
            print(f"Saved: {BR_PATH} ({BR_PATH.stat().st_size / 1e6:.1f} MB)")

        print("Decompressing (about 500 MB, all of Germany) ...")
        with open(BR_PATH, "rb") as f:
            decompressed = brotli.decompress(f.read())
        DECOMPRESSED_PATH.write_bytes(decompressed)
        print(f"Saved: {DECOMPRESSED_PATH} ({DECOMPRESSED_PATH.stat().st_size / 1e6:.0f} MB)")

    print(f"Streaming through it for postcodes {PLZ_MIN}-{PLZ_MAX} ...")
    features = []
    with open(DECOMPRESSED_PATH, "rb") as f:
        for feature in ijson.items(f, "features.item", use_float=True):
            pc = feature["properties"].get("postcode", "")
            if pc.isdigit() and PLZ_MIN <= int(pc) <= PLZ_MAX:
                features.append(feature)

    print(f"Matched {len(features)} Duesseldorf postcodes")
    out = {"type": "FeatureCollection", "features": features}
    OUT_PATH.write_text(json.dumps(out), encoding="utf-8")
    print(f"Saved: {OUT_PATH} ({OUT_PATH.stat().st_size / 1024:.0f} KB)")

    # The all-of-Germany intermediates are multi-hundred-MB and no longer
    # needed once the Duesseldorf subset is written.
    DECOMPRESSED_PATH.unlink(missing_ok=True)
    BR_PATH.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
