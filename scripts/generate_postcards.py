"""Generate print-ready postcard PNGs (PDF template or programmatic layout)."""

from __future__ import annotations

import argparse
import csv
import json
import re
import shutil
import sys
from io import BytesIO
from pathlib import Path

import fitz
import qrcode
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))
from postcard_compose import compose_from_pdf  # noqa: E402

CONFIG_PATH = ROOT / "config" / "branding.json"
OUT_DIR = ROOT / "postcards" / "png"
BACK_DIR = ROOT / "postcards" / "png" / "back"
QR_DIR = ROOT / "postcards" / "qr"

# 5x7 inches at 300 DPI (portrait default)
PORTRAIT_SIZE = (1500, 2100)
LANDSCAPE_SIZE = (2100, 1500)
MARGIN = 56
TOP_WHITESPACE = 100
FOOTER_HEIGHT = 130
LANDSCAPE_TOP_WHITESPACE = 100
LANDSCAPE_FOOTER_HEIGHT = 110

HEADLINE = "Your business deserves to be found online — we made you a new website."
QR_LABEL = "Scan to see your site"
DEFAULT_ACCENT = "#1e6f9f"
DEFAULT_ACCENT_DARK = "#155a80"
PREVIEW_CAPTURE_WIDTH = 1280
STAMP_WIDTH = 270
STAMP_HEIGHT = 315

# Postcard mailing address (USPS DMM 202 + Smartpress card specs)
USPS_ADDRESS_SIDE = int(0.5 * 300)  # 1/2" from left/right edges
USPS_ADDRESS_BOTTOM = int(0.75 * 300)  # 3/4" from bottom — postcard address floor
USPS_BOTTOM_CLEAR = int(0.625 * 300)  # 5/8" barcode clear zone height from bottom
USPS_ADDRESS_BOX_WIDTH = int(3.25 * 300)  # ~3.25" — fits 4 address lines + IMB clearance
USPS_ADDRESS_BOX_HEIGHT = int(1.25 * 300)  # practical To block (~4 lines), within 2-1/8" zone
TO_ADDRESS_LINES = 4


def load_branding() -> dict:
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def load_template_config(branding: dict, template_name: str | None) -> tuple[Path, dict] | None:
    if template_name is False:
        return None
    config_rel = branding.get("postcard_template_config")
    pdf_rel = branding.get("postcard_template_pdf")
    if not config_rel or not pdf_rel:
        return None
    config_path = ROOT / config_rel
    pdf_path = ROOT / pdf_rel
    if not config_path.exists() or not pdf_path.exists():
        raise FileNotFoundError(f"Postcard template missing: {pdf_path} or {config_path}")
    config = json.loads(config_path.read_text(encoding="utf-8"))
    if template_name and template_name not in ("default", "auto", "plumber"):
        alt_pdf = ROOT / "postcards" / "templates" / f"{template_name}-postcard.pdf"
        alt_cfg = ROOT / "postcards" / "templates" / f"{template_name}-postcard.json"
        if alt_pdf.exists() and alt_cfg.exists():
            pdf_path, config_path = alt_pdf, alt_cfg
            config = json.loads(config_path.read_text(encoding="utf-8"))
    return pdf_path, config


def render_pdf_template(pdf_path: Path, dpi: int = 300) -> Image.Image:
    doc = fitz.open(pdf_path)
    page = doc[0]
    scale = dpi / 72
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    doc.close()
    return img


def expand_rect(rect: tuple[int, int, int, int], pad: int) -> tuple[int, int, int, int]:
    x0, y0, x1, y1 = rect
    return (x0 - pad, y0 - pad, x1 + pad, y1 + pad)


def fit_cover(image: Image.Image, width: int, height: int, *, overscan: float = 1.0) -> Image.Image:
    """Scale and center-crop to fill a fixed rectangle (consistent across all postcards)."""
    target_w = max(1, int(width * overscan))
    target_h = max(1, int(height * overscan))
    iw, ih = image.size
    scale = max(target_w / iw, target_h / ih)
    new_w = max(1, int(iw * scale))
    new_h = max(1, int(ih * scale))
    resized = image.resize((new_w, new_h), Image.Resampling.LANCZOS)
    left = (new_w - target_w) // 2
    top = (new_h - target_h) // 2
    cropped = resized.crop((left, top, left + target_w, top + target_h))
    if cropped.size == (width, height):
        return cropped
    return cropped.resize((width, height), Image.Resampling.LANCZOS)


def remove_legacy_postcard_variants(slug: str) -> None:
    """Drop old portrait/legacy/back files so only the PDF-template front remains."""
    candidates = [
        OUT_DIR / f"{slug}.png",
        OUT_DIR / f"{slug}-back.png",
        BACK_DIR / f"{slug}-back.png",
        BACK_DIR / f"{slug}-landscape-back.png",
    ]
    for path in candidates:
        if path.exists():
            path.unlink()
            print(f"Removed legacy {path.relative_to(ROOT)}")


