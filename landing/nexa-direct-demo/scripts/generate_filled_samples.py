"""Generate handwritten-style filled PDFs and seed Scanner Inbox."""

from __future__ import annotations

import hashlib
import html
import json
import random
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from shared.cdash_schemas import load_schema, parse_excel
from shared.constants import ALL_SUBJECTS, BLANK_PDF_PATH, FILLED_SAMPLES_PATH, FORMS, INBOX_PATH, SITE_NAME, STUDY_ID

OUT_HTML = ROOT / "demo_data" / "filled_html"
SCHEMA_DIR = ROOT / "demo_data" / "schemas"

STYLE_BY_SUBJECT = {"0101": "neat", "0102": "messy", "0103": "partial"}

# All styles read as real clinic handwriting — legible with effort, never typed.
HAND_STYLE = {
    "neat": {
        "font": "Caveat",
        "size": (1.12, 1.28),
        "rotate": (-2.5, 2.5),
        "spacing": (0.06, 0.18),
        "y_jitter": (-2, 3),
        "x_jitter": (-1, 2),
        "char_rot": (-2.8, 2.8),
        "ink": "#1a3352",
        "weight": 600,
        "blur": 0.18,
        "slant": "-2deg",
        "opacity": (0.88, 1.0),
    },
    "messy": {
        "font": "Reenie Beanie",
        "size": (1.18, 1.42),
        "rotate": (-5.5, 5.5),
        "spacing": (0.12, 0.34),
        "y_jitter": (-5, 6),
        "x_jitter": (-3, 4),
        "char_rot": (-7, 7),
        "ink": "#0c2340",
        "weight": 700,
        "blur": 0.42,
        "slant": "-8deg",
        "opacity": (0.72, 0.96),
    },
    "partial": {
        "font": "Homemade Apple",
        "size": (1.0, 1.22),
        "rotate": (-4, 4),
        "spacing": (0.08, 0.24),
        "y_jitter": (-4, 5),
        "x_jitter": (-2, 3),
        "char_rot": (-5, 5),
        "ink": "#2d3f55",
        "weight": 500,
        "blur": 0.32,
        "slant": "4deg",
        "opacity": (0.65, 0.92),
    },
}

PAGE_SKEW = {"neat": "-0.6deg", "messy": "-1.2deg", "partial": "0.9deg"}


def _rng(subject_id: str, field_name: str, salt: str = "") -> random.Random:
    key = f"{subject_id}:{field_name}:{salt}"
    h = hashlib.md5(key.encode()).hexdigest()
    return random.Random(int(h[:12], 16))


def _demo_values(subject_id: str) -> dict[str, str]:
    ext_dir = ROOT / "demo_data" / "simulated_extractions"
    out: dict[str, str] = {}
    for form_code in FORMS:
        p = ext_dir / f"{subject_id}_{form_code}.json"
        if not p.exists():
            continue
        data = json.loads(p.read_text(encoding="utf-8"))
        for name, meta in data.get("fields", {}).items():
            if isinstance(meta, dict):
                out[name] = str(meta.get("value") or "")
            else:
                out[name] = str(meta)
    return out


def _messy_digits(text: str, subject_id: str, field_name: str, intensity: float) -> str:
    """Deform numeric strings — tighter spacing, tilted digits."""
    if not re.search(r"\d", text):
        return html.escape(text)
    r = _rng(subject_id, field_name, "digits")
    out = []
    for ch in text:
        if ch.isdigit() and r.random() < intensity:
            rot = r.uniform(-12, 12)
            y = r.randint(-3, 4)
            out.append(
                f'<span class="digit" style="display:inline-block;transform:rotate({rot:.0f}deg) '
                f'translateY({y}px);margin:0 {r.randint(0,3)}px">{ch}</span>'
            )
        elif ch in "-./" and r.random() < intensity * 0.7:
            out.append(f'<span class="dash" style="opacity:{r.uniform(0.5,0.85):.2f}">{ch}</span>')
        else:
            out.append(html.escape(ch))
    return "".join(out)


