#!/usr/bin/env python3
"""Automated QC for postcard website mockup left-edge clipping."""

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

# Header + upper hero bands where logo/headline clipping is visible.
HEADER_BAND_END = 0.12
HERO_BAND_END = 0.45
LEFT_GUTTER_PX = 14
LOGO_ZONE_START = 28
LOGO_ZONE_END = 72
MAX_HEADER_TEXT_START = 220
FAIL_LEFT_DENSITY = 0.06
FAIL_EDGE_VS_LOGO = 1.35


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


def _min_bright_x(rgb: Image.Image, y0: int, y1: int, *, thresh: float = 238) -> int | None:
    w, h = rgb.size
    y0 = max(0, min(y0, h))
    y1 = max(y0 + 1, min(y1, h))
    px = rgb.load()
    for x in range(w):
        for y in range(y0, y1):
            if _luminance(px[x, y]) > thresh:
                return x
    return None


def _min_content_x(rgb: Image.Image, y0: int, y1: int, *, thresh: float = 185) -> int | None:
    w, h = rgb.size
    y0 = max(0, min(y0, h))
    y1 = max(y0 + 1, min(y1, h))
    px = rgb.load()
    for x in range(w):
        for y in range(y0, y1):
            if _luminance(px[x, y]) < thresh:
                return x
    return None


def score_left_clipping(crop: Image.Image) -> dict:
    rgb = crop.convert("RGB")
    w, h = rgb.size
    header_y1 = max(1, int(h * HEADER_BAND_END))
    hero_y1 = max(header_y1 + 1, int(h * HERO_BAND_END))
    header_text_x = _min_content_x(rgb, 0, header_y1)
    hero_text_x = _min_bright_x(rgb, header_y1, hero_y1)

    bands = {
        "header": (0, header_y1),
        "hero": (header_y1, hero_y1),
    }
    metrics: dict[str, float | int | None] = {
        "header_text_min_x": header_text_x,
        "hero_text_min_x": hero_text_x,
    }
    worst = 0.0

    for name, (y0, y1) in bands.items():
        gutter = _dark_density(rgb, 0, min(LEFT_GUTTER_PX, w), y0, y1)
        logo = _dark_density(
            rgb,
            min(LOGO_ZONE_START, w),
            min(LOGO_ZONE_END, w),
            y0,
            y1,
        )
        metrics[f"{name}_left_gutter"] = round(gutter, 4)
        metrics[f"{name}_logo_zone"] = round(logo, 4)
        if logo > 0.01:
            ratio = gutter / logo
        else:
            ratio = gutter * 10
        metrics[f"{name}_edge_ratio"] = round(ratio, 4)
        worst = max(worst, gutter, ratio if logo > 0.01 else 0)

    failed = False
    reasons: list[str] = []
    for name in ("header", "hero"):
        gutter = metrics[f"{name}_left_gutter"]
        logo = metrics[f"{name}_logo_zone"]
        ratio = metrics[f"{name}_edge_ratio"]
        if gutter >= FAIL_LEFT_DENSITY and logo >= 0.02 and ratio >= FAIL_EDGE_VS_LOGO:
            failed = True
            reasons.append(f"{name}: left gutter {gutter:.1%} vs logo zone {logo:.1%}")
        elif gutter >= FAIL_LEFT_DENSITY * 2 and logo < 0.02:
            failed = True
            reasons.append(f"{name}: heavy edge content ({gutter:.1%}) with no logo margin")

    if header_text_x is not None and header_text_x > MAX_HEADER_TEXT_START:
        failed = True
        reasons.append(f"header text starts too far right (x={header_text_x})")
    if hero_text_x is not None and hero_text_x > MAX_HEADER_TEXT_START * 1.5:
        failed = True
        reasons.append(f"hero text starts too far right (x={hero_text_x})")

    return {
        "failed": failed,
        "reasons": reasons,
        "metrics": metrics,
        "score": round(worst, 4),
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
        result = score_left_clipping(crop)

    return {"slug": slug, "png": str(png_path.relative_to(ROOT)), **result}


def main() -> None:
    parser = argparse.ArgumentParser(description="QC postcard mockups for left-edge clipping")
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

    results = [
        check_postcard(r["slug"], paste_rect, Path(args.png_dir))
        for r in rows
    ]
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
        print(f"FAIL: {len(failed)} postcard(s) with left-edge clipping risk")
        for item in failed[:20]:
            print(f"  - {item['slug']}: {', '.join(item.get('reasons') or ['unknown'])}")
        if len(failed) > 20:
            print(f"  ... and {len(failed) - 20} more (see {args.report})")
    else:
        print("All postcards passed left-edge QC")

    if args.fail_on_issues and failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
