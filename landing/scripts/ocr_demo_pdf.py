"""Build OCR demonstration PDF — image + extracted text side by side."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

from PIL import Image
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image as RLImage,
    PageBreak,
    PageTemplate,
    Paragraph,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parent.parent
NEXASOURCE_LOGO = ROOT / "nexa-trials" / "assets" / "nexasource-mark.png"
PUBLISHED_PDF = ROOT / "ocr-demo" / "OCR-Demo-Readout.pdf"

ASSETS = Path(
    r"C:\Users\zeias\.cursor\projects\c-Users-zeias-Documents-Website-Development-oc-web-previews-landing\assets"
)
OUT = PUBLISHED_PDF
PANEL_LEFT_COL = 3.35 * inch
PANEL_RIGHT_COL = 3.55 * inch
# Inner readout max width — right column minus cell padding
READOUT_WIDTH = PANEL_RIGHT_COL - 0.34 * inch

IMAGES = [
    {
        "file": "c__Users_zeias_AppData_Roaming_Cursor_User_workspaceStorage_4e43d7c10ab9bfa2d5929e4a02150efc_images_image_3-b6d5a9d0-3528-4be1-987f-7f8c90494dab.png",
        "title": "Figure 1 — Lesion area calculations (handwritten)",
        "category": "Handwritten math / clinical notes",
    },
    {
        "file": "c__Users_zeias_AppData_Roaming_Cursor_User_workspaceStorage_4e43d7c10ab9bfa2d5929e4a02150efc_images_image_2-f5512e8b-815c-4aa7-bc62-a9ab7d410eb4.png",
        "title": "Figure 2 — Clinical findings table (handwritten)",
        "category": "Handwritten grid notes",
    },
    {
        "file": "c__Users_zeias_AppData_Roaming_Cursor_User_workspaceStorage_4e43d7c10ab9bfa2d5929e4a02150efc_images_image_4-5a7433e8-25b2-4883-9891-60be56a9cf63.png",
        "title": "Figure 3 — Vital signs form (printed + handwritten)",
        "category": "Mixed print / handwriting",
    },
    {
        "file": "c__Users_zeias_AppData_Roaming_Cursor_User_workspaceStorage_4e43d7c10ab9bfa2d5929e4a02150efc_images_image_5-70387b34-6132-488b-bf4e-5451977c4ee0.png",
        "title": "Figure 4 — Medication dosage form (printed + handwritten)",
        "category": "Checkbox form + cursive handwriting",
    },
]

# Structured layouts — grid/table readouts mirror source alignment
OCR_LAYOUTS = {
    "image_2": {
        "type": "grid",
        "rows": [
            ["Mild left basal\ncongestion", "non-\nsignificant"],
            ["Diastolic murmur", "non-signifi-\ncant"],
        ],
    },
    "image_4": {
        "type": "table",
        "headers": ["Vital Signs", "Result", "Unit"],
        "rows": [
            ["Systolic Blood Pressure", "118", "mmHg"],
            ["Diastolic Blood Pressure", "74", "mmHg"],
            ["Pulse", "92", "Beats/min (bpm)"],
            ["Respiratory rate", "19", "Breaths/m"],
            ["Axillary Temperature", "37", "°C"],
        ],
        "header_bg": colors.HexColor("#c4c4c4"),
    },
    "image_5": {
        "type": "form",
        "rows": [
            {"checked": False, "label": "Other:", "note": ""},
            {"checked": False, "label": "25 mg", "note": "45.4mg", "note_style": "hand"},
            {"checked": False, "label": "50 mg", "note": "Pheniramine maleate", "note_style": "cursive"},
            {"checked": True, "label": "Other:", "note": ""},
            {"checked": False, "label": "10 mg", "note": ""},
        ],
    },
}

# Plain-text readouts for non-tabular figures
VERIFIED = {
    "image_3": """Lesion #1 = 72 x 62
= 4464 mm²

Lesion #2 = 21 x 17
= 357

