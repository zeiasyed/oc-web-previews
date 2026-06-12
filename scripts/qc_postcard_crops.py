#!/usr/bin/env python3
"""Automated QC for postcard website mockup edge clipping (left and right)."""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CSV = ROOT / "data" / "tx-plumbers-200.csv"
DEFAULT_CONFIG = ROOT / "postcards" / "templates" / "plumber-postcard.json"
PNG_DIR = ROOT / "postcards" / "png"
REPORT_PATH = ROOT / "data" / "postcard-qc-report.json"

HEADER_BAND_END = 0.12
HERO_BAND_END = 0.50
LEFT_GUTTER_PX = 12
RIGHT_GUTTER_PX = 12
LOGO_ZONE_START = 20
LOGO_ZONE_END = 80
NAV_ZONE_START_FRAC = 0.55
MAX_HEADER_TEXT_START = 220
MIN_HEADER_TEXT_START = 0
MIN_RIGHT_MARGIN_PX = 18
MAX_RIGHT_CONTENT_X_FRAC = 0.992
FAIL_EDGE_DENSITY = 0.05


def load_paste_rect(config_path: Path) -> tuple[int, int, int, int]:
    with config_path.open(encoding="utf-8") as fh:
        config = json.load(fh)
    rect = config.get("paste_rect_px") or config.get("website_rect_px")
    if not rect:
        raise SystemExit(f"No paste rect in {config_path}")
    return tuple(rect)


def _luminance(pixel: tuple[int, int, int]) -> float:
    r, g, b = pixel
    return 0.299 * r + 0.587 * g + 0.114 * b


def _dark_density(rgb: Image.Image, x0: int, x1: int, y0: int, y1: int, *, thresh: float = 185) -> float:
    w, h = rgb.size
    x0 = max(0, min(x0, w))
    x1 = max(x0 + 1, min(x1, w))
    y0 = max(0, min(y0, h))
    y1 = max(y0 + 1, min(y1, h))
    dark = 0
    total = (x1 - x0) * (y1 - y0)
    px = rgb.load()
    for y in range(y0, y1):
        for x in range(x0, x1):
            if _luminance(px[x, y]) < thresh:
                dark += 1
    return dark / total


def _bright_density(rgb: Image.Image, x0: int, x1: int, y0: int, y1: int, *, thresh: float = 238) -> float:
    w, h = rgb.size
    x0 = max(0, min(x0, w))
    x1 = max(x0 + 1, min(x1, w))
    y0 = max(0, min(y0, h))
    y1 = max(y0 + 1, min(y1, h))
    bright = 0
    total = (x1 - x0) * (y1 - y0)
    px = rgb.load()
    for y in range(y0, y1):
        for x in range(x0, x1):
            if _luminance(px[x, y]) > thresh:
                bright += 1
    return bright / total


def _extreme_x(
    rgb: Image.Image,
    y0: int,
    y1: int,
    *,
    mode: str,
    thresh: float,
) -> tuple[int | None, int | None]:
    w, h = rgb.size
    y0 = max(0, min(y0, h))
    y1 = max(y0 + 1, min(y1, h))
    px = rgb.load()
    min_x: int | None = None
    max_x: int | None = None
    for y in range(y0, y1):
        for x in range(w):
            lum = _luminance(px[x, y])
            hit = lum < thresh if mode == "dark" else lum > thresh
            if not hit:
                continue
            min_x = x if min_x is None else min(min_x, x)
            max_x = x if max_x is None else max(max_x, x)
    return min_x, max_x


