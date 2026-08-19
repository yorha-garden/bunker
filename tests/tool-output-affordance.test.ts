import assert from "node:assert/strict";
import test from "node:test";
import { clickFriendlyExpandHint, installToolOutputAffordance } from "../tool-output-affordance.ts";

test("collapsed expand hints mention clicking while preserving Ctrl+O fallback", () => {
  assert.equal(
    clickFriendlyExpandHint("... (12 more lines, Ctrl+O to expand)"),
    "... (12 more lines, Click output / Ctrl+O to expand)",
  );
});

test("ANSI-styled Ctrl+O hints preserve styling and do not change collapse hints", () => {
  const styled = "\x1b[2mctrl+o\x1b[0m\x1b[90m to expand\x1b[0m";
  assert.equal(
    clickFriendlyExpandHint(styled),
    "\x1b[2mclick output / ctrl+o\x1b[0m\x1b[90m to expand\x1b[0m",
  );
  assert.equal(clickFriendlyExpandHint("ctrl+o to collapse"), "ctrl+o to collapse");
});

test("installed renderer never expands hints beyond the rendered width", () => {
  class FakeText {
    render(_width: number): string[] {
      return ["... (12 more lines, Ctrl+O to expand)"];
    }
  }
  const restore = installToolOutputAffordance(FakeText);
  try {
    assert.equal(new FakeText().render(40)[0], "... (12 more lines, Ctrl+O to expand)");
    assert.equal(new FakeText().render(80)[0], "... (12 more lines, Click output / Ctrl+O to expand)");
  } finally {
    restore();
  }
});