def preview_slugs() -> list[str]:
    previews_dir = ROOT / "previews"
    if not previews_dir.exists():
        return []
    return sorted(
        p.name
        for p in previews_dir.iterdir()
        if p.is_dir() and (p / "index.html").exists()
    )

def paste_in_rect(base: Image.Image, overlay: Image.Image, rect: tuple[int, int, int, int]) -> None:
    x0, y0, x1, y1 = rect
    zone_w, zone_h = x1 - x0, y1 - y0
    ow, oh = overlay.size
    if ow > zone_w or oh > zone_h:
        scale = min(zone_w / ow, zone_h / oh)
        overlay = overlay.resize((max(1, int(ow * scale)), max(1, int(oh * scale))), Image.Resampling.LANCZOS)
        ow, oh = overlay.size
    paste_x = x0 + (zone_w - ow) // 2
    paste_y = y0 + (zone_h - oh) // 2
    base.paste(overlay, (paste_x, paste_y))


def paste_cover_rect(base: Image.Image, overlay: Image.Image, rect: tuple[int, int, int, int]) -> None:
    x0, y0, x1, y1 = rect
    zone_w, zone_h = x1 - x0, y1 - y0
    fitted = fit_cover(overlay.convert("RGB"), zone_w, zone_h, overscan=1.0)
    base.paste(fitted, (x0, y0))


def draw_postcard_from_template(
    row: dict,
    branding: dict,
    preview_shot: Image.Image | None,
    pdf_path: Path,
    config: dict,
) -> Image.Image:
    """Composite preview screenshot + QR onto the print PDF template."""
    website_rect = tuple(
        config.get(
            "website_rect_px",
            config.get(
                "preview_paste_rect_px",
                config.get("preview_rect_px", (175, 180, 2525, 1285)),
            ),
        )
    )
    x0, y0, x1, y1 = website_rect
    zone_w, zone_h = x1 - x0, y1 - y0

    if preview_shot is None:
        preview_shot = Image.new("RGB", (zone_w, zone_h), "#e2e8f0")
        placeholder_draw = ImageDraw.Draw(preview_shot)
        placeholder_draw.text(
            (40, zone_h // 2 - 20),
            f"{row['name']} — website preview",
            fill="#64748b",
            font=load_font(40, bold=True),
        )
    elif preview_shot.size != (zone_w, zone_h):
        preview_shot = fit_cover(preview_shot.convert("RGB"), zone_w, zone_h)

    qr_rect = tuple(config["qr_rect_px"])
    qx0, qy0, qx1, qy1 = qr_rect
    qr_size = min(qx1 - qx0, qy1 - qy0)
    qr_inner = max(64, qr_size - 12)

    base_url = branding.get("github_pages_base", "https://YOUR_GITHUB_USERNAME.github.io/oc-web-previews")
    connect_url = f"{base_url.rstrip('/')}/landing/connect.html?biz={row['slug']}"
    qr = qr_image(connect_url, qr_inner)
    qr_canvas = Image.new("RGB", (qr_size, qr_size), "#ffffff")
    inset = (qr_size - qr_inner) // 2
    qr_canvas.paste(qr, (inset, inset))

    return compose_from_pdf(pdf_path, preview_shot, qr_canvas, config)


def ensure_template_in_repo(source_pdf: Path | None) -> None:
    """Copy template PDF from a local path into the repo once, then use repo copy only."""
    branding = load_branding()
    pdf_rel = branding.get("postcard_template_pdf")
    if not pdf_rel:
        return
    dest = ROOT / pdf_rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    if source_pdf and source_pdf.exists() and source_pdf.resolve() != dest.resolve():
        shutil.copy2(source_pdf, dest)
        print(f"Installed template -> {dest.relative_to(ROOT)}")

def resolve_logo_path(branding: dict) -> Path:
    rel = branding.get("logo_path", "landing/assets/solena-digital-logo.png")
    path = ROOT / rel
    if path.exists():
        return path
    fallback = ROOT / "landing" / "assets" / "solena-digital-logo.png"
    return fallback if fallback.exists() else path


def resolve_header_logo_path(branding: dict) -> Path:
    rel = branding.get("logo_header_path")
    if not rel and branding.get("logo_header_url"):
        rel = f"landing/assets/{Path(branding['logo_header_url']).name}"
    if rel:
        path = ROOT / rel
        if path.exists():
            return path
    return resolve_logo_path(branding)


def load_brand_logo(
    branding: dict,
    max_width: int,
    *,
    max_height: int | None = None,
    header: bool = False,
) -> Image.Image | None:
    path = resolve_header_logo_path(branding) if header else resolve_logo_path(branding)
    if not path.exists():
        return None
    logo = Image.open(path)
    if logo.mode not in ("RGB", "RGBA"):
        logo = logo.convert("RGBA")
    width, height = logo.size
    scale = 1.0
    if width > max_width:
        scale = min(scale, max_width / width)
    if max_height is not None:
        scale = min(scale, max_height / height)
    if scale < 1.0:
        logo = logo.resize(
            (max(1, int(width * scale)), max(1, int(height * scale))),
            Image.Resampling.LANCZOS,
        )
    return logo


def paste_logo(img: Image.Image, logo: Image.Image, x: int, y: int) -> None:
    if logo.mode == "RGBA":
        img.paste(logo, (x, y), logo)
    else:
        img.paste(logo, (x, y))


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size=size)
    return ImageFont.load_default()


