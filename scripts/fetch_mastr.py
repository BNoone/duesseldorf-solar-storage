"""
Bulk-download the Marktstammdatenregister (MaStR) storage and solar tables.

Known trap (SCOPE.md section 13): stay filtered to
data=["storage","solar","storage_units"]. An unfiltered pull is multi-GB
across every technology and takes 30+ minutes; this is still several GB
and 15-30 minutes on a first run, but at least it is only the tables this
project needs.

"storage_units" is not optional. storage_extended's own
NutzbareSpeicherkapazitaet (kWh) is null for every row, at every scale,
nationwide; it always is. The real kWh value lives on the Anlage-level
record in storage_units, joined via VerknuepfteEinheit ->
EinheitMastrNummer. Missing this table means Bruttoleistung (kW) is the
only capacity figure available, which is not the same thing.

Writes a local SQLite database via open-mastr. Skips the download if the
database already has data (open-mastr's own behaviour, not custom logic
here).

Run: python3 scripts/fetch_mastr.py
Requires the `open-mastr` package (see requirements.txt).
"""

import os
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
DATA_DIR = BASE / "data" / "raw" / "open-mastr"
DATA_DIR.mkdir(parents=True, exist_ok=True)

# Must be set before Mastr() is constructed; open-mastr reads this env var
# to decide where to place its SQLite database and raw XML.
os.environ["OUTPUT_PATH"] = str(DATA_DIR)


def main():
    from open_mastr import Mastr

    db = Mastr()
    print(f"SQLite DB will be written to: {db.engine.url}")
    db.download(method="bulk", data=["storage", "solar", "storage_units"])
    print("Bulk download and write-to-database complete.")


if __name__ == "__main__":
    main()
