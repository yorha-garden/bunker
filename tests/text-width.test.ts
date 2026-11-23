import assert from "node:assert/strict";
import test from "node:test";
import { defaultMetrics } from "../text-width.ts";

const RED = "\x1b[31m";
const RESET = "\x1b[0m";

test("visibleWidth counts plain text", () => {
  assert.equal(defaultMetrics.visibleWidth("hello"), 5);
});

test("visibleWidth ignores SGR sequences", () => {
  assert.equal(defaultMetrics.visibleWidth(`${RED}hello${RESET}`), 5);
});

test("visibleWidth of empty string is 0", () => {
  assert.equal(defaultMetrics.visibleWidth(""), 0);
});

test("truncateToWidth leaves short text alone and cuts long plain text", () => {
  assert.equal(defaultMetrics.truncateToWidth("hello", 10), "hello");
  assert.equal(defaultMetrics.truncateToWidth("hello world", 5), "hello");
});

test("truncateToWidth preserves styling and resets after a cut", () => {
  const out = defaultMetrics.truncateToWidth(`${RED}hello world${RESET}`, 5);
  assert.equal(out, `${RED}hello${RESET}`);
  assert.equal(defaultMetrics.visibleWidth(out), 5);
});

test("truncateToWidth to width 1 keeps a single column", () => {
  assert.equal(defaultMetrics.visibleWidth(defaultMetrics.truncateToWidth("hello", 1)), 1);
});

test("truncateToWidth of empty string is empty", () => {
  assert.equal(defaultMetrics.truncateToWidth("", 5), "");
});

test("truncateToWidth appends ellipsis within the width", () => {
  assert.equal(defaultMetrics.truncateToWidth("hello world", 5, "…"), "hell…");
});
