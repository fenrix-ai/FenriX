#!/usr/bin/env python3
from __future__ import annotations

import csv
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageOps


CANVAS_SIZE = 144
PANEL_MARGIN = 10
PORTRAIT_SIZE = 106
PORTRAIT_PIXEL_SIZE = 28

PALETTE = {
    "frame": "#8a5a3a",
    "outline": "#2a1a10",
    "paper": "#f6efdf",
    "panel": "#eed9b8",
    "panel_shadow": "#d6b98a",
    "accent": "#842a3a",
    "label": "#6f8b71",
}


def slugify(value: str) -> str:
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def load_reference(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            normalized = (row.get("normalized_name") or "").strip()
            expected = (row.get("expected_filename") or "").strip()
            if normalized and expected:
                out[normalized] = expected
    return out


def make_checkered_background(size: int) -> Image.Image:
    image = Image.new("RGBA", (size, size), PALETTE["paper"])
    draw = ImageDraw.Draw(image)
    tile = 12
    for y in range(0, size, tile):
        for x in range(0, size, tile):
            color = "#f2e6d0" if ((x // tile) + (y // tile)) % 2 == 0 else "#efe2cb"
            draw.rectangle((x, y, x + tile - 1, y + tile - 1), fill=color)
    return image


def build_portrait(source: Image.Image) -> Image.Image:
    width, height = source.size
    crop_box = (
        int(width * 0.22),
        int(height * 0.10),
        int(width * 0.78),
        int(height * 0.74),
    )
    portrait = source.crop(crop_box).convert("RGB")
    portrait = ImageOps.autocontrast(portrait)
    portrait = ImageEnhance.Brightness(portrait).enhance(1.18)
    portrait = ImageEnhance.Contrast(portrait).enhance(1.10)
    portrait = ImageEnhance.Color(portrait).enhance(1.05)
    portrait = portrait.convert("RGBA")
    portrait = ImageOps.fit(
        portrait,
        (PORTRAIT_PIXEL_SIZE, PORTRAIT_PIXEL_SIZE),
        method=Image.Resampling.LANCZOS,
        centering=(0.54, 0.30),
    )
    portrait = portrait.quantize(colors=24, method=Image.Quantize.FASTOCTREE)
    portrait = portrait.convert("RGBA").resize(
        (PORTRAIT_SIZE, PORTRAIT_SIZE),
        resample=Image.Resampling.NEAREST,
    )
    return portrait


def add_frame(portrait: Image.Image) -> Image.Image:
    canvas = make_checkered_background(CANVAS_SIZE)
    draw = ImageDraw.Draw(canvas)

    outer = (
        PANEL_MARGIN,
        PANEL_MARGIN,
        CANVAS_SIZE - PANEL_MARGIN - 1,
        CANVAS_SIZE - PANEL_MARGIN - 1,
    )
    inner = (
        PANEL_MARGIN + 3,
        PANEL_MARGIN + 3,
        CANVAS_SIZE - PANEL_MARGIN - 4,
        CANVAS_SIZE - PANEL_MARGIN - 4,
    )
    portrait_box = (
        PANEL_MARGIN + 15,
        PANEL_MARGIN + 13,
        PANEL_MARGIN + 15 + PORTRAIT_SIZE,
        PANEL_MARGIN + 13 + PORTRAIT_SIZE,
    )

    draw.rectangle(outer, fill=PALETTE["frame"], outline=PALETTE["outline"], width=1)
    draw.rectangle(inner, fill=PALETTE["panel"], outline="#c38c60", width=1)
    draw.rectangle(
        (outer[0] + 8, outer[1] + 8, outer[0] + 30, outer[1] + 12),
        fill=PALETTE["accent"],
    )
    draw.rectangle(
        (outer[0] + 8, outer[1] + 14, outer[0] + 24, outer[1] + 16),
        fill=PALETTE["label"],
    )

    shadow_box = (
        portrait_box[0] + 3,
        portrait_box[1] + 4,
        portrait_box[2] + 3,
        portrait_box[3] + 4,
    )
    draw.rectangle(shadow_box, fill=PALETTE["panel_shadow"])
    draw.rectangle(
        (portrait_box[0] - 2, portrait_box[1] - 2, portrait_box[2] + 1, portrait_box[3] + 1),
        fill=PALETTE["paper"],
        outline=PALETTE["frame"],
        width=1,
    )
    canvas.alpha_composite(portrait, dest=(portrait_box[0], portrait_box[1]))
    return canvas


def generate_avatar(source_path: Path, output_path: Path) -> None:
    with Image.open(source_path) as source:
        source = ImageOps.exif_transpose(source)
        portrait = build_portrait(source)
        framed = add_frame(portrait)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        framed.save(output_path, format="PNG")


def main() -> int:
    if len(sys.argv) != 4:
        print(
            "Usage: generate-bakery-style-avatars.py <raw-headshots-dir> <avatar-upload-reference.csv> <output-dir>",
            file=sys.stderr,
        )
        return 1

    raw_dir = Path(sys.argv[1]).expanduser().resolve()
    reference_path = Path(sys.argv[2]).expanduser().resolve()
    output_dir = Path(sys.argv[3]).expanduser().resolve()

    if not raw_dir.is_dir():
        print(f"Raw photo directory not found: {raw_dir}", file=sys.stderr)
        return 1

    reference = load_reference(reference_path)
    generated = 0
    skipped: list[str] = []

    for source_path in sorted(raw_dir.iterdir()):
        if not source_path.is_file():
            continue
        stem = source_path.stem
        output_name = reference.get(stem, f"{slugify(stem)}.png")
        if not output_name:
            skipped.append(source_path.name)
            continue
        generate_avatar(source_path, output_dir / output_name)
        generated += 1

    print(f"Generated {generated} Bakery Bash-style avatars in {output_dir}")
    if skipped:
        print("Skipped:")
        for name in skipped:
            print(f"- {name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
