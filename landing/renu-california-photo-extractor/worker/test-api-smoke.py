"""Smoke-test deployed Invoice Generator + QBO API routes."""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

API = "https://renu-california-photo-extractor-api.zeiasyed.workers.dev"
SHOP_USER = "California"
SHOP_PASS = "renucalifornia"


def req(path, method="GET", body=None, token=None):
    url = API + path
    headers = {"Accept": "application/json"}
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    if token:
        headers["Authorization"] = "Bearer " + token
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(r, timeout=120) as resp:
        return json.loads(resp.read().decode())


def main():
    print("1. Health")
    health = req("/health")
    assert health.get("ok"), health
    print("   OK", health.get("service"))

    print("2. Login")
    login = req("/api/login", "POST", {"userName": SHOP_USER, "shopPassword": SHOP_PASS})
    token = login["token"]
    print("   OK session for", login.get("userName"))

    print("3. QBO status")
    status = req("/api/qbo/status", token=token)
    print("   connected:", status.get("connected"), "configured:", status.get("configured"))

    print("4. ARI invoice groups (baseline)")
    ari = req(
        "/api/invoice-generator/invoices",
        "POST",
        {
            "clientName": "Autonation Toyota Irvine",
            "dateFrom": "2026-01-01",
            "dateTo": "2026-06-30",
        },
        token=token,
    )
    groups = ari.get("invoiceGroups") or []
    ari_total = round(sum(float(g.get("total") or 0) for g in groups), 2)
    print(f"   {len(groups)} groups, ARI total ${ari_total:,.2f}")

    if status.get("connected"):
        print("5. QBO open invoices")
        qbo = req(
            "/api/invoice-generator/qbo-invoices",
            "POST",
            {
                "clientName": "Autonation Toyota Irvine",
                "dateFrom": "2026-01-01",
                "dateTo": "2026-06-30",
            },
            token=token,
        )
        qbo_groups = qbo.get("invoiceGroups") or []
        qbo_total = qbo.get("qboOpenTotal")
        print(f"   {len(qbo_groups)} open invoices, QBO open total ${qbo_total:,.2f}")
        for g in qbo_groups[:3]:
            car_sum = round(sum(float(c.get("amount") or 0) for c in g.get("cars") or []), 2)
            print(
                f"   - {g.get('invoiceNumber')}: balance ${g.get('total')} car sum ${car_sum}"
            )
            if abs(float(g.get("total") or 0) - car_sum) > 0.05:
                raise SystemExit(f"Mismatch on {g.get('invoiceNumber')}")
    else:
        print("5. QBO invoices skipped (not connected)")
        if not status.get("configured"):
            print("   Set QBO_CLIENT_ID / QBO_CLIENT_SECRET on the worker, then Connect QuickBooks in the app.")

    print("\nAPI smoke tests passed.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print("HTTP", e.code, body, file=sys.stderr)
        sys.exit(1)
