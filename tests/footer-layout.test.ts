import assert from "node:assert/strict";
import test from "node:test";
import { modelWidthForTerminal, shortenModelName } from "../footer-layout.ts";

test("short model names remain intact", () => {
  assert.equal(shortenModelName("gpt-5.6-sol", 24), "gpt-5.6-sol");
});

test("long model names retain recognizable prefix and suffix", () => {
  const value = shortenModelName("provider-super-long-model-2026-preview", 18);
  assert.equal(value.length, 18);
  assert.match(value, /^provider-/);
  assert.match(value, /preview$/);
  assert.match(value, /…/);
});

test("model width responds to terminal width", () => {
  assert.equal(modelWidthForTerminal(160), 32);
  assert.equal(modelWidthForTerminal(130), 24);
  assert.equal(modelWidthForTerminal(110), 18);
  assert.equal(modelWidthForTerminal(80), 12);
});
