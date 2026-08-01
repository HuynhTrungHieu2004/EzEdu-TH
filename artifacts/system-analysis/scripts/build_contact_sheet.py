#!/usr/bin/env python3
"""Create a compact visual-QA sheet for all rendered DOCX pages."""

from pathlib import Path
import re
import sys

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
RENDER_DIR = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / "qa" / "docx-render"
OUTPUT = RENDER_DIR / "contact-sheet.png"


def page_number(path: Path) -> int:
    match = re.search(r"page-(\d+)\.png$", path.name)
    return int(match.group(1)) if match else 0


pages = sorted(RENDER_DIR.glob("page-*.png"), key=page_number)
cols = 5
cell_w, cell_h = 290, 360
rows = (len(pages) + cols - 1) // cols
sheet = Image.new("RGB", (cols * cell_w, rows * cell_h), "#DCE3EA")
draw = ImageDraw.Draw(sheet)
font = ImageFont.load_default()

for index, page_path in enumerate(pages):
    image = Image.open(page_path).convert("RGB")
    image.thumbnail((cell_w - 20, cell_h - 38), Image.Resampling.LANCZOS)
    col = index % cols
    row = index // cols
    x = col * cell_w + (cell_w - image.width) // 2
    y = row * cell_h + 27
    draw.rectangle(
        (col * cell_w + 6, row * cell_h + 6, (col + 1) * cell_w - 6, (row + 1) * cell_h - 6),
        fill="white",
        outline="#9AAABE",
        width=2,
    )
    draw.text((col * cell_w + 14, row * cell_h + 10), f"Trang {page_number(page_path)}", fill="#163B65", font=font)
    sheet.paste(image, (x, y))

sheet.save(OUTPUT, optimize=True)
print(f"Wrote {OUTPUT} with {len(pages)} pages")
