#!/usr/bin/env python3
"""Calibrate plumber postcard overlay zones from the source PDF."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import fitz
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = Path(
    r"c:\Users\zeias\Downloads\Ready for print v2 Final FRONT Plumber Postcard (9 x 6 in) (1).pdf"
)
TEMPLATE_PDF = ROOT / "postcards" / "templates" / "plumber-postcard.pdf"
TEMPLATE_JSON = ROOT / "postcards" / "templates" / "plumber-postcard.json"
DPI = 300


def render_pdf(pdf_path: Path) -> Image.Image:
    doc = fitz.open(str(pdf_path))
    page = doc[0]
    scale = DPI / 72
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    doc.close()
    return img


def detect_zones(img: Image.Image) -> dict:
    """Return overlay zones for the v2 9×6 plumber postcard (hand-verified)."""
    w, h = img.size
    return {
        "website_rect_px": [175, 180, 2525, 1285],
        "qr_rect_px": [100, 1410, 400, 1710],
        "canvas_px": [w, h],
    }


def write_config(zones: dict, source_name: str) -> None:
    config = {
        "name": "plumber",
        "description": "Ready for print v2 Final FRONT — 9×6 landscape @ 300 DPI (front only)",
        "source_pdf": source_name,
        "dpi": DPI,
        "size_inches": [9, 6],
        "landscape": True,
        **zones,
    }
    TEMPLATE_JSON.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SOURCE
    if not source.exists():
        raise SystemExit(f"Source PDF not found: {source}")

    TEMPLATE_PDF.parent.mkdir(parents=True, exist_ok=True)
    if source.resolve() != TEMPLATE_PDF.resolve():
        TEMPLATE_PDF.write_bytes(source.read_bytes())

    img = render_pdf(TEMPLATE_PDF)
    zones = detect_zones(img)

    # Visual QA overlay.
    debug = img.copy()
    draw = ImageDraw.Draw(debug)
    draw.rectangle(zones["website_rect_px"], outline="lime", width=6)
    draw.rectangle(zones["qr_rect_px"], outline="red", width=6)
    debug_path = TEMPLATE_PDF.parent / "_calibration-check.png"
    debug.save(debug_path)

    write_config(
        {
            "website_rect_px": zones["website_rect_px"],
            "qr_rect_px": zones["qr_rect_px"],
        },
        source.name,
    )

    print(f"Installed {TEMPLATE_PDF.relative_to(ROOT)}")
    print(f"Wrote {TEMPLATE_JSON.relative_to(ROOT)}")
    print(f"Wrote {debug_path.relative_to(ROOT)}")
    print("website_rect_px", zones["website_rect_px"])
    print("qr_rect_px", zones["qr_rect_px"])


if __name__ == "__main__":
    main()
