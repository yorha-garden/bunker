import assert from "node:assert/strict";
import test from "node:test";
import { GLYPHS, STATUS_GLYPH, iconFile, resolveIconMode } from "../icons.ts";

test("auto picks image only on Ghostty/kitty terminals", () => {
  assert.equal(resolveIconMode(undefined, { TERM_PROGRAM: "ghostty" }), "image");
  assert.equal(resolveIconMode("auto", { TERM: "xterm-kitty" }), "image");
  assert.equal(resolveIconMode("auto", { TERM_PROGRAM: "Apple_Terminal" }), "glyph");
  assert.equal(resolveIconMode("", {}), "glyph");
});

test("explicit setting wins over detection", () => {
  assert.equal(resolveIconMode("glyph", { TERM_PROGRAM: "ghostty" }), "glyph");
  assert.equal(resolveIconMode("image", {}), "image");
  assert.equal(resolveIconMode("bogus", { TERM_PROGRAM: "ghostty" }), "image");
});

test("every tool has a one-cell glyph and an icon file", () => {
  for (const tool of ["bash", "read", "edit", "write", "grep", "find", "ls"] as const) {
    assert.equal([...GLYPHS[tool]].length, 1);
    assert.equal(iconFile(tool), `tool-${tool}.png`);
  }
  assert.deepEqual(Object.keys(STATUS_GLYPH).sort(), ["fail", "ok", "running"]);
});