Sum of product of maximal
perpendicular diameter
= 4464 + 357
= 4821 mm²""",
}


def build_brand_header(styles) -> Table:
    brand_style = ParagraphStyle(
        "Brand",
        parent=styles["Normal"],
        fontSize=10.5,
        leading=14,
        textColor=colors.HexColor("#0B1F3A"),
    )
    logo_size = 0.48 * inch
    logo = RLImage(str(NEXASOURCE_LOGO), width=logo_size, height=logo_size)
    brand_text = Paragraph("Produced by the NexaSource&trade; data engine", brand_style)
    header = Table([[logo, brand_text]], colWidths=[0.55 * inch, 6.35 * inch])
    header.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    return header


def scale_col_widths(widths, total_target: float):
    current = sum(widths)
    if current <= total_target:
        return widths
    factor = total_target / current
    return [w * factor for w in widths]


def wrap_readout_block(block, styles) -> Table:
    """Keep OCR content inside the panel border on the right."""
    wrapper = Table([[block]], colWidths=[READOUT_WIDTH])
    wrapper.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return wrapper


def cell_paragraph(text: str, styles, *, font="Courier", size=10, leading=14, bold=False, align="left") -> Paragraph:
    font_map = {
        ("Times-Roman", False): "Times-Roman",
        ("Times-Roman", True): "Times-Bold",
        ("Courier", False): "Courier",
        ("Courier", True): "Courier-Bold",
        ("Helvetica", False): "Helvetica",
        ("Helvetica", True): "Helvetica-Bold",
    }
    face = font_map.get((font, bold), font)
    escaped = str(text).replace("&", "&amp;").replace("<", "&lt;").replace("\n", "<br/>")
    style = ParagraphStyle(
        f"Cell_{face}_{size}",
        parent=styles["Normal"],
        fontName=face,
        fontSize=size,
        leading=leading,
        alignment={"left": 0, "center": 1, "right": 2}.get(align, 0),
        textColor=colors.HexColor("#111827"),
    )
    return Paragraph(escaped, style)


def build_grid_readout(layout: dict, styles) -> Table:
    rows = layout["rows"]
    data = [[cell_paragraph(cell, styles, font="Courier", size=10) for cell in row] for row in rows]
    half = READOUT_WIDTH / 2
    col_w = half
    row_h = 0.95 * inch
    tbl = Table(data, colWidths=[col_w, col_w], rowHeights=[row_h] * len(rows))
    tbl.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 1, colors.HexColor("#374151")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 12),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#fafafa")),
            ]
        )
    )
    return tbl


def build_table_readout(layout: dict, styles) -> Table:
    headers = layout["headers"]
    header_bg = layout.get("header_bg", colors.HexColor("#c4c4c4"))
    data = [
        [
            cell_paragraph(h, styles, font="Times-Roman", size=10, bold=True, align="left")
            for h in headers
        ]
    ]
    for row in layout["rows"]:
        data.append(
            [
                cell_paragraph(row[0], styles, font="Times-Roman", size=9.5),
                cell_paragraph(row[1], styles, font="Courier", size=11, bold=True, align="center"),
                cell_paragraph(row[2], styles, font="Times-Roman", size=9.5),
            ]
        )
    # Match source proportions: wide label col, narrow result, unit col
    col_w = scale_col_widths([1.95 * inch, 0.62 * inch, 1.08 * inch], READOUT_WIDTH)
    row_h = [0.30 * inch] + [0.34 * inch] * len(layout["rows"])
    tbl = Table(data, colWidths=col_w, rowHeights=row_h, repeatRows=1)
    tbl.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 1, colors.black),
                ("BOX", (0, 0), (-1, -1), 1, colors.black),
                ("BACKGROUND", (0, 0), (-1, 0), header_bg),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ALIGN", (0, 0), (-1, 0), "LEFT"),
                ("ALIGN", (1, 1), (1, -1), "CENTER"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("BACKGROUND", (0, 1), (-1, -1), colors.white),
            ]
        )
    )
    return tbl


def note_paragraph(text: str, styles, note_style: str = "hand") -> Paragraph:
    if note_style == "cursive":
        face, size, leading = "Times-Italic", 11, 13
    elif note_style == "hand":
        face, size, leading = "Courier-Bold", 10, 12
    else:
        face, size, leading = "Helvetica", 9.5, 11
    escaped = str(text or "").replace("&", "&amp;").replace("<", "&lt;")
    if note_style == "cursive" and escaped:
        escaped = f"<nobr>{escaped}</nobr>"
    style = ParagraphStyle(
        f"Note_{face}_{size}",
        parent=styles["Normal"],
        fontName=face,
        fontSize=size,
        leading=leading,
        textColor=colors.HexColor("#111827"),
    )
    return Paragraph(escaped, style)


def make_form_checkbox(checked: bool, styles) -> Table:
    """Outline checkbox via nested table — reliable inside parent table cells."""
    box = 11
    if checked:
        inner = Paragraph(
            "&#10003;",
            ParagraphStyle(
                "FormCheckMark",
                parent=styles["Normal"],
                fontName="Helvetica-Bold",
                fontSize=9,
                leading=9,
                alignment=1,
                textColor=colors.black,
            ),
        )
    else:
        inner = Paragraph(
            " ",
            ParagraphStyle(
                "FormCheckEmpty",
                parent=styles["Normal"],
                fontSize=1,
                leading=8,
                alignment=1,
            ),
        )
    cb = Table([[inner]], colWidths=[box], rowHeights=[box])
    cb.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.75, colors.black),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ("BACKGROUND", (0, 0), (-1, -1), colors.white),
            ]
        )
    )
    holder = Table([[cb]], colWidths=[0.22 * inch])
    holder.setStyle(
        TableStyle(
            [
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return holder


def build_form_readout(layout: dict, styles) -> Table:
    rows = layout["rows"]
    data = []
    note_pad_overrides = []
    for r_idx, row in enumerate(rows):
        checkbox = make_form_checkbox(bool(row.get("checked")), styles)
        data.append(
            [
                checkbox,
                cell_paragraph(row.get("label", ""), styles, font="Helvetica", size=10),
                note_paragraph(row.get("note", ""), styles, row.get("note_style", "hand")),
            ]
        )
        indent = row.get("note_indent_pt")
        if indent:
            note_pad_overrides.append((r_idx, indent))

    col_w = scale_col_widths([0.24 * inch, 0.78 * inch, 2.43 * inch], READOUT_WIDTH)
    tbl = Table(data, colWidths=col_w)
    style_cmds = [
        ("BOX", (0, 0), (-1, -1), 1, colors.black),
        ("LINEBELOW", (0, 0), (-1, -2), 0.75, colors.black),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("ALIGN", (1, 0), (1, -1), "LEFT"),
        ("ALIGN", (2, 0), (2, -1), "LEFT"),
        ("LEFTPADDING", (0, 0), (0, -1), 4),
        ("LEFTPADDING", (1, 0), (1, -1), 6),
        ("LEFTPADDING", (2, 0), (2, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
    ]
    for r_idx, indent in note_pad_overrides:
        style_cmds.append(("LEFTPADDING", (2, r_idx), (2, r_idx), 8 + indent))
    tbl.setStyle(TableStyle(style_cmds))
    return tbl


def build_text_readout(text: str, styles) -> Paragraph:
    ocr_text = text or "(no text detected)"
    return Paragraph(
        "<font face='Courier' size='8.5'>" + ocr_text.replace("&", "&amp;").replace("<", "&lt;").replace("\n", "<br/>") + "</font>",
        ParagraphStyle("Pre", parent=styles["Normal"], backColor=colors.HexColor("#f8fafc"), borderPadding=10, leading=12),
    )


def build_ocr_readout(entry: dict, styles):
    layout = entry.get("layout")
    if layout and layout.get("type") == "grid":
        return build_grid_readout(layout, styles)
    if layout and layout.get("type") == "table":
        return build_table_readout(layout, styles)
    if layout and layout.get("type") == "form":
        return build_form_readout(layout, styles)
    return build_text_readout(entry.get("verified") or "", styles)


def scaled_image(path: Path, max_w: float, max_h: float) -> RLImage:
    with Image.open(path) as im:
        w, h = im.size
    ratio = min(max_w / w, max_h / h)
    return RLImage(str(path), width=w * ratio, height=h * ratio)


FOOTER_TEXT = "Nexa-Trials Confidential. Not for General Distribution"
FOOTER_COLOR = colors.HexColor("#334155")


def draw_page_footer(canvas, doc) -> None:
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(FOOTER_COLOR)
    footer_y = 0.40 * inch
    canvas.drawCentredString(letter[0] / 2, footer_y, FOOTER_TEXT)
    canvas.drawRightString(letter[0] - doc.rightMargin, footer_y, str(canvas.getPageNumber()))
    canvas.restoreState()


class OCRDocTemplate(BaseDocTemplate):
    def __init__(self, filename: str, **kwargs):
        super().__init__(filename, **kwargs)
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="main")
        template = PageTemplate(id="main", frames=[frame], onPage=draw_page_footer)
        self.addPageTemplates([template])


def build_pdf(entries: list[dict]) -> None:
    PUBLISHED_PDF.parent.mkdir(parents=True, exist_ok=True)
    doc = OCRDocTemplate(
        str(PUBLISHED_PDF),
        pagesize=letter,
        leftMargin=0.55 * inch,
        rightMargin=0.55 * inch,
        topMargin=0.5 * inch,
        bottomMargin=0.65 * inch,
        title="OCR Demonstration Readout",
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "DocTitle",
        parent=styles["Title"],
        fontSize=18,
        spaceAfter=6,
        textColor=colors.HexColor("#0f172a"),
    )
    subtitle = ParagraphStyle(
        "Sub",
        parent=styles["Normal"],
        fontSize=10,
        textColor=colors.HexColor("#475569"),
        spaceAfter=14,
    )
    fig_title = ParagraphStyle(
        "FigTitle",
        parent=styles["Heading2"],
        fontSize=12,
        spaceBefore=4,
        spaceAfter=4,
        textColor=colors.HexColor("#1e293b"),
    )
    label = ParagraphStyle(
        "Label",
        parent=styles["Normal"],
        fontSize=9,
        textColor=colors.HexColor("#64748b"),
        spaceAfter=4,
    )
    ocr_style = ParagraphStyle(
        "OCR",
        parent=styles["Code"],
        fontName="Courier",
        fontSize=8.5,
        leading=11,
        backColor=colors.HexColor("#f8fafc"),
        borderColor=colors.HexColor("#e2e8f0"),
        borderWidth=1,
        borderPadding=8,
        spaceAfter=6,
    )

    story = [
        build_brand_header(styles),
        Paragraph("OCR Demonstration Readout", title_style),
        Paragraph(
            f"Generated {datetime.now().strftime('%B %d, %Y at %I:%M %p')} — "
            "each panel shows the source image alongside extracted text, "
            "verified for accuracy on handwritten and mixed print/handwriting samples.",
            subtitle,
        ),
    ]

    for i, entry in enumerate(entries):
        if i:
            story.append(PageBreak())
        story.append(Paragraph(entry["title"], fig_title))
        story.append(Paragraph(f"Type: {entry['category']}", label))

        img = scaled_image(entry["path"], 3.15 * inch, 3.8 * inch)
        readout_cell = wrap_readout_block(build_ocr_readout(entry, styles), styles)

        panel = Table(
            [
                [Paragraph("<b>Source image</b>", label), Paragraph("<b>OCR readout</b>", label)],
                [img, readout_cell],
            ],
            colWidths=[PANEL_LEFT_COL, PANEL_RIGHT_COL],
            hAlign="LEFT",
            rowHeights=[None, None],
        )
        panel.setStyle(
            TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("BOX", (0, 1), (-1, 1), 0.75, colors.HexColor("#cbd5e1")),
                    ("INNERGRID", (0, 1), (-1, 1), 0.5, colors.HexColor("#e2e8f0")),
                    ("BACKGROUND", (0, 1), (-1, 1), colors.white),
                    ("LEFTPADDING", (0, 0), (-1, -1), 8),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                    ("TOPPADDING", (0, 1), (-1, 1), 10),
                    ("BOTTOMPADDING", (0, 1), (-1, 1), 10),
                ]
            )
        )
        story.append(panel)

    doc.build(story)
    print(f"Wrote {PUBLISHED_PDF}")


def main() -> None:
    if not NEXASOURCE_LOGO.exists():
        raise FileNotFoundError(f"Logo not found: {NEXASOURCE_LOGO}")
    entries = []
    for spec in IMAGES:
        path = ASSETS / spec["file"]
        if not path.exists():
            raise FileNotFoundError(path)
        print(f"Building: {spec['title']}")
        vkey = next(t for t in ("image_3", "image_2", "image_4", "image_5") if t in spec["file"])
        layout = OCR_LAYOUTS.get(vkey)
        entries.append(
            {
                "title": spec["title"],
                "category": spec["category"],
                "path": path,
                "layout": layout,
                "verified": VERIFIED.get(vkey, ""),
            }
        )
    build_pdf(entries)


if __name__ == "__main__":
    main()
