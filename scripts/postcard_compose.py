"""Composite plumber postcards onto the print PDF template."""

from __future__ import annotations

from pathlib import Path

import fitz
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]


def render_pdf(pdf_path: Path, dpi: int = 300) -> Image.Image:
    doc = fitz.open(str(pdf_path))
    page = doc[0]
    scale = dpi / 72
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    doc.close()
    return img


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size=size)
    return ImageFont.load_default()


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


def expand_rect(rect: tuple[int, int, int, int], pad: int) -> tuple[int, int, int, int]:
    x0, y0, x1, y1 = rect
    return (x0 - pad, y0 - pad, x1 + pad, y1 + pad)


def load_base_canvas(pdf_path: Path, config: dict) -> Image.Image:
    """Use pre-cleaned base PNG when available; otherwise wipe sample art from PDF."""
    clear_pad = int(config.get("scan_pill_clear_pad_px", 6))
    scan_clear = expand_rect(
        tuple(config.get("scan_pill_clear_rect_px", config["qr_rect_px"])),
        clear_pad,
    )

    base_rel = config.get("base_png")
    if base_rel:
        base_path = ROOT / base_rel
        if base_path.exists():
            canvas = Image.open(base_path).copy()
            draw = ImageDraw.Draw(canvas)
            draw.rectangle(scan_clear, fill="#ffffff")
            return canvas

    canvas = render_pdf(pdf_path, dpi=int(config.get("dpi", 300)))
    draw = ImageDraw.Draw(canvas)
    draw.rectangle(tuple(config.get("wipe_rect_px", config["website_rect_px"])), fill="#ffffff")
    draw.rectangle(scan_clear, fill="#ffffff")
    return canvas


def rebuild_base_png(pdf_path: Path, config: dict, out_path: Path | None = None) -> Path:
    """Write a cleaned template PNG with sample website + scan pill removed."""
    base_rel = config.get("base_png")
    dest = out_path or (ROOT / base_rel if base_rel else ROOT / "postcards/templates/plumber-postcard-base.png")
    clear_pad = int(config.get("scan_pill_clear_pad_px", 6))
    scan_clear = expand_rect(
        tuple(config.get("scan_pill_clear_rect_px", config["qr_rect_px"])),
        clear_pad,
    )
    canvas = render_pdf(pdf_path, dpi=int(config.get("dpi", 300)))
    draw = ImageDraw.Draw(canvas)
    draw.rectangle(tuple(config.get("wipe_rect_px", config["website_rect_px"])), fill="#ffffff")
    draw.rectangle(scan_clear, fill="#ffffff")
    dest.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(dest, "PNG")
    return dest


def _draw_flat_left_pill_outline(
    draw: ImageDraw.ImageDraw,
    rect: tuple[int, int, int, int],
    *,
    color: str,
    width: int,
) -> None:
    """Pill outline with a square left edge and rounded right cap (matches print PDF)."""
    x0, y0, x1, y1 = rect
    h = y1 - y0
    radius = max(1, h // 2)
    cap_x = x1 - radius
    mid_y = (y0 + y1) // 2

    draw.line([(x0, y0), (cap_x, y0)], fill=color, width=width)
    draw.line([(x0, y1 - 1), (cap_x, y1 - 1)], fill=color, width=width)
    draw.line([(x0, y0), (x0, y1)], fill=color, width=width)
    draw.arc(
        (cap_x - radius, mid_y - radius, cap_x + radius, mid_y + radius),
        start=270,
        end=89,
        fill=color,
        width=width,
    )


def _draw_scan_pill(
    canvas: Image.Image,
    qr_image: Image.Image,
    config: dict,
    branding: dict | None,
) -> None:
    scan_pill = config.get("scan_pill_rect_px")
    if not scan_pill:
        qr_rect = tuple(config["qr_rect_px"])
        qx0, qy0, qx1, qy1 = qr_rect
        qr_size = min(qx1 - qx0, qy1 - qy0)
        qr = qr_image.convert("RGB")
        if qr.size != (qr_size, qr_size):
            qr = qr.resize((qr_size, qr_size), Image.Resampling.NEAREST)
        canvas.paste(qr, (qx0, qy0))
        return

    draw = ImageDraw.Draw(canvas)
    px0, py0, px1, py1 = tuple(scan_pill)
    clear_pad = int(config.get("scan_pill_clear_pad_px", 6))
    clear = expand_rect(tuple(config.get("scan_pill_clear_rect_px", scan_pill)), clear_pad)
    draw.rectangle(clear, fill="#ffffff")

    qr_rect = tuple(config["qr_rect_px"])
    qx0, qy0, qx1, qy1 = qr_rect
    qr_size = min(qx1 - qx0, qy1 - qy0)
    qr = qr_image.convert("RGB")
    if qr.size != (qr_size, qr_size):
        qr = qr.resize((qr_size, qr_size), Image.Resampling.NEAREST)
    canvas.paste(qr, (qx0, qy0))

    label = (branding or {}).get("postcard_qr_label", "Scan to see your new site").rstrip(":")
    font = load_font(int(config.get("scan_pill_font_px", 46)), bold=True)
    text_h = font.size if hasattr(font, "size") else 46
    text_x = qx1 + 36
    text_y = py0 + ((py1 - py0) - text_h) // 2 - 2
    text_color = config.get("scan_pill_text_color", "#334155")
    draw.text((text_x, text_y), label, fill=text_color, font=font)

    color = config.get("scan_pill_color", "#2d5c87")
    width = int(config.get("scan_pill_border_px", 4))
    inset = width // 2 + 1
    _draw_flat_left_pill_outline(
        draw,
        (px0 + inset, py0 + inset, px1 - inset, py1 - inset),
        color=color,
        width=width,
    )


def compose_from_pdf(
    pdf_path: Path,
    preview_shot: Image.Image,
    qr_image: Image.Image,
    config: dict,
    *,
    branding: dict | None = None,
) -> Image.Image:
    """PDF supplies headline + footer contact info; we replace mockup website + scan pill."""
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

    _draw_scan_pill(canvas, qr_image, config, branding)

    return canvas
