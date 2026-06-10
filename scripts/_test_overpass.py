import requests

south, west, north, east = 32.55, -118.95, 34.38, -116.85
q = f"""
[out:json][timeout:60];
node["craft"="plumber"]({south},{west},{north},{east});
out tags 50;
"""
r = requests.post(
    "https://overpass-api.de/api/interpreter",
    data={"data": q},
    timeout=90,
    headers={"User-Agent": "test"},
)
print("status", r.status_code)
data = r.json()
els = data.get("elements", [])
print("elements", len(els))
if data.get("remark"):
    print("remark", data["remark"])
for e in els[:5]:
    print(e.get("tags", {}).get("name"))
