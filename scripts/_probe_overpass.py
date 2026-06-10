import requests
import json

south, west, north, east = 33.43, -118.01, 33.94, -117.42
query = f"""
[out:json][timeout:90];
(
  node["craft"]({south},{west},{north},{east});
  way["craft"]({south},{west},{north},{east});
  node["shop"="trade"]({south},{west},{north},{east});
);
out tags 500;
"""
r = requests.post(
    "https://overpass-api.de/api/interpreter",
    data={"data": query},
    timeout=120,
    headers={"User-Agent": "probe"},
)
els = r.json().get("elements", [])
print("elements", len(els))
for e in els:
    t = e.get("tags", {})
    if t.get("name"):
        print(t.get("craft", "?"), "|", t.get("name"), "|", t.get("website", ""))