def wrap_text(draw: ImageDraw.ImageDraw, text: str, font, max_width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        test = f"{current} {word}".strip()
        if draw.textlength(test, font=font) <= max_width:
            current = test
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def fit_font_size(
    draw: ImageDraw.ImageDraw,
    text: str,
    max_width: int,
    start_size: int,
    min_size: int,
    bold: bool = True,
) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for size in range(start_size, min_size - 1, -2):
        font = load_font(size, bold=bold)
        lines = wrap_text(draw, text, font, max_width)
        if len(lines) <= 2 and all(draw.textlength(line, font=font) <= max_width for line in lines):
            return font
    return load_font(min_size, bold=bold)


def parse_preview_colors(slug: str) -> tuple[str, str]:
    css_path = ROOT / "previews" / slug / "styles.css"
    if not css_path.exists():
        return DEFAULT_ACCENT, DEFAULT_ACCENT_DARK

    css = css_path.read_text(encoding="utf-8")
    primary = re.search(r"--primary:\s*([^;]+);", css)
    primary_dark = re.search(r"--primary-dark:\s*([^;]+);", css)
    accent = primary.group(1).strip() if primary else DEFAULT_ACCENT
    accent_dark = primary_dark.group(1).strip() if primary_dark else DEFAULT_ACCENT_DARK
    return accent, accent_dark


def qr_image(url: str, size: int) -> Image.Image:
    """Render a crisp QR code with integer module scaling (no seam lines)."""
    qr = qrcode.QRCode(box_size=1, border=1)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#0f172a", back_color="white").convert("RGB")
    modules = img.size[0]
    scale = max(1, size // modules)
    exact = modules * scale
    img = img.resize((exact, exact), Image.Resampling.NEAREST)
    if exact == size:
        return img
    canvas = Image.new("RGB", (size, size), "white")
    canvas.paste(img, ((size - exact) // 2, (size - exact) // 2))
    return canvas


def capture_site_preview(
    slug: str,
    capture_width: int | None = None,
    *,
    target_size: tuple[int, int] | None = None,
) -> Image.Image | None:
    preview_path = ROOT / "previews" / slug / "index.html"
    if not preview_path.exists():
        return None

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return None

    viewport_width = capture_width or PREVIEW_CAPTURE_WIDTH
    if target_size:
        viewport_width = max(viewport_width, target_size[0])

    url = preview_path.as_uri()
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            page = browser.new_page(viewport={"width": viewport_width, "height": 1200})
            page.goto(url, wait_until="networkidle", timeout=60000)
            page.evaluate(
                """() => {
                    document.querySelector('.preview-bar')?.remove();
                }"""
            )
            clip = page.evaluate(
                """(viewportWidth) => {
                    const header = document.querySelector('header.site-header');
                    const hero = document.querySelector('section.hero');
                    if (!header || !hero) return { x: 0, y: 0, width: viewportWidth, height: 520 };
                    const top = header.getBoundingClientRect().top;
                    const heroStyle = window.getComputedStyle(hero);
                    const padBottom = parseFloat(heroStyle.paddingBottom) || 0;
                    const bottom = hero.getBoundingClientRect().bottom - padBottom + 8;
                    return {
                        x: 0,
                        y: Math.max(0, Math.floor(top)),
                        width: viewportWidth,
                        height: Math.max(1, Math.ceil(bottom - top)),
                    };
                }""",
                viewport_width,
            )
            shot = page.screenshot(clip=clip)
            browser.close()
        image = Image.open(BytesIO(shot)).convert("RGB")
        if target_size:
            image = fit_cover(image, target_size[0], target_size[1], overscan=1.0)
        return image
    except Exception as exc:
        print(f"  Preview screenshot failed for {slug}: {exc}")
        return None


def rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255)
    return mask


def add_drop_shadow(base: Image.Image, rect: tuple[int, int, int, int], radius: int = 24, offset: int = 10) -> None:
    x0, y0, x1, y1 = rect
    shadow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(shadow)
    draw.rounded_rectangle(
        (x0 + offset, y0 + offset, x1 + offset, y1 + offset),
        radius=radius,
        fill=(15, 23, 42, 55),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(18))
    base.paste(shadow, (0, 0), shadow)


def build_browser_preview(
    screenshot: Image.Image,
    business_name: str,
    max_frame_width: int,
    accent: str,
    *,
    max_frame_height: int | None = None,
) -> Image.Image:
    chrome_height = 64
    side_padding = 12
    bottom_padding = 12
    max_content_w = max_frame_width - 2 * side_padding

    src_w, src_h = screenshot.size
    if max_frame_height:
        max_content_h = max_frame_height - chrome_height - bottom_padding
        scale = min(max_content_w / src_w, max_content_h / src_h)
    else:
        scale = min(1.0, max_content_w / src_w)

    content_w = max(1, int(src_w * scale))
    content_h = max(1, int(src_h * scale))
    resized = screenshot.resize((content_w, content_h), Image.Resampling.LANCZOS)

    frame_width = content_w + 2 * side_padding
    frame_height = chrome_height + content_h + bottom_padding
    radius = 20

    frame = Image.new("RGBA", (frame_width, frame_height), (0, 0, 0, 0))
    frame_rect = (0, 0, frame_width - 1, frame_height - 1)
    add_drop_shadow(frame, frame_rect, radius=radius)

    body = Image.new("RGBA", (frame_width, frame_height), "#ffffff")
    draw = ImageDraw.Draw(body)
    draw.rounded_rectangle(frame_rect, radius=radius, fill="#ffffff", outline="#dbe3ee", width=3)

    chrome_font = load_font(20)
    dot_colors = ["#ff5f57", "#febc2e", "#28c840"]
    for idx, color in enumerate(dot_colors):
        draw.ellipse((24 + idx * 24, 20, 38 + idx * 24, 34), fill=color)

    address_text = f"{business_name.lower().replace(' ', '')}.com"
    draw.rounded_rectangle((108, 16, frame_width - 24, 46), radius=12, fill="#f1f5f9", outline="#e2e8f0", width=1)
    draw.text((124, 20), address_text, fill="#64748b", font=chrome_font)

    draw.rectangle((side_padding, chrome_height - 4, frame_width - side_padding, chrome_height), fill=accent)

    content_x = side_padding
    content_y = chrome_height
    mask = rounded_mask((content_w, content_h), radius=12)
    frame.paste(body, (0, 0), body)
    frame.paste(resized, (content_x, content_y), mask)
    return frame.convert("RGB")


def draw_arrow_left(draw: ImageDraw.ImageDraw, x: int, y: int, size: int, color: str) -> None:
    draw.polygon(
        [
            (x, y + size // 2),
            (x + size, y),
            (x + int(size * 0.72), y + size // 2),
            (x + size, y + size),
        ],
        fill=color,
    )


def draw_prominent_qr_block(
    img: Image.Image,
    connect_url: str,
    label: str,
    accent: str,
    accent_dark: str,
    zone_top: int,
    zone_height: int,
    *,
    horizontal: bool = True,
    zone_left: int | None = None,
    zone_width: int | None = None,
    qr_size: int | None = None,
) -> None:
    draw = ImageDraw.Draw(img)
    canvas_w = img.width
    content_width = zone_width if zone_width is not None else canvas_w - 2 * MARGIN
    zone_x = zone_left if zone_left is not None else MARGIN

    if qr_size is None:
        qr_size = 280 if not horizontal else 300
    label_font = load_font(32 if qr_size <= 230 else (36 if not horizontal else 42), bold=True)
    text_max_w = content_width - 56 if not horizontal else content_width - qr_size - 120
    label_lines = wrap_text(draw, label, label_font, max(text_max_w, 120))
    if horizontal:
        text_block_h = len(label_lines) * 52 + 20
        card_h = max(qr_size + 56, text_block_h + 56)
        card_w = min(
            content_width,
            qr_size + 80 + int(max(draw.textlength(line, font=label_font) for line in label_lines)) + 80,
        )
        card_w = max(card_w, qr_size + 320)
    else:
        text_block_h = len(label_lines) * 44 + 12
        card_w = min(content_width, max(qr_size + 56, int(max(draw.textlength(line, font=label_font) for line in label_lines)) + 56))
        card_h = qr_size + text_block_h + 72

    card_x = zone_x + (content_width - card_w) // 2
    card_y = zone_top + (zone_height - card_h) // 2
    card_rect = (card_x, card_y, card_x + card_w, card_y + card_h)

    shadow_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow_layer)
    shadow_draw.rounded_rectangle(
        (card_x + 6, card_y + 10, card_x + card_w + 6, card_y + card_h + 10),
        radius=28,
        fill=(15, 23, 42, 40),
    )
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(16))
    img.paste(shadow_layer, (0, 0), shadow_layer)

    draw.rounded_rectangle(card_rect, radius=28, fill="#ffffff", outline=accent, width=5)

    qr = qr_image(connect_url, qr_size)
    qr_x = card_x + 28
    qr_y = card_y + (card_h - qr_size) // 2
    draw.rounded_rectangle(
        (qr_x - 8, qr_y - 8, qr_x + qr_size + 8, qr_y + qr_size + 8),
        radius=14,
        fill="#f8fafc",
        outline="#e2e8f0",
        width=2,
    )
    img.paste(qr, (qr_x, qr_y))

    if horizontal:
        arrow_x = qr_x + qr_size + 20
        arrow_y = card_y + card_h // 2 - 17
        draw_arrow_left(draw, arrow_x, arrow_y, 34, accent)
        text_x = arrow_x + 48
        text_y = card_y + (card_h - text_block_h) // 2
        line_step = 52
    else:
        text_x = card_x + (card_w - int(max(draw.textlength(line, font=label_font) for line in label_lines))) // 2
        text_y = qr_y + qr_size + 28
        line_step = 44

    for line in label_lines:
        if not horizontal:
            text_x = card_x + (card_w - int(draw.textlength(line, font=label_font))) // 2
        draw.text((text_x, text_y), line, fill=accent_dark, font=label_font)
        text_y += line_step


def draw_contact_footer(
    img: Image.Image,
    branding: dict,
    accent: str,
    accent_dark: str,
    *,
    footer_height: int = FOOTER_HEIGHT,
    compact: bool = False,
    right_limit: int | None = None,
) -> None:
    draw = ImageDraw.Draw(img)
    canvas_w, canvas_h = img.size
    footer_top = canvas_h - footer_height
    content_right = right_limit if right_limit is not None else canvas_w - MARGIN

    draw.line((MARGIN, footer_top, content_right, footer_top), fill="#e2e8f0", width=2)

    contact_font = load_font(22 if compact else 24)
    phone = branding.get("phone_display", "")
    email = branding.get("email_display", "")
    contact_line = "  ·  ".join(part for part in (phone, email) if part)
    show_contact = bool(contact_line) and not compact

    tagline = branding.get("tagline", "")
    tag_font = load_font(18 if compact else 20)
    tag_height = tag_font.size if hasattr(tag_font, "size") else 20
    contact_height = contact_font.size if hasattr(contact_font, "size") else 22

    reserved_below_logo = (contact_height + 8) if show_contact else 0
    max_logo_height = footer_height - 20 - reserved_below_logo
    logo = load_brand_logo(
        branding,
        max_width=220 if compact else 260,
        max_height=max_logo_height,
        header=True,
    )

    if logo:
        logo_y = footer_top + (footer_height - logo.height - reserved_below_logo) // 2
        paste_logo(img, logo, MARGIN, logo_y)
        if show_contact:
            contact_y = logo_y + logo.height + 8
            if contact_y + contact_height <= canvas_h - 8:
                draw.text((MARGIN, contact_y), contact_line, fill="#475569", font=contact_font)
    else:
        brand_font = load_font(24 if compact else 28, bold=True)
        brand_name = branding["brand_name"]
        brand_y = footer_top + (footer_height - brand_font.size) // 2
        draw.text((MARGIN, brand_y), brand_name, fill=accent_dark, font=brand_font)

    if tagline:
        tag_width = draw.textlength(tagline, font=tag_font)
        tag_x = content_right - tag_width
        if tag_x > MARGIN + 280:
            tag_y = footer_top + (footer_height - tag_height) // 2
            draw.text((tag_x, tag_y), tagline, fill="#94a3b8", font=tag_font)


def draw_postcard_front_portrait(row: dict, branding: dict, preview_shot: Image.Image | None) -> Image.Image:
    width, height = PORTRAIT_SIZE
    base_url = branding.get("github_pages_base", "https://YOUR_GITHUB_USERNAME.github.io/oc-web-previews")
    connect_url = f"{base_url.rstrip('/')}/landing/connect.html?biz={row['slug']}"
    accent, accent_dark = parse_preview_colors(row["slug"])

    img = Image.new("RGB", (width, height), "#ffffff")
    draw = ImageDraw.Draw(img)

    content_width = width - 2 * MARGIN
    logo = load_brand_logo(branding, max_width=240)
    if logo:
        paste_logo(img, logo, width - MARGIN - logo.width, TOP_WHITESPACE - logo.height - 8)
    else:
        brand_font = load_font(22, bold=True)
        brand_name = branding["brand_name"]
        brand_width = draw.textlength(brand_name, font=brand_font)
        draw.text((width - MARGIN - brand_width, TOP_WHITESPACE - 36), brand_name, fill=accent_dark, font=brand_font)

    y = TOP_WHITESPACE
    name_font = fit_font_size(draw, row["name"], content_width, start_size=82, min_size=48, bold=True)
    name_lines = wrap_text(draw, row["name"], name_font, content_width)
    line_height = int(name_font.size * 1.05) if hasattr(name_font, "size") else 72
    for line in name_lines:
        draw.text((MARGIN, y), line, fill=accent_dark, font=name_font)
        y += line_height
    y += 10

    headline_font = load_font(34, bold=True)
    headline = branding.get("postcard_headline") or HEADLINE
    for line in wrap_text(draw, headline, headline_font, content_width):
        draw.text((MARGIN, y), line, fill="#334155", font=headline_font)
        y += 44
    y += 14

    frame_width = content_width
    footer_top = height - FOOTER_HEIGHT
    to_rect = to_address_rect(width, height, footer_height=FOOTER_HEIGHT)
    max_preview_bottom = to_rect[1] - 16
    available_preview_h = max_preview_bottom - y

    if preview_shot is None:
        preview_shot = Image.new("RGB", (1280, 700), "#e2e8f0")
        placeholder_draw = ImageDraw.Draw(preview_shot)
        placeholder_draw.text((80, 300), f"{row['name']} — website preview", fill="#64748b", font=load_font(48, bold=True))

    preview_frame = build_browser_preview(
        preview_shot, row["name"], content_width, accent, max_frame_height=available_preview_h
    )
    preview_x = MARGIN + (content_width - preview_frame.width) // 2
    img.paste(preview_frame, (preview_x, y))

    qr_zone_top = y + preview_frame.height + 16
    qr_zone_height = footer_top - qr_zone_top - 12
    label = branding.get("postcard_qr_label") or QR_LABEL
    to_rect = to_address_rect(width, height, footer_height=FOOTER_HEIGHT)
    draw_to_address_placeholder(draw, to_rect)
    qr_zone_width = to_rect[0] - MARGIN - 16
    draw_prominent_qr_block(
        img,
        connect_url,
        label,
        accent,
        accent_dark,
        qr_zone_top,
        qr_zone_height,
        zone_left=MARGIN,
        zone_width=max(qr_zone_width, 320),
        qr_size=240,
    )
    draw_contact_footer(img, branding, accent, accent_dark, right_limit=to_rect[0] - 12)

    return img


def to_address_rect(width: int, height: int, *, footer_height: int = 0) -> tuple[int, int, int, int]:
    """Bottom-right To-address block within the postcard addressing zone."""
    zone_right = width - USPS_ADDRESS_SIDE
    zone_left = zone_right - USPS_ADDRESS_BOX_WIDTH
    zone_bottom = height - USPS_ADDRESS_BOTTOM
    # Keep the block above the USPS barcode clear strip (5/8" from bottom edge).
    zone_bottom = min(zone_bottom, height - USPS_BOTTOM_CLEAR - 6)
    zone_top = zone_bottom - USPS_ADDRESS_BOX_HEIGHT
    zone_top = max(USPS_ADDRESS_SIDE, zone_top)
    return zone_left, zone_top, zone_right, zone_bottom


def draw_to_address_placeholder(draw: ImageDraw.ImageDraw, rect: tuple[int, int, int, int]) -> None:
    """Reserved mailing-address area — blank white space with light guide lines for handwriting."""
    x0, y0, x1, y1 = rect
    draw.rounded_rectangle((x0, y0, x1, y1), radius=8, fill="#ffffff", outline="#94a3b8", width=2)

    label_font = load_font(17, bold=True)
    draw.text((x0 + 14, y0 + 10), "To:", fill="#64748b", font=label_font)

    inner_left = x0 + 14
    inner_right = x1 - 14
    line_y = y0 + 38
    line_step = max(26, (y1 - y0 - 52) // TO_ADDRESS_LINES)
    for idx in range(TO_ADDRESS_LINES):
        line_end = inner_right if idx < TO_ADDRESS_LINES - 1 else inner_left + int((inner_right - inner_left) * 0.68)
        draw.line((inner_left, line_y, line_end, line_y), fill="#e2e8f0", width=2)
        line_y += line_step


def draw_stamp_placeholder(draw: ImageDraw.ImageDraw, x: int, y: int) -> None:
    box = (x, y, x + STAMP_WIDTH, y + STAMP_HEIGHT)
    draw.rounded_rectangle(box, radius=10, fill="#ffffff", outline="#94a3b8", width=2)

    label_font = load_font(20, bold=True)
    label = "PLACE STAMP"
    label_w = draw.textlength(label, font=label_font)
    draw.text((x + (STAMP_WIDTH - label_w) / 2, y + STAMP_HEIGHT / 2 - 28), label, fill="#64748b", font=label_font)
    here = "HERE"
    here_w = draw.textlength(here, font=label_font)
    draw.text((x + (STAMP_WIDTH - here_w) / 2, y + STAMP_HEIGHT / 2 + 2), here, fill="#64748b", font=label_font)


def draw_postcard_front_landscape(row: dict, branding: dict, preview_shot: Image.Image | None) -> Image.Image:
    width, height = LANDSCAPE_SIZE
    base_url = branding.get("github_pages_base", "https://YOUR_GITHUB_USERNAME.github.io/oc-web-previews")
    connect_url = f"{base_url.rstrip('/')}/landing/connect.html?biz={row['slug']}"
    accent, accent_dark = parse_preview_colors(row["slug"])

    img = Image.new("RGB", (width, height), "#ffffff")
    draw = ImageDraw.Draw(img)

    content_width = width - 2 * MARGIN
    footer_top = height - LANDSCAPE_FOOTER_HEIGHT
    to_rect = to_address_rect(width, height, footer_height=LANDSCAPE_FOOTER_HEIGHT)
    stamp_x = width - MARGIN - STAMP_WIDTH
    stamp_y = 40

    draw_stamp_placeholder(draw, stamp_x, stamp_y)

    text_width = stamp_x - MARGIN - 24
    y = LANDSCAPE_TOP_WHITESPACE
    name_font = fit_font_size(draw, row["name"], text_width, start_size=82, min_size=48, bold=True)
    name_lines = wrap_text(draw, row["name"], name_font, text_width)
    line_height = int(name_font.size * 1.02) if hasattr(name_font, "size") else 54
    for line in name_lines:
        draw.text((MARGIN, y), line, fill=accent_dark, font=name_font)
        y += line_height
    y += 6

    headline_font = load_font(42, bold=True)
    headline = branding.get("postcard_headline") or HEADLINE
    for line in wrap_text(draw, headline, headline_font, text_width):
        draw.text((MARGIN, y), line, fill="#334155", font=headline_font)
        y += 50
    y += 10

    stamp_bottom = stamp_y + STAMP_HEIGHT
    preview_y = max(y - 8, stamp_bottom - 58)
    max_preview_bottom = to_rect[1] - 12
    available_preview_h = max_preview_bottom - preview_y
    max_preview_width = to_rect[0] - MARGIN - 20
    max_preview_height = int(available_preview_h * 0.98)

    if preview_shot is None:
        preview_shot = Image.new("RGB", (1900, 520), "#e2e8f0")
        placeholder_draw = ImageDraw.Draw(preview_shot)
        placeholder_draw.text((60, 220), f"{row['name']} — website preview", fill="#64748b", font=load_font(40, bold=True))

    preview_frame = build_browser_preview(
        preview_shot,
        row["name"],
        max_preview_width,
        accent,
        max_frame_height=max_preview_height,
    )
    preview_x = MARGIN
    img.paste(preview_frame, (preview_x, preview_y))

    draw_to_address_placeholder(draw, to_rect)

    qr_zone_top = preview_y + preview_frame.height + 10
    qr_zone_bottom = to_rect[1] - 8
    label = branding.get("postcard_qr_label") or QR_LABEL
    draw_prominent_qr_block(
        img,
        connect_url,
        label,
        accent,
        accent_dark,
        qr_zone_top,
        max(qr_zone_bottom - qr_zone_top, 180),
        horizontal=True,
        zone_left=MARGIN,
        zone_width=max(to_rect[0] - MARGIN - 20, 360),
        qr_size=200,
    )
    draw_contact_footer(
        img,
        branding,
        accent,
        accent_dark,
        footer_height=LANDSCAPE_FOOTER_HEIGHT,
        compact=True,
        right_limit=to_rect[0] - 12,
    )

    return img


def draw_postcard_front(row: dict, branding: dict, preview_shot: Image.Image | None, *, landscape: bool = False) -> Image.Image:
    if landscape:
        return draw_postcard_front_landscape(row, branding, preview_shot)
    return draw_postcard_front_portrait(row, branding, preview_shot)


def draw_postcard_back(row: dict, branding: dict, *, landscape: bool = False) -> Image.Image:
    accent, accent_dark = parse_preview_colors(row["slug"])
    width, height = LANDSCAPE_SIZE if landscape else PORTRAIT_SIZE

    img = Image.new("RGB", (width, height), "#f8fafc")
    draw = ImageDraw.Draw(img)

    draw.rectangle((0, 0, width, 18), fill=accent)

    title_font = load_font(52, bold=True)
    body_font = load_font(32)
    small_font = load_font(24)

    y = 120
    logo = load_brand_logo(branding, max_width=520)
    if logo:
        paste_logo(img, logo, int((width - logo.width) / 2), y)
        y += logo.height + 40
    else:
        brand = branding["brand_name"]
        brand_width = draw.textlength(brand, font=title_font)
        draw.text(((width - brand_width) / 2, y), brand, fill=accent_dark, font=title_font)
        y += 80

    tagline = branding.get("tagline", "")
    if tagline:
        tag_width = draw.textlength(tagline, font=body_font)
        draw.text(((width - tag_width) / 2, y), tagline, fill="#475569", font=body_font)
        y += 70

    draw.line((MARGIN + 80, y, width - MARGIN - 80, y), fill="#dbe3ee", width=2)
    y += 60

    contact_lines = [
        branding.get("phone_display", ""),
        branding.get("email_display", ""),
        branding.get("calendly_url", ""),
    ]
    for line in contact_lines:
        if not line or line.startswith("https://calendly.com/REPLACE"):
            continue
        line_width = draw.textlength(line, font=body_font)
        draw.text(((width - line_width) / 2, y), line, fill="#0f172a", font=body_font)
        y += 52

    y += 30
    draw.text((MARGIN, y), "Return address:", fill="#64748b", font=small_font)
    y += 38
    addr = branding.get("return_address", {})
    for key in ("line1", "line2"):
        if addr.get(key):
            draw.text((MARGIN, y), addr[key], fill="#0f172a", font=body_font)
            y += 44

    disclaimer = "Preview site only — not affiliated with your business until you hire us."
    disc_font = load_font(20)
    disc_lines = wrap_text(draw, disclaimer, disc_font, width - 2 * MARGIN)
    disc_y = height - 80 - len(disc_lines) * 28
    for line in disc_lines:
        line_width = draw.textlength(line, font=disc_font)
        draw.text(((width - line_width) / 2, disc_y), line, fill="#94a3b8", font=disc_font)
        disc_y += 28

    return img


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate postcard PNGs")
    parser.add_argument("--csv", default=str(ROOT / "data" / "pilot-10.csv"))
    parser.add_argument("--slug", help="Generate postcard for one slug only")
    parser.add_argument("--no-screenshot", action="store_true", help="Skip Playwright preview capture")
    parser.add_argument("--no-back", action="store_true", help="Skip back-of-card generation")
    parser.add_argument("--landscape", action="store_true", help="Generate 7x5 landscape layout")
    parser.add_argument(
        "--template",
        nargs="?",
        const="default",
        default=None,
        help="Use PDF template from config (default when configured in branding.json)",
    )
    parser.add_argument(
        "--legacy",
        action="store_true",
        help="Use programmatic layout instead of PDF template",
    )
    parser.add_argument(
        "--install-template",
        help="Copy PDF from this path into postcards/templates/ (one-time import from Downloads)",
    )
    parser.add_argument(
        "--from-previews",
        action="store_true",
        help="Generate template postcards for every slug under previews/ (uses CSV rows when available)",
    )
    args = parser.parse_args()

    if args.install_template:
        ensure_template_in_repo(Path(args.install_template))
        return

    branding = load_branding()
    use_template = not args.legacy
    template = load_template_config(branding, args.template if use_template else False) if use_template else None
    if use_template and template is None and args.template:
        raise SystemExit("No postcard template configured in config/branding.json")

    if template is not None:
        args.landscape = True
        args.no_back = True

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if not args.no_back:
        BACK_DIR.mkdir(parents=True, exist_ok=True)

    with Path(args.csv).open(newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))

    if args.from_previews:
        by_slug: dict[str, dict] = {}
        csv_paths = [Path(args.csv), ROOT / "data" / "trade-templates-demo.csv"]
        for csv_path in csv_paths:
            if not csv_path.exists():
                continue
            with csv_path.open(newline="", encoding="utf-8") as fh:
                for r in csv.DictReader(fh):
                    by_slug[r["slug"]] = r
        rows = []
        for slug in preview_slugs():
            if slug in by_slug:
                rows.append(by_slug[slug])
            else:
                rows.append({"slug": slug, "name": slug.replace("-", " ").title()})

    if args.slug:
        rows = [r for r in rows if r["slug"] == args.slug]

    pdf_path, template_config = template if template else (None, None)

    for row in rows:
        if template is not None:
            remove_legacy_postcard_variants(row["slug"])
        base_url = branding.get("github_pages_base", "https://YOUR_GITHUB_USERNAME.github.io/oc-web-previews")
        connect_url = f"{base_url.rstrip('/')}/landing/connect.html?biz={row['slug']}"

        QR_DIR.mkdir(parents=True, exist_ok=True)
        qr_only = qr_image(connect_url, 800)
        qr_path = QR_DIR / f"{row['slug']}.png"
        qr_only.save(qr_path, "PNG")
        print(f"Wrote {qr_path}")

        preview_shot = None
        if not args.no_screenshot:
            print(f"Capturing preview for {row['slug']}...")
            target_size = None
            if template_config:
                website_rect = template_config.get(
                    "website_rect_px",
                    template_config.get(
                        "preview_paste_rect_px",
                        template_config.get("preview_rect_px"),
                    ),
                )
                if website_rect:
                    x0, y0, x1, y1 = website_rect
                    target_size = (x1 - x0, y1 - y0)
            preview_shot = capture_site_preview(
                row["slug"],
                capture_width=target_size[0] if target_size else PREVIEW_CAPTURE_WIDTH,
                target_size=target_size,
            )

        suffix = "-landscape" if args.landscape else ""
        if template is not None:
            front = draw_postcard_from_template(row, branding, preview_shot, pdf_path, template_config)
        else:
            front = draw_postcard_front(row, branding, preview_shot, landscape=args.landscape)
        front_path = OUT_DIR / f"{row['slug']}{suffix}.png"
        front.save(front_path, "PNG", dpi=(300, 300))
        print(f"Wrote {front_path}")

        if not args.no_back:
            back = draw_postcard_back(row, branding, landscape=args.landscape)
            back_path = BACK_DIR / f"{row['slug']}{suffix}-back.png"
            back.save(back_path, "PNG", dpi=(300, 300))
            print(f"Wrote {back_path}")


if __name__ == "__main__":
    main()