def _handwrite_chars(text: str, subject_id: str, field_name: str, style_key: str) -> str:
    """Per-character jitter for rushed pen strokes."""
    if not text:
        return ""
    cfg = HAND_STYLE[style_key]
    parts: list[str] = []
    for i, ch in enumerate(text):
        if ch == " ":
            r = _rng(subject_id, field_name, f"s{i}")
            parts.append("&nbsp;" * r.randint(1, 3))
            continue
        cr = _rng(subject_id, field_name, f"c{i}")
        rot = cr.uniform(cfg["char_rot"][0], cfg["char_rot"][1])
        y = cr.randint(cfg["y_jitter"][0], cfg["y_jitter"][1])
        x = cr.randint(cfg["x_jitter"][0], cfg["x_jitter"][1])
        scale = cr.uniform(0.86, 1.14)
        op = cr.uniform(cfg["opacity"][0], cfg["opacity"][1])
        # Occasional faint / double-ink look
        if cr.random() < 0.08:
            op *= 0.55
        parts.append(
            f'<span class="glyph" style="display:inline-block;transform:rotate({rot:.1f}deg) '
            f'translate({x}px,{y}px) scale({scale:.2f});opacity:{op:.2f}">{html.escape(ch)}</span>'
        )
    return "".join(parts)


def _format_value(subject_id: str, field_name: str, value: str, style_key: str) -> str:
    if not value:
        if subject_id == "0103":
            r = _rng(subject_id, field_name, "blank")
            tilt = r.uniform(-15, 15)
            return f'<span class="blank-mark" style="transform:rotate({tilt:.0f}deg)">?</span>'
        return ""

    intensity = {"neat": 0.28, "messy": 0.55, "partial": 0.42}[style_key]

    if value in ("Y", "N", "F", "M"):
        r = _rng(subject_id, field_name, "tick")
        mark = "✓" if value in ("Y", "F") else "✗"
        if r.random() < 0.4:
            return (
                f'<span class="hw-check" style="font-size:1.35rem;transform:rotate({r.uniform(-18,18):.0f}deg)">'
                f"({mark})</span>"
            )
        return _handwrite_chars(value, subject_id, field_name, style_key)

    if re.fullmatch(r"[\d\-\./:]+", value):
        return f'<span class="hw-num">{_messy_digits(value, subject_id, field_name, intensity)}</span>'

    return _handwrite_chars(value, subject_id, field_name, style_key)


def _cell_style(subject_id: str, field_name: str, style_key: str) -> str:
    cfg = HAND_STYLE[style_key]
    r = _rng(subject_id, field_name, "cell")
    size = r.uniform(cfg["size"][0], cfg["size"][1])
    rot = r.uniform(cfg["rotate"][0], cfg["rotate"][1])
    spacing = r.uniform(cfg["spacing"][0], cfg["spacing"][1])
    blur = cfg["blur"] + r.uniform(0, 0.12)
    shadow = r.uniform(0.15, 0.35)
    return (
        f"font-family:'{cfg['font']}',cursive;"
        f"font-size:{size:.2f}rem;font-weight:{cfg['weight']};"
        f"color:{cfg['ink']};letter-spacing:{spacing:.2f}em;"
        f"transform:rotate({rot:.1f}deg) skewX({cfg['slant']});"
        f"filter:blur({blur:.2f}px);"
        f"text-shadow:0 0 {shadow:.2f}px rgba(12,35,64,0.35);"
    )


