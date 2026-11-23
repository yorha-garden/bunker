import assert from "node:assert/strict";
import test from "node:test";
import { bashCard, editCard, findCard, formatDuration, grepCard, lsCard, readCard, writeCard } from "../card-model.ts";

const ok = { isError: false, isPartial: false, durationMs: 2100 };

test("formatDuration is compact", () => {
  assert.equal(formatDuration(undefined), undefined);
  assert.equal(formatDuration(450), "450ms");
  assert.equal(formatDuration(2100), "2.1s");
  assert.equal(formatDuration(75000), "1m15s");
});

test("formatDuration rounds before splitting units", () => {
  assert.equal(formatDuration(999.6), "1.0s");
  assert.equal(formatDuration(59940), "59.9s");
  assert.equal(formatDuration(59950), "1m0s");
  assert.equal(formatDuration(119600), "2m0s");
  assert.equal(formatDuration(119400), "1m59s");
});

test("bash success collapses with test summary", () => {
  const c = bashCard({ command: "npm test" }, "ℹ tests 41\nℹ pass 41\nℹ fail 0", ok);
  assert.equal(c.status, "ok");
  assert.equal(c.autoExpand, false);
  assert.equal(c.summary, "exit 0 · 41 passed");
  assert.equal(c.duration, "2.1s");
});

test("bash failure auto-expands with exit code", () => {
  const c = bashCard({ command: "false" }, "boom\n\nCommand exited with code 2", { ...ok, isError: true });
  assert.equal(c.status, "fail");
  assert.equal(c.autoExpand, true);
  assert.equal(c.summary, "exit 2");
});

test("bash running", () => {
  const c = bashCard({ command: "sleep 9" }, "", { isError: false, isPartial: true });
  assert.equal(c.status, "running");
  assert.equal(c.summary, "running");
});

test("bash success with error-looking output still auto-expands", () => {
  const c = bashCard({ command: "x" }, "Traceback (most recent call last):\nValueError: no", ok);
  assert.equal(c.autoExpand, true);
});

test("read summary and range", () => {
  const c = readCard({ path: "a.ts", offset: 10, limit: 5 }, "1\n2\n3\n4\n5", ok);
  assert.equal(c.summary, "5 lines · from 10");
  assert.equal(c.autoExpand, false);
});

test("edit counts diff lines and always expands", () => {
  const diff = "--- a\n+++ b\n@@ -1,2 +1,2 @@\n-x\n+y\n+z";
  const c = editCard({ path: "a.ts" }, diff, "", ok);
  assert.equal(c.summary, "+2 −1");
  assert.equal(c.autoExpand, true);
  assert.equal(c.kind, "diff");
});

test("edit error is a failed card", () => {
  const c = editCard({ path: "a.ts" }, undefined, "Error: could not find text", { ...ok, isError: true });
  assert.equal(c.status, "fail");
  assert.equal(c.summary, "Error: could not find text");
});

test("write reports line count and expands first lines", () => {
  const c = writeCard({ path: "n.md", content: "a\nb\nc" }, "Successfully wrote", ok);
  assert.equal(c.summary, "3 lines");
  assert.equal(c.autoExpand, true);
  assert.deepEqual(c.body, ["a", "b", "c"]);
});

test("grep groups matches by file, max 8 shown", () => {
  const out = Array.from({ length: 12 }, (_, i) => `f${i % 3}.ts:${i + 1}:render`).join("\n");
  const c = grepCard({ pattern: "render" }, out, ok);
  assert.equal(c.summary, "12 matches in 3 files");
  assert.equal(c.autoExpand, true);
  assert.equal(c.body.length <= 8 + 3 + 1, true);
});

test("grep with no matches collapses", () => {
  const c = grepCard({ pattern: "zzz" }, "No matches found", ok);
  assert.equal(c.summary, "0 matches");
  assert.equal(c.autoExpand, false);
});

test("find and ls count results", () => {
  assert.equal(findCard({ pattern: "*.ts" }, "a.ts\nb.ts", ok).summary, "2 results");
  assert.equal(lsCard({ path: "." }, "a\nb\nc", ok).summary, "3 entries");
  assert.equal(findCard({ pattern: "*.ts" }, "a.ts", ok).autoExpand, false);
});
