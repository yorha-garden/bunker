import assert from "node:assert/strict";
import test from "node:test";
import { UI } from "../tokens.ts";

test("approved responsive geometry is centralized", () => {
  assert.equal(UI.minWidth, 110);
  assert.equal(UI.panelWidth, 34);
  assert.ok(UI.panelBottomMargin >= 8);
  assert.ok(UI.minPanelHeight >= 28);
});

test("panel geometry reserves an editor dock", () => {
  assert.ok(UI.panelBottomMargin > 0);
  assert.ok(UI.panelWidth < UI.minWidth / 2);
});
