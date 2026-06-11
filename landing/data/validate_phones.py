"""Validate plumber phone numbers with Google's libphonenumber."""
import csv
import json
import re
from pathlib import Path

import phonenumbers
from phonenumbers import PhoneNumberType, geocoder, carrier

DATA = Path(__file__).parent
IN_CSV = DATA / "tx-plumbers-200.csv"
OUT_CSV = DATA / "tx-plumbers-200-validated.csv"
OUT_JSON = DATA / "tx-plumbers-phone-validation.json"

# Common TX NPAs; numbers outside this set get flagged for review (not auto-invalid)
TX_AREA_CODES = {
    "210", "214", "254", "281", "325", "346", "361", "409", "430", "432",
    "469", "512", "682", "713", "726", "737", "806", "817", "830", "832",
    "903", "915", "936", "940", "945", "956", "972", "979",
}

TYPE_LABELS = {
    PhoneNumberType.FIXED_LINE: "landline",
    PhoneNumberType.MOBILE: "mobile",
    PhoneNumberType.FIXED_LINE_OR_MOBILE: "landline_or_mobile",
    PhoneNumberType.TOLL_FREE: "toll_free",
    PhoneNumberType.PREMIUM_RATE: "premium_rate",
    PhoneNumberType.VOIP: "voip",
    PhoneNumberType.PERSONAL_NUMBER: "personal",
    PhoneNumberType.UAN: "uan",
    PhoneNumberType.VOICEMAIL: "voicemail",
    PhoneNumberType.UNKNOWN: "unknown",
}


def line_type_label(num) -> str:
    t = phonenumbers.number_type(num)
    return TYPE_LABELS.get(t, "unknown")


def validate_row(row: dict) -> dict:
    raw = row.get("phone", "")
    flags = []
    result = {
        "phone_valid": False,
        "phone_e164": "",
        "phone_national": "",
        "phone_line_type": "",
        "phone_region": "",
        "phone_area_code": "",
        "phone_flags": "",
        "phone_validation_status": "invalid",
    }

    try:
        num = phonenumbers.parse(raw, "US")
    except phonenumbers.NumberParseException as exc:
        result["phone_flags"] = f"parse_error:{exc}"
        result["phone_validation_status"] = "invalid"
        return result

    area = str(num.national_number)[:3] if num.national_number else ""
    result["phone_area_code"] = area

    is_possible = phonenumbers.is_possible_number(num)
    is_valid = phonenumbers.is_valid_number(num)
    result["phone_valid"] = is_valid

    if is_valid:
        result["phone_e164"] = phonenumbers.format_number(num, phonenumbers.PhoneNumberFormat.E164)
        result["phone_national"] = phonenumbers.format_number(num, phonenumbers.PhoneNumberFormat.NATIONAL)
        result["phone_line_type"] = line_type_label(num)
        result["phone_region"] = geocoder.description_for_number(num, "en") or ""
        result["phone_validation_status"] = "valid"
    elif is_possible:
        result["phone_validation_status"] = "possible_not_valid"
        flags.append("possible_not_valid")
    else:
        result["phone_validation_status"] = "invalid"
        flags.append("invalid_format")

    if area and area not in TX_AREA_CODES:
        flags.append("non_tx_area_code")

    if result["phone_line_type"] == "toll_free":
        flags.append("toll_free")

    if result["phone_line_type"] == "voip":
        flags.append("voip")

    # Known bad entry in source data
    if area == "381":
        flags.append("invalid_area_code_381")

    if re.search(r"P\.?\s*O\.?\s*BOX|PO BOX", row.get("address_line1", ""), re.I):
        flags.append("po_box_address")

    result["phone_flags"] = ";".join(flags) if flags else ""
    if flags and result["phone_validation_status"] == "valid":
        result["phone_validation_status"] = "valid_with_flags"

    return result


def main():
    rows = list(csv.DictReader(IN_CSV.open(encoding="utf-8")))
    validated = []
    summary = {
        "total": len(rows),
        "valid": 0,
        "valid_with_flags": 0,
        "possible_not_valid": 0,
        "invalid": 0,
        "by_line_type": {},
        "flagged_records": [],
    }

    extra_fields = [
        "phone_valid", "phone_e164", "phone_national", "phone_line_type",
        "phone_region", "phone_area_code", "phone_flags", "phone_validation_status",
    ]

    for row in rows:
        v = validate_row(row)
        row.update(v)
        validated.append(row)

        status = v["phone_validation_status"]
        summary[status] = summary.get(status, 0) + 1

        lt = v["phone_line_type"] or "unparsed"
        summary["by_line_type"][lt] = summary["by_line_type"].get(lt, 0) + 1

        if v["phone_flags"]:
            summary["flagged_records"].append({
                "company_name": row["company_name"],
                "city": row["city"],
                "phone": row["phone"],
                "phone_validation_status": status,
                "phone_line_type": v["phone_line_type"],
                "phone_region": v["phone_region"],
                "phone_flags": v["phone_flags"],
            })

    fieldnames = list(rows[0].keys()) if rows else []
    for f in extra_fields:
        if f not in fieldnames:
            fieldnames.append(f)

    with OUT_CSV.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        w.writerows(validated)

    summary["files"] = {
        "validated_csv": str(OUT_CSV.name),
        "report_json": str(OUT_JSON.name),
    }
    OUT_JSON.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print(f"Validated {len(rows)} records")
    print(f"  valid:              {summary.get('valid', 0)}")
    print(f"  valid_with_flags:   {summary.get('valid_with_flags', 0)}")
    print(f"  possible_not_valid: {summary.get('possible_not_valid', 0)}")
    print(f"  invalid:            {summary.get('invalid', 0)}")
    print(f"  flagged:            {len(summary['flagged_records'])}")
    print(f"Wrote {OUT_CSV.name} and {OUT_JSON.name}")


if __name__ == "__main__":
    main()
