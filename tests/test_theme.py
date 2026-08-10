#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
theme = json.loads((ROOT / "theme/yorha-bunker.json").read_text())
required = {
    "accent", "border", "borderAccent", "borderMuted", "success", "error", "warning", "muted", "dim", "text", "thinkingText",
    "selectedBg", "userMessageBg", "userMessageText", "customMessageBg", "customMessageText", "customMessageLabel",
    "toolPendingBg", "toolSuccessBg", "toolErrorBg", "toolTitle", "toolOutput",
    "mdHeading", "mdLink", "mdLinkUrl", "mdCode", "mdCodeBlock", "mdCodeBlockBorder", "mdQuote", "mdQuoteBorder", "mdHr", "mdListBullet",
    "toolDiffAdded", "toolDiffRemoved", "toolDiffContext",
    "syntaxComment", "syntaxKeyword", "syntaxFunction", "syntaxVariable", "syntaxString", "syntaxNumber", "syntaxType", "syntaxOperator", "syntaxPunctuation",
    "thinkingOff", "thinkingMinimal", "thinkingLow", "thinkingMedium", "thinkingHigh", "thinkingXhigh", "bashMode",
}
assert theme["name"] == "yorha-bunker"
missing = required - set(theme["colors"])
assert not missing, f"missing tokens: {sorted(missing)}"
assert theme["vars"]["void"].upper() == "#16161A"
allowed = {value.upper() for value in theme["vars"].values()}
for name, value in theme["colors"].items():
    assert value in theme["vars"] or value.upper() in allowed or value == "", (name, value)
for field in ("userMessageBg", "customMessageBg"):
    assert theme["colors"][field] == "void", (field, theme["colors"][field])
for field in ("toolPendingBg", "toolSuccessBg", "toolErrorBg"):
    assert theme["colors"][field] == "deep", (field, theme["colors"][field])
raw = (ROOT / "theme/yorha-bunker.json").read_text().lower()
for forbidden in ("gradient", "shadow", "noise", "scanline", "image"):
    assert forbidden not in raw, forbidden
print(f"theme contract OK: {len(theme['colors'])} color tokens")
