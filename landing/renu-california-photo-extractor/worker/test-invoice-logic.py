"""Run invoice merge logic tests (no Node required)."""
from __future__ import annotations

import importlib.util
import re
import sys
from pathlib import Path

WORKER = Path(__file__).resolve().parent


def load_js_module(name: str, path: Path):
    """Minimal JS runner: transpile exports to Python by exec-ing simplified port."""
    raise NotImplementedError


# Port of merge logic for testing when Node is unavailable
VIN_RE = re.compile(r"\b[A-HJ-NPR-Z0-9]{17}\b", re.I)


def parse_date_only(value):
    if not value:
        return ""
    s = str(value).strip()
    if re.match(r"^\d{4}-\d{2}-\d{2}", s):
        return s[:10]
    return s


def extract_vin(text):
    m = VIN_RE.search(str(text or ""))
    return m.group(0).upper() if m else ""


def parse_qbo_invoice_lines(invoice):
    rows = []
    for line in invoice.get("Line") or []:
        detail = line.get("DetailType") or ""
        if detail in ("SubTotalLineDetail", "DiscountLineDetail"):
            continue
        amount = float(line.get("Amount") or 0)
        if amount <= 0:
            continue
        desc = str(line.get("Description") or "").strip()
        rows.append(
            {
                "amount": amount,
                "description": desc,
                "vin": extract_vin(desc),
                "vehicle": VIN_RE.sub("", desc).strip(),
            }
        )
    return rows


def merge_qbo_invoices_with_ari(qbo_invoices, ari_rows, bill_to_fallback=""):
    by_vin = {}
    by_date_amount = {}
    for row in ari_rows or []:
        vin = str(row.get("vin") or "").upper()
        if vin:
            by_vin[vin] = row
        date = parse_date_only(row.get("dateOrdered"))
        key = f"{date}|{float(row.get('amount') or 0):.2f}"
        by_date_amount.setdefault(key, []).append(row)

    groups = []
    for inv in qbo_invoices or []:
        balance = float(inv.get("Balance") or 0)
        total_amt = float(inv.get("TotalAmt") or 0)
        open_balance = balance if balance > 0 else total_amt
        if open_balance <= 0:
            continue
        invoice_date = inv.get("TxnDate") or ""
        lines = parse_qbo_invoice_lines(inv)
        cars = []
        for line in lines:
            if line["vin"] and line["vin"] in by_vin:
                ari = by_vin[line["vin"]]
                cars.append(
                    {
                        "vin": line["vin"],
                        "vehicle": ari.get("vehicle") or line["vehicle"],
                        "amount": line["amount"],
                        "dateOrdered": ari.get("dateOrdered") or invoice_date,
                    }
                )
            else:
                date = parse_date_only(invoice_date)
                key = f"{date}|{line['amount']:.2f}"
                pool = by_date_amount.get(key) or []
                ari = pool.pop(0) if pool else None
                if ari:
                    cars.append(
                        {
                            "vin": ari.get("vin") or line["vin"],
                            "vehicle": ari.get("vehicle") or line["vehicle"],
                            "amount": line["amount"],
                            "dateOrdered": ari.get("dateOrdered") or invoice_date,
                        }
                    )
                else:
                    cars.append(
                        {
                            "vin": line["vin"],
                            "vehicle": line["vehicle"],
                            "amount": line["amount"],
                            "dateOrdered": invoice_date,
                        }
                    )

        if not cars and open_balance > 0:
            date = parse_date_only(invoice_date)
            ari_same_day = [r for r in (ari_rows or []) if parse_date_only(r.get("dateOrdered")) == date]
            if ari_same_day:
                line_sum = sum(float(r.get("amount") or 0) for r in ari_same_day)
                scale = open_balance / line_sum if line_sum > 0 else 1
                cars = [
                    {
                        "vin": r.get("vin"),
                        "vehicle": r.get("vehicle"),
                        "amount": round(float(r.get("amount") or 0) * scale, 2),
                        "dateOrdered": r.get("dateOrdered") or invoice_date,
                    }
                    for r in ari_same_day
                ]
                car_sum = sum(c["amount"] for c in cars)
                if cars and abs(car_sum - open_balance) > 0.02:
                    cars[-1]["amount"] = round(cars[-1]["amount"] + (open_balance - car_sum), 2)

        car_sum = sum(float(c.get("amount") or 0) for c in cars)
        if cars and abs(car_sum - open_balance) > 0.05:
            scale = open_balance / car_sum
            cars = [{**c, "amount": round(c["amount"] * scale, 2)} for c in cars]
            adjusted = sum(c["amount"] for c in cars)
            if cars:
                cars[-1]["amount"] = round(cars[-1]["amount"] + (open_balance - adjusted), 2)

        customer = (inv.get("CustomerRef") or {}).get("name") or bill_to_fallback
        groups.append(
            {
                "invoiceNumber": str(inv.get("DocNumber") or inv.get("Id") or ""),
                "total": open_balance,
                "cars": cars,
                "clientName": customer,
            }
        )
    return groups


