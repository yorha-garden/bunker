import assert from "node:assert/strict";
import test from "node:test";
import { detectOutput, parseExitCode, summarizeTests, truncateMiddle } from "../output-detect.ts";

test("detects diff, json, test, error, text", () => {
  assert.equal(detectOutput("--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b"), "diff");
  assert.equal(detectOutput('{"a": 1, "b": [2]}'), "json");
  assert.equal(detectOutput("ℹ tests 41\nℹ pass 41\nℹ fail 0"), "test");
  assert.equal(detectOutput("Traceback (most recent call last):\n  File x\nValueError: no"), "error");
  assert.equal(detectOutput("Error: ENOENT: no such file"), "error");
  assert.equal(detectOutput("hello\nworld"), "text");
  assert.equal(detectOutput(""), "text");
});

test("invalid JSON-looking text is plain text", () => {
  assert.equal(detectOutput("{not json"), "text");
});

test("summarizes node and pytest style results", () => {
  assert.equal(summarizeTests("ℹ tests 41\nℹ pass 41\nℹ fail 0"), "41 passed");
  assert.equal(summarizeTests("ℹ tests 41\nℹ pass 39\nℹ fail 2"), "2 failed · 39 passed");
  assert.equal(summarizeTests("===== 3 passed, 1 failed in 0.2s ====="), "1 failed · 3 passed");
  assert.equal(summarizeTests("nothing"), undefined);
});

test("parses exit code from Pi bash status line", () => {
  assert.equal(parseExitCode("boom\n\nCommand exited with code 2"), 2);
  assert.equal(parseExitCode("ok"), undefined);
});

test("truncateMiddle keeps head and tail", () => {
  const lines = Array.from({ length: 50 }, (_, i) => `l${i}`);
  const out = truncateMiddle(lines, 20, 10);
  assert.equal(out.hidden, 20);
  assert.equal(out.lines.length, 30);
  assert.equal(out.lines[0], "l0");
  assert.equal(out.lines.at(-1), "l49");
  assert.deepEqual(truncateMiddle(["a", "b"], 20, 10), { lines: ["a", "b"], hidden: 0 });
});
