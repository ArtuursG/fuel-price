"""Refresh the separate ODbL fuel-station location dataset; never imports prices.

Run from the repository root with: uv run --project collector python
collector/scripts/update_fuel_map.py. The previous file survives any fetch error.
"""

import json
import math
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

QUERY = (
    '[out:json][timeout:60];area["ISO3166-1"="LV"]["admin_level"="2"]->.lv;'
    'nwr["amenity"="fuel"](area.lv);out center tags;'
)
URL = "https://overpass-api.de/api/interpreter"
PRODUCT_TAGS = {
    "octane_95": "P95",
    "octane_98": "P98",
    "diesel": "DSL",
    "lpg": "LPG",
    "cng": "CNG",
    "e85": "E85",
}


def normalize(data):
    stations = []
    for item in data.get("elements", []):
        tags = item.get("tags", {})
        if tags.get("amenity") != "fuel" or tags.get("access") in {"private", "no"}:
            continue
        if tags.get("disused") == "yes" or tags.get("abandoned") == "yes":
            continue
        center = item.get("center", item)
        lat, lon = center.get("lat"), center.get("lon")
        if not all(isinstance(v, (int, float)) and math.isfinite(v) for v in (lat, lon)):
            continue
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            continue
        osm_id = f"{item['type']}/{item['id']}"
        network = tags.get("brand") or tags.get("operator") or "Cits tīkls"
        address = " ".join(filter(None, [tags.get("addr:street"), tags.get("addr:housenumber")]))
        stations.append(
            {
                "id": f"osm:{osm_id}",
                "kind": "fuel",
                "network": network,
                "name": tags.get("name") or network or "Degvielas uzpildes stacija",
                "address": ", ".join(
                    filter(None, [address, tags.get("addr:city") or tags.get("addr:place") or ""])
                ),
                "lat": lat,
                "lon": lon,
                "products": [
                    code for tag, code in PRODUCT_TAGS.items() if tags.get(f"fuel:{tag}") == "yes"
                ],
                "sourceUrl": f"https://www.openstreetmap.org/{osm_id}",
            }
        )
    return stations


def main():
    request = Request(
        URL,
        data=urlencode({"data": QUERY}).encode(),
        headers={
            "User-Agent": "fuel-price/0.1 (+https://github.com/ArtuursG/fuel-price)",
        },
    )
    with urlopen(request, timeout=85) as response:
        data = json.load(response)
    if data.get("remark"):
        raise RuntimeError(f"Overpass returned an incomplete result: {data['remark']}")
    stations = normalize(data)
    if not stations:
        raise RuntimeError("No fuel stations returned; preserving the previous dataset")
    payload = {
        "attribution": "© OpenStreetMap contributors",
        "license": "https://opendatacommons.org/licenses/odbl/1-0/",
        "source": URL,
        "fetchedAt": datetime.now(UTC).isoformat(),
        "dataAsOf": data.get("osm3s", {}).get("timestamp_osm_base"),
        "stations": sorted(stations, key=lambda station: station["id"]),
    }
    target = Path(__file__).resolve().parents[2] / "apps/web/public/data/fuel-stations.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(".json.tmp")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    temporary.replace(target)
    print(f"Saved {len(stations)} fuel station locations to {target}")


if __name__ == "__main__":
    main()
