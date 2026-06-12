"""Composite plumber postcards onto the print PDF template."""

from __future__ import annotations

from pathlib import Path

import fitz
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]


def render_pdf(pdf_path: Path, dpi: int = 300) -> Image.Image:
    doc = fitz.open(str(pdf_path))
    page = doc[0]
    scale = dpi / 72
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    doc.close()
    return img


def fit_cover(image: Image.Image, width: int, height: int) -> Image.Image:
    target_w, target_h = max(1, width), max(1, height)
    iw, ih = image.size
    scale = max(target_w / iw, target_h / ih)
    new_w = max(1, int(iw * scale))
    new_h = max(1, int(ih * scale))
    resized = image.resize((new_w, new_h), Image.Resampling.LANCZOS)
    left = (new_w - target_w) // 2
    top = (new_h - target_h) // 2
    return resized.crop((left, top, left + target_w, top + target_h))


def trim_bottom_whitespace(image: Image.Image, *, max_scan: int = 40, threshold: int = 245) -> Image.Image:
    rgb = image.convert("RGB")
    w, h = rgb.size
    step = max(1, w // 80)
    samples = w // step
    cut = 0
    for row in range(h - 1, max(h - max_scan - 1, 0), -1):
        bright = sum(1 for x in range(0, w, step) if sum(rgb.getpixel((x, row))) >= threshold * 3)
        if bright >= samples * 0.85:
            cut += 1
        else:
            break
    return rgb if cut <= 0 else rgb.crop((0, 0, w, h - cut))


def load_base_canvas(pdf_path: Path, config: dict) -> Image.Image:
    """Use pre-cleaned base PNG when available; otherwise wipe sample art from PDF."""
    base_rel = config.get("base_png")
    if base_rel:
        base_path = ROOT / base_rel
        if base_path.exists():
            return Image.open(base_path).convert("RGB").copy()

    canvas = render_pdf(pdf_path, dpi=int(config.get("dpi", 300)))
    draw = ImageDraw.Draw(canvas)
    wipe_rect = tuple(config.get("wipe_rect_px", config["website_rect_px"]))
    draw.rectangle(wipe_rect, fill="#ffffff")
    qr_clear = tuple(config.get("qr_clear_rect_px", config["qr_rect_px"]))
    draw.rectangle(qr_clear, fill="#ffffff")
    return canvas


def compose_from_pdf(
    pdf_path: Path,
    preview_shot: Image.Image,
    qr_image: Image.Image,
    config: dict,
) -> Image.Image:
    """
    PDF supplies headline, frame chrome, and footer art.
    We replace the entire baked-in website mockup (including side margins)
    and the sample QR code.
    """
    canvas = load_base_canvas(pdf_path, config)
    draw = ImageDraw.Draw(canvas)

    paste_rect = tuple(config.get("paste_rect_px", config["website_rect_px"]))
    x0, y0, x1, y1 = paste_rect
    zone_w, zone_h = x1 - x0, y1 - y0

    fitted = fit_cover(trim_bottom_whitespace(preview_shot.convert("RGB")), zone_w, zone_h)
    canvas.paste(fitted, (x0, y0))

    frame_rect = tuple(config.get("frame_rect_px", paste_rect))
    if config.get("draw_frame_border", False):
        draw.rectangle(frame_rect, outline="#000000", width=int(config.get("frame_border_px", 3)))

    qr_rect = tuple(config["qr_rect_px"])
    qx0, qy0, qx1, qy1 = qr_rect
    qr_size = min(qx1 - qx0, qy1 - qy0)
    qr = qr_image.convert("RGB")
    if qr.size != (qr_size, qr_size):
        qr = qr.resize((qr_size, qr_size), Image.Resampling.NEAREST)
    canvas.paste(qr, (qx0, qy0))

    return canvas
