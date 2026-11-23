#!/usr/bin/env python3
"""Rasterize Pixelarticons SVGs into the 48x48 amber tool icons in assets/generated/.

Pixelarticons paths use only M/m, H/h, V/v and Z/z, so every subpath is an
axis-aligned polygon on the 24x24 grid. Each polygon is filled with the even-odd
rule at the centre of every output pixel.
"""
import re
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
COLOR = (0xBC, 0x9A, 0x5A, 255)  # theme amber
SCALE = 2  # 24 -> 48 px
ICONS = {
    "bash": "terminal-sharp",
    "read": "file-text-sharp",
    "edit": "pen-square-sharp",
    "write": "save-sharp",  # Pixelarticons has no file-plus icon
    "grep": "search",  # no search-sharp; search is rectangle-only
    "find": "zoom-in",  # no zoom-in-sharp
    "ls": "folder-sharp",
}


def polygons(d: str):
    """Yield each closed subpath of an M/H/V/Z path as a list of (x, y) vertices."""
    tokens = re.findall(r"[A-Za-z]|-?\d*\.?\d+", d)
    i = 0
    cx = cy = sx = sy = 0.0
    pts = []
    cmd = ""

    def flush():
        nonlocal pts
        if len(pts) > 2:
            yield pts
        pts = []

    while i < len(tokens):
        if tokens[i].isalpha():
            cmd = tokens[i]
            i += 1
            if cmd in "Zz":
                yield from flush()
                cx, cy = sx, sy
                continue
        if cmd in "Mm":
            x, y = float(tokens[i]), float(tokens[i + 1])
            i += 2
            yield from flush()
            cx, cy = (x, y) if cmd == "M" else (cx + x, cy + y)
            sx, sy = cx, cy
            pts = [(cx, cy)]
            cmd = "L"  # extra coordinate pairs would be an implicit lineto: rejected below
        elif cmd in "Hh":
            v = float(tokens[i]); i += 1
            cx = v if cmd == "H" else cx + v
            pts.append((cx, cy))
        elif cmd in "Vv":
            v = float(tokens[i]); i += 1
            cy = v if cmd == "V" else cy + v
            pts.append((cx, cy))
        else:
            raise ValueError(f"unsupported path command {cmd!r}")
    yield from flush()


def inside(poly, px: float, py: float) -> bool:
    """Even-odd test: count vertical edges to the right of the point."""
    crossings = 0
    for (x0, y0), (x1, y1) in zip(poly, poly[1:] + poly[:1]):
        if x0 == x1 and x0 > px and min(y0, y1) < py < max(y0, y1):
            crossings += 1
    return crossings % 2 == 1


def render(svg: str) -> Image.Image:
    size = 24 * SCALE
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    polys = [p for d in re.findall(r'\sd="([^"]+)"', svg) for p in polygons(d)]
    for y in range(size):
        for x in range(size):
            px, py = (x + 0.5) / SCALE, (y + 0.5) / SCALE
            if any(inside(p, px, py) for p in polys):
                img.putpixel((x, y), COLOR)
    return img


for tool, name in ICONS.items():
    svg = (ROOT / "assets" / "pixelarticons" / f"{name}.svg").read_text()
    render(svg).save(ROOT / "assets" / "generated" / f"tool-{tool}.png")
print("built", len(ICONS), "icons")
