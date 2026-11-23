#!/usr/bin/env python3
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ["bash", "read", "edit", "write", "grep", "find", "ls"]

for tool in TOOLS:
    path = ROOT / "assets" / "generated" / f"tool-{tool}.png"
    assert path.exists(), f"missing {path.name}"
    img = Image.open(path)
    assert img.size == (48, 48), f"{path.name} size {img.size}"
    assert img.mode == "RGBA", f"{path.name} mode {img.mode}"
    assert any(px[3] > 0 for px in img.getdata()), f"{path.name} is empty"
print("icon assets ok")