def score_edge_clipping(crop: Image.Image) -> dict:
    rgb = crop.convert("RGB")
    w, h = rgb.size
    header_y1 = max(1, int(h * HEADER_BAND_END))
    hero_y1 = max(header_y1 + 1, int(h * HERO_BAND_END))

    header_dark_min, header_dark_max = _extreme_x(rgb, 0, header_y1, mode="dark", thresh=185)
    hero_bright_min, hero_bright_max = _extreme_x(rgb, header_y1, hero_y1, mode="bright", thresh=238)
    hero_dark_min, hero_dark_max = _extreme_x(rgb, header_y1, hero_y1, mode="dark", thresh=120)

    metrics: dict[str, int | float | None] = {
        "header_dark_min_x": header_dark_min,
        "header_dark_max_x": header_dark_max,
        "hero_bright_min_x": hero_bright_min,
        "hero_bright_max_x": hero_bright_max,
        "hero_dark_max_x": hero_dark_max,
    }

    header_left = _dark_density(rgb, 0, min(LEFT_GUTTER_PX, w), 0, header_y1)
    header_right = _dark_density(rgb, max(0, w - RIGHT_GUTTER_PX), w, 0, header_y1)
    nav_zone = _dark_density(rgb, int(w * NAV_ZONE_START_FRAC), max(0, w - 40), 0, header_y1)
    hero_right_bright = _bright_density(rgb, max(0, w - RIGHT_GUTTER_PX), w, header_y1, hero_y1)
    metrics["header_left_gutter"] = round(header_left, 4)
    metrics["header_right_gutter"] = round(header_right, 4)
    metrics["header_nav_zone"] = round(nav_zone, 4)
    metrics["hero_right_bright"] = round(hero_right_bright, 4)

    failed = False
    reasons: list[str] = []

    if header_dark_min is not None and header_dark_min > MAX_HEADER_TEXT_START:
        failed = True
        reasons.append(f"header content starts too far right (x={header_dark_min})")

    if header_dark_min is not None and header_dark_min <= MIN_HEADER_TEXT_START:
        if header_left >= FAIL_EDGE_DENSITY:
            failed = True
            reasons.append(f"header clipped at left (gutter density {header_left:.1%})")

    if header_dark_max is not None and header_dark_max >= w - MIN_RIGHT_MARGIN_PX:
        failed = True
        reasons.append(f"header clipped at right (content to x={header_dark_max}, width={w})")

    if nav_zone >= 0.02 and header_dark_max is not None and header_dark_max >= int(w * MAX_RIGHT_CONTENT_X_FRAC):
        failed = True
        reasons.append("header nav/buttons cut off at right edge")

    if header_right >= FAIL_EDGE_DENSITY and nav_zone >= 0.02:
        failed = True
        reasons.append(f"header right gutter shows clipped nav ({header_right:.1%})")

    if hero_bright_min is not None and hero_bright_min > MAX_HEADER_TEXT_START * 1.8:
        failed = True
        reasons.append(f"hero headline starts too far right (x={hero_bright_min})")

    score = max(
        header_left,
        header_right,
        hero_right_bright,
        (header_dark_max or 0) / max(1, w),
    )

    return {
        "failed": failed,
        "reasons": reasons,
        "metrics": metrics,
        "score": round(score, 4),
    }


def check_postcard(
    slug: str,
    paste_rect: tuple[int, int, int, int],
    png_dir: Path,
) -> dict:
    png_path = png_dir / f"{slug}-landscape.png"
    if not png_path.exists():
        return {"slug": slug, "failed": True, "reasons": ["missing PNG"], "metrics": {}}

    with Image.open(png_path) as img:
        x0, y0, x1, y1 = paste_rect
        crop = img.crop((x0, y0, x1, y1))
        result = score_edge_clipping(crop)

    return {"slug": slug, **result}


def main() -> None:
    parser = argparse.ArgumentParser(description="QC postcard mockups for left/right edge clipping")
    parser.add_argument("--csv", default=str(DEFAULT_CSV))
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--png-dir", default=str(PNG_DIR))
    parser.add_argument("--slug", help="Check one slug only")
    parser.add_argument("--fail-on-issues", action="store_true")
    parser.add_argument("--report", default=str(REPORT_PATH))
    args = parser.parse_args()

    paste_rect = load_paste_rect(Path(args.config))
    rows = list(csv.DictReader(Path(args.csv).open(newline="", encoding="utf-8")))
    if args.slug:
        rows = [r for r in rows if r["slug"] == args.slug]

    results = [check_postcard(r["slug"], paste_rect, Path(args.png_dir)) for r in rows]
    failed = [r for r in results if r["failed"]]

    report = {
        "paste_rect_px": list(paste_rect),
        "total": len(results),
        "passed": len(results) - len(failed),
        "failed": len(failed),
        "failures": failed,
    }
    Path(args.report).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    print(f"QC: {report['passed']}/{report['total']} passed")
    if failed:
        print(f"FAIL: {len(failed)} postcard(s) with edge clipping")
        for item in failed[:25]:
            print(f"  - {item['slug']}: {', '.join(item.get('reasons') or ['unknown'])}")
        if len(failed) > 25:
            print(f"  ... and {len(failed) - 25} more (see {args.report})")
    else:
        print("All postcards passed edge QC")

    if args.fail_on_issues and failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