def _render_form(subject_id: str, form_code: str, values: dict[str, str]) -> str:
    schema = load_schema(form_code, SCHEMA_DIR)
    if not schema:
        meta = FORMS[form_code]
        schema = parse_excel(meta["excel"])
    style_key = STYLE_BY_SUBJECT.get(subject_id, "neat")
    title = schema.get("title", form_code)
    page_skew = PAGE_SKEW.get(style_key, "0deg")

    rows = []
    for f in schema.get("fields", [])[:18]:
        name = f.get("name", "")
        label = html.escape(f.get("label", name))
        raw = values.get(name, "")
        display = _format_value(subject_id, name, raw, style_key)
        cell_css = _cell_style(subject_id, name, style_key)
        rows.append(
            f'<tr><td class="lbl">{label}</td>'
            f'<td class="val"><div class="hw" style="{cell_css}">{display}</div></td></tr>'
        )

    subject_label = html.escape(subject_id)
    return f"""<!doctype html><html><head><meta charset="utf-8"/>
<link href="https://fonts.googleapis.com/css2?family=Caveat:wght@400;500;600;700&family=Homemade+Apple&family=Reenie+Beanie:wght@400;700&family=Patrick+Hand&display=swap" rel="stylesheet">
<style>
body {{
  font-family: Inter, sans-serif; margin: 22px 18px 32px; color: #0c2547;
  background: linear-gradient(180deg, #fdfcfa 0%, #f6f4ef 100%);
  transform: rotate({page_skew});
  transform-origin: top left;
}}
h1 {{ font-size: 1.05rem; margin-bottom: 4px; font-weight: 600; }}
.meta {{ font-size: 0.78rem; color: #64748b; margin-bottom: 14px; }}
table {{ width: 100%; border-collapse: collapse; }}
.lbl {{
  width: 42%; padding: 8px 10px; border: 1px solid #c9d4e0;
  background: #f3f6f9; font-size: 0.72rem; vertical-align: middle; line-height: 1.35;
}}
.val {{
  padding: 14px 14px 11px; border: 1px solid #c9d4e0; min-height: 38px;
  vertical-align: middle; background: #fffef9;
}}
.hw {{ display: inline-block; line-height: 1.05; max-width: 100%; word-break: break-word; }}
.hw-num {{ letter-spacing: 0.1em; word-spacing: 0.15em; }}
.glyph {{ transform-origin: 45% 88%; }}
.blank-mark {{ color: #64748b; font-family: Homemade Apple, cursive; font-size: 1.45rem; display:inline-block; }}
.dash {{ font-family: Caveat, cursive; }}
.hw-check {{ font-family: Caveat, cursive; color: #0c2340; }}
.banner {{
  background: linear-gradient(90deg,#071528,#0a9e8f); color:#fff;
  padding:10px 14px; border-radius:8px; margin-bottom:12px; font-size: 0.85rem;
}}
.paper-noise {{
  position: fixed; inset: 0; pointer-events: none; opacity: 0.055;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}}
.scan-line {{
  position: fixed; inset: 0; pointer-events: none; opacity: 0.03;
  background: repeating-linear-gradient(0deg, transparent, transparent 3px, #071528 3px, #071528 4px);
}}
</style></head><body>
<div class="paper-noise"></div>
<div class="scan-line"></div>
<div class="banner">Study {html.escape(STUDY_ID)} — {html.escape(form_code)} — Subject {subject_label}</div>
<h1>{html.escape(title)}</h1>
<p class="meta">Screening visit · handwritten source form · {html.escape(SITE_NAME)} · Study {html.escape(STUDY_ID)}</p>
<table>{''.join(rows)}</table>
</body></html>"""


def _html_to_pdf(html_path: Path, pdf_path: Path) -> bool:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return False
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto(html_path.as_uri(), wait_until="networkidle")
        page.wait_for_timeout(1200)
        page.pdf(
            path=str(pdf_path),
            format="A4",
            print_background=True,
            margin={"top": "12mm", "bottom": "12mm", "left": "12mm", "right": "12mm"},
        )
        browser.close()
    return True


def _copy_blank_as_fallback(subject_id: str, form_code: str, pdf_path: Path) -> None:
    meta = FORMS[form_code]
    blank = BLANK_PDF_PATH / f"{meta['form_id']}.pdf"
    if blank.exists():
        shutil.copy2(blank, pdf_path)
    else:
        pdf_path.write_bytes(b"")


def main() -> None:
    OUT_HTML.mkdir(parents=True, exist_ok=True)
    FILLED_SAMPLES_PATH.mkdir(parents=True, exist_ok=True)
    INBOX_PATH.mkdir(parents=True, exist_ok=True)

    for old in INBOX_PATH.glob("*.pdf"):
        old.unlink()

    generated = 0
    for subject_id in ALL_SUBJECTS:
        values = _demo_values(subject_id)
        for form_code, meta in FORMS.items():
            file_code = meta["file_code"]
            filename = f"{subject_id}_{file_code}.pdf"
            html_path = OUT_HTML / f"{subject_id}_{form_code}.html"
            pdf_path = FILLED_SAMPLES_PATH / filename
            inbox_path = INBOX_PATH / filename

            html_path.write_text(_render_form(subject_id, form_code, values), encoding="utf-8")
            if not _html_to_pdf(html_path, pdf_path):
                _copy_blank_as_fallback(subject_id, form_code, pdf_path)
            shutil.copy2(pdf_path, inbox_path)
            generated += 1
            print(f"  {filename}")

    print(f"Generated {generated} PDFs -> {FILLED_SAMPLES_PATH}")
    print(f"Seeded {generated} PDFs -> {INBOX_PATH}")


if __name__ == "__main__":
    main()
