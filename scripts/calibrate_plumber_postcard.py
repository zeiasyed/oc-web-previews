#!/usr/bin/env python3
"""Install and calibrate the plumber postcard PDF template."""

from __future__ import annotations

import json
from pathlib import Path

import fitz
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = Path(
    r"c:\Users\zeias\Downloads\Ready for print v2 Final FRONT Plumber Postcard (9 x 6 in) (1).pdf"
)
TEMPLATE_PDF = ROOT / "postcards" / "templates" / "plumber-postcard.pdf"
TEMPLATE_JSON = ROOT / "postcards" / "templates" / "plumber-postcard.json"
CALIBRATION_PNG = ROOT / "postcards" / "templates" / "_calibration-check.png"
DPI = 300

# Ready for print v2 Final FRONT Plumber Postcard (9 x 6 in) @ 300 DPI
WEBSITE_RECT = [175, 180, 2525, 1285]
FRAME_RECT = [175, 180, 2525, 1285]
QR_RECT = [100, 1410, 400, 1710]
QR_CLEAR_RECT = [70, 1395, 430, 1730]


def render_pdf(pdf_path: Path) -> Image.Image:
    doc = fitz.open(str(pdf_path))
    page = doc[0]
    scale = DPI / 72
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    doc.close()
    return img


def install_template(source: Path) -> None:
    TEMPLATE_PDF.parent.mkdir(parents=True, exist_ok=True)
    if source.resolve() != TEMPLATE_PDF.resolve():
        TEMPLATE_PDF.write_bytes(source.read_bytes())

    config = {
        "name": "plumber",
        "description": "Ready for print v2 Final FRONT Plumber Postcard (9 x 6 in)",
        "source_pdf": source.name,
        "compose_mode": "pdf",
        "dpi": DPI,
        "size_inches": [9, 6],
        "landscape": True,
        "website_rect_px": WEBSITE_RECT,
        "frame_rect_px": FRAME_RECT,
        "frame_border_px": 3,
        "qr_rect_px": QR_RECT,
        "qr_clear_rect_px": QR_CLEAR_RECT,
    }
    TEMPLATE_JSON.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")

    check = render_pdf(TEMPLATE_PDF).copy()
    overlay = ImageDraw.Draw(check)
    overlay.rectangle(WEBSITE_RECT, outline="#00cc44", width=4)
    overlay.rectangle(QR_CLEAR_RECT, outline="#ff0000", width=4)
    overlay.rectangle(QR_RECT, outline="#ff8800", width=3)
    check.save(CALIBRATION_PNG)

    print(f"Installed {TEMPLATE_PDF.relative_to(ROOT)}")
    print(f"Wrote {TEMPLATE_JSON.relative_to(ROOT)}")
    print(f"Wrote {CALIBRATION_PNG.relative_to(ROOT)}")


if __name__ == "__main__":
    import sys

    source = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SOURCE
    if not source.exists():
        raise SystemExit(f"Source PDF not found: {source}")
    install_template(source)