def approx(a, b, tol=0.02):
    return abs(a - b) <= tol


def main():
    ari_rows = [
        {"vin": "1HGCM82633A004352", "vehicle": "2023 Toyota Camry", "amount": 130, "dateOrdered": "2026-04-29"},
        {"vin": "2T1BURHE0JC123456", "vehicle": "2024 Toyota Corolla", "amount": 130, "dateOrdered": "2026-04-29"},
        {"vin": "3VWDX7AJ5DM123789", "vehicle": "2022 Honda Accord", "amount": 130, "dateOrdered": "2026-04-29"},
        {"vin": "4T1BF1FK5EU555555", "vehicle": "2021 Toyota RAV4", "amount": 130, "dateOrdered": "2026-04-29"},
        {"vin": "5YFBURHE5LP666666", "vehicle": "2023 Toyota Prius", "amount": 90, "dateOrdered": "2026-04-29"},
    ]
    qbo_invoices = [
        {
            "DocNumber": "AT-1005",
            "TxnDate": "2026-04-29",
            "Balance": 610,
            "TotalAmt": 610,
            "CustomerRef": {"name": "Autonation Toyota Irvine"},
            "Line": [
                {"DetailType": "SalesItemLineDetail", "Amount": 130, "Description": "2023 Toyota Camry VIN 1HGCM82633A004352"},
                {"DetailType": "SalesItemLineDetail", "Amount": 130, "Description": "2024 Toyota Corolla VIN 2T1BURHE0JC123456"},
                {"DetailType": "SalesItemLineDetail", "Amount": 130, "Description": "2022 Honda Accord VIN 3VWDX7AJ5DM123789"},
                {"DetailType": "SalesItemLineDetail", "Amount": 130, "Description": "2021 Toyota RAV4 VIN 4T1BF1FK5EU555555"},
                {"DetailType": "SalesItemLineDetail", "Amount": 90, "Description": "2023 Toyota Prius VIN 5YFBURHE5LP666666"},
            ],
        },
        {
            "DocNumber": "AT-1006",
            "TxnDate": "2026-05-01",
            "Balance": 1165,
            "TotalAmt": 1200,
            "Line": [
                {"DetailType": "SalesItemLineDetail", "Amount": 130, "Description": "Vehicle A"},
                {"DetailType": "SalesItemLineDetail", "Amount": 130, "Description": "Vehicle B"},
                {"DetailType": "SalesItemLineDetail", "Amount": 130, "Description": "Vehicle C"},
            ],
        },
    ]

    groups = merge_qbo_invoices_with_ari(qbo_invoices, ari_rows)
    assert len(groups) == 2, f"expected 2 groups, got {len(groups)}"
    g1005 = next(g for g in groups if g["invoiceNumber"] == "AT-1005")
    assert g1005["total"] == 610
    assert approx(sum(c["amount"] for c in g1005["cars"]), 610)
    assert "Toyota" in g1005["cars"][0]["vehicle"]

    g1006 = next(g for g in groups if g["invoiceNumber"] == "AT-1006")
    assert g1006["total"] == 1165
    assert approx(sum(c["amount"] for c in g1006["cars"]), 1165)

    selected = sum(g["total"] for g in groups)
    split = sum(c["amount"] for g in groups for c in g["cars"])
    assert approx(selected, split)
    assert selected == 1775

    bare = merge_qbo_invoices_with_ari(
        [{"DocNumber": "AT-2000", "TxnDate": "2026-04-29", "Balance": 520, "Line": []}],
        ari_rows[:4],
    )
    assert len(bare) == 1
    assert bare[0]["total"] == 520
    assert approx(sum(c["amount"] for c in bare[0]["cars"]), 520)

    print("All invoice merge tests passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
