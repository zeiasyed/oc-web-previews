#!/usr/bin/env python3
"""Extract static print assets from the plumber postcard PDF."""

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
ASSETS_DIR = ROOT / "postcards" / "templates" / "assets"
DPI = 300

# Measured from Ready for print v2 Final FRONT @ 300 DPI.
HEADLINE_PILL_RECT = [480, 85, 2210, 175]
WEBSITE_RECT = [0, 175, 2700, 1375]
FOOTER_RECT = [0, 1380, 2700, 1800]
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


def extract_assets(source: Path) -> None:
    TEMPLATE_PDF.parent.mkdir(parents=True, exist_ok=True)
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    if source.resolve() != TEMPLATE_PDF.resolve():
        TEMPLATE_PDF.write_bytes(source.read_bytes())

    base = render_pdf(TEMPLATE_PDF)

    base.crop(HEADLINE_PILL_RECT).save(ASSETS_DIR / "headline-pill.png")

    footer = base.crop(FOOTER_RECT)
    footer_draw = ImageDraw.Draw(footer)
    fx0, fy0, _, _ = FOOTER_RECT
    qx0, qy0, qx1, qy1 = QR_CLEAR_RECT
    footer_draw.rectangle(
        (qx0 - fx0, qy0 - fy0, qx1 - fx0, qy1 - fy0),
        fill="#ffffff",
    )
    footer.save(ASSETS_DIR / "footer.png")

    config = {
        "name": "plumber",
        "description": "Ready for print v2 Final FRONT — layer composited @ 300 DPI",
        "source_pdf": source.name,
        "compose_mode": "layers",
        "dpi": DPI,
        "size_inches": [9, 6],
        "landscape": True,
        "headline_pill_rect_px": HEADLINE_PILL_RECT,
        "headline_paste_y": 90,
        "website_rect_px": WEBSITE_RECT,
        "footer_rect_px": FOOTER_RECT,
        "qr_rect_px": QR_RECT,
        "qr_clear_rect_px": QR_CLEAR_RECT,
        "assets_dir": "postcards/templates/assets",
    }
    TEMPLATE_JSON.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")

    print(f"Installed {TEMPLATE_PDF.relative_to(ROOT)}")
    print(f"Extracted assets -> {ASSETS_DIR.relative_to(ROOT)}")
    print(f"Wrote {TEMPLATE_JSON.relative_to(ROOT)}")


if __name__ == "__main__":
    import sys

    source = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SOURCE
    if not source.exists():
        raise SystemExit(f"Source PDF not found: {source}")
    extract_assets(source)
