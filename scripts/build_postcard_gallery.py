"""Build postcards/index.html from a batch CSV (or all landscape PNGs)."""

from __future__ import annotations

import argparse
import csv
import html
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CSV = ROOT / "data" / "tx-plumbers-200.csv"
OUT_PATH = ROOT / "postcards" / "index.html"


def build_gallery(rows: list[dict], out_path: Path) -> int:
    cards: list[str] = []
    for row in rows:
        slug = row["slug"]
        name = html.escape(row.get("name") or slug)
        city = html.escape(row.get("city") or "")
        png = f"png/{slug}-landscape.png"
        cards.append(
            f"""    <article class="card">
      <h2>{name}</h2>
      <p class="meta">{city}{", TX" if city else ""}</p>
      <a class="open" href="{png}" target="_blank" rel="noopener">Open postcard</a>
    </article>"""
        )

    count = len(rows)
    page = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Postcards ({count})</title>
  <style>
    * {{ box-sizing: border-box; }}
    body {{
      font-family: "Segoe UI", system-ui, sans-serif;
      margin: 0;
      background: #f8fafc;
      color: #0f172a;
      line-height: 1.5;
    }}
    .wrap {{ max-width: 920px; margin: 0 auto; padding: 2rem 1.25rem 3rem; }}
    h1 {{ margin: 0 0 0.35rem; font-size: 1.85rem; }}
    .intro {{ color: #64748b; margin: 0 0 1.75rem; }}
    .intro a {{ color: #1a7ab8; }}
    .grid {{ display: grid; gap: 0.75rem; }}
    .card {{
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 0.85rem 1rem;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem 1rem;
    }}
    .card h2 {{ margin: 0; font-size: 1rem; flex: 1 1 12rem; }}
    .meta {{ margin: 0; color: #64748b; font-size: 0.85rem; flex: 0 0 auto; }}
    .open {{
      display: inline-block;
      padding: 0.4rem 0.85rem;
      border-radius: 999px;
      background: #1e6f9f;
      color: white;
      text-decoration: none;
      font-weight: 600;
      font-size: 0.85rem;
    }}
    .open:hover {{ filter: brightness(1.08); }}
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Postcard Gallery</h1>
    <p class="intro">{count} print-ready postcards @ 300 DPI. Full batch hub: <a href="../tx-plumbers/">Texas plumbers index</a> (demo site + funnel + postcard per row).</p>
    <div class="grid">
{chr(10).join(cards)}
    </div>
  </div>
</body>
</html>
"""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(page, encoding="utf-8")
    return count


def main() -> None:
    parser = argparse.ArgumentParser(description="Build postcard gallery index")
    parser.add_argument("--csv", default=str(DEFAULT_CSV))
    parser.add_argument("--out", default=str(OUT_PATH))
    args = parser.parse_args()

    csv_path = Path(args.csv)
    rows = list(csv.DictReader(csv_path.open(newline="", encoding="utf-8")))
    if not rows:
        raise SystemExit(f"No rows in {csv_path}")

    out_path = Path(args.out)
    count = build_gallery(rows, out_path)
    print(f"Wrote {out_path.resolve().relative_to(ROOT.resolve())} ({count} postcards)")


if __name__ == "__main__":
    main()
