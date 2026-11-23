import assert from "node:assert/strict";
import test from "node:test";
import { defaultMetrics } from "../text-width.ts";
import { bashCard, editCard } from "../card-model.ts";
import { renderCardLines } from "../tool-cards.ts";

const theme = { fg: (_c: string, t: string) => t, bold: (t: string) => t };
const ok = { isError: false, isPartial: false, durationMs: 2100 };

test("collapsed bash card is one line with summary", () => {
  const lines = renderCardLines(bashCard({ command: "npm test" }, "ℹ pass 41\nℹ fail 0", ok), 100, theme, { expanded: false });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /✓ BASH\s+npm test · 2\.1s · exit 0 · 41 passed/);
});

test("failed bash auto-expands even when not user-expanded", () => {
  const card = bashCard({ command: "x" }, "boom\n\nCommand exited with code 2", { ...ok, isError: true });
  const lines = renderCardLines(card, 100, theme, { expanded: false });
  assert.equal(lines[0].includes("✗ BASH"), true);
  assert.equal(lines.some((l) => l.includes("boom")), true);
});

test("user expansion shows body for a successful bash", () => {
  const card = bashCard({ command: "ls" }, "a\nb", ok);
  assert.equal(renderCardLines(card, 100, theme, { expanded: false }).length, 1);
  assert.equal(renderCardLines(card, 100, theme, { expanded: true }).length > 1, true);
});

test("every line fits the width, with narrow degradation", () => {
  const card = bashCard({ command: "a-very-long-command --with --many --flags and more words here" }, "ℹ pass 1\nℹ fail 0", ok);
  for (const width of [120, 80, 50, 30, 12, 1]) {
    for (const l of renderCardLines(card, width, theme, { expanded: true })) {
      assert.equal(defaultMetrics.visibleWidth(l) <= Math.max(1, width), true, `width ${width}: ${JSON.stringify(l)}`);
    }
  }
  const narrow = renderCardLines(card, 50, theme, { expanded: false })[0];
  assert.equal(narrow.includes("2.1s"), false);
});

test("long auto-expanded bodies keep first 20 and last 10 with a Ctrl+O notice", () => {
  const body = Array.from({ length: 60 }, (_, i) => `line ${i}`).join("\n");
  const lines = renderCardLines(bashCard({ command: "x" }, body, { ...ok, isError: true }), 100, theme, { expanded: false });
  assert.equal(lines.length, 1 + 20 + 1 + 10);
  assert.equal(lines[21], "  30 lines hidden · Ctrl+O");
  assert.equal(lines.includes("  line 30"), false);
});

test("user-expanded long bodies show every line without a hidden notice", () => {
  const body = Array.from({ length: 60 }, (_, i) => `line ${i}`).join("\n");
  for (const opts of [ok, { ...ok, isError: true }]) {
    const lines = renderCardLines(bashCard({ command: "x" }, body, opts), 100, theme, { expanded: true });
    assert.equal(lines.length, 61);
    assert.equal(lines.some((l) => l.includes("hidden")), false);
  }
});

test("edit renders diff with colors requested for + and -", () => {
  const colors: string[] = [];
  const t = { fg: (c: string, s: string) => { colors.push(c); return s; }, bold: (s: string) => s };
  renderCardLines(editCard({ path: "a" }, "--- a\n+++ b\n@@ @@\n-x\n+y", "", ok), 100, t, { expanded: false });
  assert.equal(colors.includes("success") && colors.includes("error"), true);
});

test("image icon is used only when it is exactly one row", () => {
  const card = bashCard({ command: "x" }, "", ok);
  const withImage = renderCardLines(card, 100, theme, { expanded: false, iconLines: ["<IMG>"] })[0];
  assert.equal(withImage.startsWith("<IMG>"), true);
  const tall = renderCardLines(card, 100, theme, { expanded: false, iconLines: ["a", "b"] })[0];
  assert.equal(tall.includes("<IMG>") || tall.startsWith("a"), false);
});
