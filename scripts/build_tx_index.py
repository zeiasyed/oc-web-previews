"""Build tx-plumbers/index.html from a TX batch CSV."""

from __future__ import annotations

import argparse
import csv
import html
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CSV = ROOT / "data" / "tx-plumbers-50.csv"
OUT_PATH = ROOT / "tx-plumbers" / "index.html"


def build_index(csv_path: Path, out_path: Path) -> int:
    rows = list(csv.DictReader(csv_path.open(newline="", encoding="utf-8")))
    if not rows:
        raise SystemExit(f"No rows in {csv_path}")

    cards: list[str] = []
    for i, row in enumerate(rows, start=1):
        slug = row["slug"]
        name = html.escape(row["name"])
        city = html.escape(row.get("city") or "")
        phone = html.escape(row.get("phone") or "")
        cards.append(
            f"""      <article class="card">
        <div class="card-head">
          <span class="num">{i}</span>
          <div>
            <h2>{name}</h2>
            <p class="meta">{city}, TX · {phone}</p>
          </div>
        </div>
        <div class="links">
          <a class="site" href="../previews/{slug}/index.html">Demo site</a>
          <a class="funnel" href="../landing/connect.html?biz={slug}">Funnel</a>
          <a class="postcard" href="../postcards/png/{slug}-landscape.png">Postcard</a>
        </div>
      </article>"""
        )

    count = len(rows)
    page = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Texas Plumbers — Demo Sites ({count})</title>
  <style>
    * {{ box-sizing: border-box; }}
    body {{
      font-family: "Segoe UI", system-ui, sans-serif;
      margin: 0;
      background: #f0f6fb;
      color: #0f172a;
      line-height: 1.5;
    }}
    .wrap {{ max-width: 920px; margin: 0 auto; padding: 2rem 1.25rem 3rem; }}
    h1 {{ margin: 0 0 0.35rem; font-size: 1.85rem; }}
    .intro {{ color: #64748b; margin: 0 0 1.75rem; }}
    .intro a {{ color: #1a7ab8; }}
    .grid {{ display: grid; gap: 0.85rem; }}
    .card {{
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 1rem 1.15rem;
    }}
    .card-head {{ display: flex; gap: 0.85rem; align-items: start; margin-bottom: 0.75rem; }}
    .num {{
      flex-shrink: 0;
      width: 2rem;
      height: 2rem;
      border-radius: 999px;
      background: #e0f2fe;
      color: #0369a1;
      font-weight: 700;
      font-size: 0.85rem;
      display: grid;
      place-items: center;
    }}
    .card h2 {{ margin: 0; font-size: 1.05rem; }}
    .meta {{ margin: 0.15rem 0 0; color: #64748b; font-size: 0.9rem; }}
    .links {{ display: flex; flex-wrap: wrap; gap: 0.45rem; }}
    .links a {{
      display: inline-block;
      padding: 0.4rem 0.85rem;
      border-radius: 999px;
      text-decoration: none;
      font-weight: 600;
      font-size: 0.85rem;
    }}
    .site {{ background: #1a7ab8; color: white; }}
    .funnel {{ background: #059669; color: white; }}
    .postcard {{ background: #e2e8f0; color: #0f172a; }}
    .links a:hover {{ filter: brightness(1.06); }}
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Texas Plumber Batch</h1>
    <p class="intro">{count} demo sites with unique QR codes and postcards. Source: <code>{html.escape(csv_path.name)}</code> · <a href="../postcards/index.html">Postcard gallery</a></p>
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
    parser = argparse.ArgumentParser(description="Build TX plumber index page")
    parser.add_argument("--csv", default=str(DEFAULT_CSV))
    parser.add_argument("--out", default=str(OUT_PATH))
    args = parser.parse_args()
    count = build_index(Path(args.csv), Path(args.out))
    print(f"Wrote {Path(args.out).relative_to(ROOT)} ({count} businesses)")


if __name__ == "__main__":
    main()
