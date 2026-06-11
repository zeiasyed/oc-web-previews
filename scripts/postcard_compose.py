"""Programmatic plumber postcard — drawn entirely in code, zero PDF compositing."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]

# 9×6 in @ 300 DPI
CANVAS = (2700, 1800)
WEBSITE_RECT = (175, 180, 2525, 1285)
QR_RECT = (100, 1410, 400, 1710)

BLUE_DARK = "#2d5c87"
YELLOW = "#ffde59"
TEXT_DARK = "#0f172a"
TEXT_MUTED = "#475569"
BORDER = "#000000"


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


def _draw_headline_pill(draw: ImageDraw.ImageDraw, text: str, canvas_w: int) -> None:
    font = load_font(52, bold=True)
    pad_x, pad_y = 56, 22
    text_w = int(draw.textlength(text, font=font))
    pill_w = text_w + pad_x * 2
    pill_h = font.size + pad_y * 2 if hasattr(font, "size") else 90
    pill_x = (canvas_w - pill_w) // 2
    pill_y = 95
    draw.rounded_rectangle(
        (pill_x, pill_y, pill_x + pill_w, pill_y + pill_h),
        radius=pill_h // 2,
        fill=BLUE_DARK,
    )
    draw.text(
        (pill_x + pad_x, pill_y + pad_y - 2),
        text,
        fill=YELLOW,
        font=font,
    )


def _draw_website_frame(canvas: Image.Image, preview: Image.Image, rect: tuple[int, int, int, int]) -> None:
    x0, y0, x1, y1 = rect
    inner_w, inner_h = x1 - x0, y1 - y0
    fitted = fit_cover(trim_bottom_whitespace(preview), inner_w, inner_h)
    canvas.paste(fitted, (x0, y0))
    draw = ImageDraw.Draw(canvas)
    draw.rectangle(rect, outline=BORDER, width=3)


def _draw_footer(
    canvas: Image.Image,
    branding: dict,
    qr_image: Image.Image,
    qr_rect: tuple[int, int, int, int],
) -> None:
    draw = ImageDraw.Draw(canvas)
    qx0, qy0, qx1, qy1 = qr_rect
    qr_size = min(qx1 - qx0, qy1 - qy0)
    qr = qr_image.convert("RGB")
    if qr.size != (qr_size, qr_size):
        qr = qr.resize((qr_size, qr_size), Image.Resampling.NEAREST)
    canvas.paste(qr, (qx0, qy0))

    label = branding.get("postcard_qr_label", "Scan to see your new site").rstrip(":")
    label_font = load_font(46, bold=True)
    label_w = int(draw.textlength(label, font=label_font))
    pill_x0 = qx1 + 40
    pill_pad_x, pill_pad_y = 48, 36
    pill_w = label_w + pill_pad_x * 2
    pill_h = label_font.size + pill_pad_y * 2 if hasattr(label_font, "size") else 120
    pill_y0 = qy0 + (qr_size - pill_h) // 2
    pill_x1 = pill_x0 + pill_w
    pill_y1 = pill_y0 + pill_h
    draw.rounded_rectangle(
        (pill_x0, pill_y0, pill_x1, pill_y1),
        radius=pill_h // 2,
        fill="#ffffff",
        outline=BLUE_DARK,
        width=4,
    )
    draw.text(
        (pill_x0 + pill_pad_x, pill_y0 + pill_pad_y - 4),
        label,
        fill=TEXT_DARK,
        font=label_font,
    )

    phone = branding.get("phone_display", "")
    website = branding.get("postcard_website_url", "www.solena-digital.com")
    small = load_font(28)
    big = load_font(72, bold=True)
    site = load_font(30)

    block_right = CANVAS[0] - 120
    block_top = qy0 + 20
    prefix = "Or Call us:"
    prefix_w = int(draw.textlength(prefix, font=small))
    draw.text((block_right - prefix_w, block_top), prefix, fill=TEXT_MUTED, font=small)

    phone_w = int(draw.textlength(phone, font=big))
    draw.text((block_right - phone_w, block_top + 38), phone, fill=TEXT_DARK, font=big)

    site_w = int(draw.textlength(website, font=site))
    draw.text((block_right - site_w, block_top + 130), website, fill=TEXT_MUTED, font=site)


def compose_plumber_postcard(
    preview_shot: Image.Image,
    qr_image: Image.Image,
    config: dict,
    *,
    branding: dict | None = None,
    assets_dir: Path | None = None,
) -> Image.Image:
    """Draw a complete 9×6 postcard from scratch."""
    _ = assets_dir  # unused — no PDF assets
    branding = branding or {}
    canvas_w, canvas_h = CANVAS
    website_rect = tuple(config.get("website_rect_px", WEBSITE_RECT))
    qr_rect = tuple(config.get("qr_rect_px", QR_RECT))

    canvas = Image.new("RGB", (canvas_w, canvas_h), "#ffffff")
    draw = ImageDraw.Draw(canvas)

    headline = branding.get("postcard_headline", "I rebuilt your website to get you more calls.")
    _draw_headline_pill(draw, headline, canvas_w)
    _draw_website_frame(canvas, preview_shot, website_rect)
    _draw_footer(canvas, branding, qr_image, qr_rect)

    return canvas
