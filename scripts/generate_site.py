"""Generate static preview websites from business CSV rows."""

from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from industry_config import INDUSTRY_CONFIG, INDUSTRY_LABELS

ROOT = Path(__file__).resolve().parents[1]
TEMPLATES_DIR = ROOT / "templates" / "shared"
PREVIEWS_DIR = ROOT / "previews"
CONFIG_PATH = ROOT / "config" / "branding.json"


def load_branding() -> dict:
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def normalize_phone(phone: str) -> tuple[str, str]:
    if not phone:
        return "", ""
    raw = re.sub(r"[^\d+]", "", phone)
    display = phone.strip()
    return raw, display


def read_businesses(csv_path: Path) -> list[dict]:
    with csv_path.open(newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def format_template(value: str, *, name: str, city: str, region: str = "Southern California") -> str:
    return value.format(name=name, city=city, region=region)


def resolve_service_region(row: dict) -> str:
    region = (row.get("region") or "").strip().lower()
    if region in ("texas", "tx"):
        return "Texas"
    address = row.get("address") or ""
    match = re.search(r",\s*([A-Z]{2})\s+\d", address)
    if match:
        state = match.group(1)
        if state == "TX":
            return "Texas"
        if state == "CA":
            return "Southern California"
    return "Southern California"


def normalize_services(config: dict) -> list[dict]:
    raw = config.get("services") or []
    normalized: list[dict] = []
    for item in raw:
        if isinstance(item, dict):
            normalized.append(item)
        else:
            normalized.append({"title": item, "description": "", "image": config.get("section_image", "")})
    return normalized


def normalize_features(config: dict, *, name: str, city: str, region: str) -> list[dict]:
    defaults = [
        {
            "title": "Local & responsive",
            "description": f"We know {city} neighborhoods and respond quickly when you need help.",
        },
        {
            "title": "Clear communication",
            "description": "No jargon — just straightforward answers and honest recommendations.",
        },
        {
            "title": "Quality first",
            "description": "We take pride in doing the job right and standing behind our work.",
        },
    ]
    features = config.get("features") or defaults
    return [
        {
            "title": feature["title"],
            "description": format_template(feature["description"], name=name, city=city, region=region),
        }
        for feature in features
    ]


def resolve_category(row: dict) -> str:
    trade = (row.get("trade") or "").strip()
    if trade in INDUSTRY_CONFIG:
        return trade
    industry = (row.get("industry") or "home_services").strip()
    return industry if industry in INDUSTRY_CONFIG else "home_services"


def build_context(row: dict, branding: dict) -> dict:
    category = resolve_category(row)
    config = INDUSTRY_CONFIG.get(category, INDUSTRY_CONFIG["home_services"])
    name = row["name"]
    city = row.get("city") or "Orange County"
    service_region = resolve_service_region(row)
    phone_raw, phone_display = normalize_phone(row.get("phone") or "")

    services = normalize_services(config)
    features = normalize_features(config, name=name, city=city, region=service_region)
    blog_posts = config.get("blog_posts") or []
    is_trade = category in ("plumber", "hvac", "roofer")

    return {
        "business": {
            "name": name,
            "address": row.get("address") or f"{city}, CA",
            "city": city,
            "phone": phone_display,
            "phone_raw": phone_raw,
            "slug": row["slug"],
        },
        "category": category,
        "is_trade": is_trade,
        "industry_label": INDUSTRY_LABELS.get(category, "Local Business"),
        "tagline": format_template(config["tagline_template"], name=name, city=city, region=service_region),
        "about_text": format_template(config["about_template"], name=name, city=city, region=service_region),
        "service_region": service_region,
        "services": services,
        "features": features,
        "blog_posts": blog_posts,
        "hero_image": config["hero_image"],
        "section_image": config["section_image"],
        "hero_badge": config.get("hero_badge"),
        "trust_badges": config.get("trust_badges") or [],
        "cta_headline": format_template(
            config.get("cta_headline") or "Ready to get started in {city}?",
            name=name,
            city=city,
            region=service_region,
        ),
        "cta_text": config.get("cta_text") or "Contact us today for a free estimate.",
        "theme": config["theme"],
        "brand_name": branding["brand_name"],
        "brand_logo_url": "../../landing/" + branding.get("logo_url", "assets/solena-digital-logo.png"),
    }


def render_site(row: dict, branding: dict) -> Path:
    env = Environment(
        loader=FileSystemLoader(str(TEMPLATES_DIR)),
        autoescape=select_autoescape(["html", "xml"]),
    )

    context = build_context(row, branding)
    out_dir = PREVIEWS_DIR / row["slug"]
    out_dir.mkdir(parents=True, exist_ok=True)

    templates = [
        "index.html.j2",
        "services.html.j2",
        "about.html.j2",
        "contact.html.j2",
    ]
    if context["is_trade"]:
        templates.append("blog.html.j2")

    for template_name in templates:
        template = env.get_template(template_name)
        html = template.render(**context)
        target = out_dir / template_name.replace(".j2", "")
        target.write_text(html, encoding="utf-8")

    css_template = env.get_template("styles.css.j2")
    (out_dir / "styles.css").write_text(css_template.render(**context), encoding="utf-8")

    return out_dir


def write_businesses_json(rows: list[dict], branding: dict) -> None:
    landing_dir = ROOT / "landing"
    landing_dir.mkdir(parents=True, exist_ok=True)

    businesses_path = landing_dir / "businesses.json"
    by_slug: dict[str, dict] = {}
    if businesses_path.exists():
        for item in json.loads(businesses_path.read_text(encoding="utf-8")):
            by_slug[item["slug"]] = item

    for row in rows:
        entry = {
            "slug": row["slug"],
            "name": row["name"],
            "industry": row.get("industry"),
            "preview_path": f"previews/{row['slug']}/index.html",
        }
        if row.get("trade"):
            entry["trade"] = row["trade"]
        by_slug[row["slug"]] = entry

    payload = list(by_slug.values())
    businesses_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    (landing_dir / "assets" / "businesses.js").write_text(
        f"window.BUSINESSES = {json.dumps(payload, indent=2)};\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate preview websites")
    parser.add_argument("--csv", default=str(ROOT / "data" / "pilot-10.csv"))
    parser.add_argument("--slug", help="Generate only one business slug")
    parser.add_argument("--limit", type=int, help="Max sites to generate")
    parser.add_argument(
        "--include-unverified",
        action="store_true",
        help="Include businesses not marked verification_status=approved",
    )
    args = parser.parse_args()

    branding = load_branding()
    rows = read_businesses(Path(args.csv))

    if args.slug:
        rows = [r for r in rows if r["slug"] == args.slug]
        if not rows:
            raise SystemExit(f"Slug not found: {args.slug}")
    elif not args.include_unverified:
        skipped = [r for r in rows if r.get("verification_status") not in ("approved", "", "unverified", None)]
        if skipped:
            for row in skipped:
                print(f"Skipping {row['slug']} ({row.get('verification_status')})")
        rows = [r for r in rows if r.get("verification_status") in ("approved", "", "unverified", None)]

    if args.limit:
        rows = rows[: args.limit]

    generated = []
    for row in rows:
        out = render_site(row, branding)
        generated.append(out)
        trade = row.get("trade") or row.get("industry")
        print(f"Generated {out.relative_to(ROOT)} ({trade})")

    write_businesses_json(
        [r for r in read_businesses(Path(args.csv)) if r.get("verification_status") in ("approved", "", "unverified", None) or args.include_unverified or args.slug],
        branding,
    )
    print(f"Done — {len(generated)} site(s) generated")


if __name__ == "__main__":
    main()
