import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeText } from "../sanitize.ts";

test("plain text is unchanged", () => {
  assert.equal(sanitizeText("hello world\nline two ✓ ▤"), "hello world\nline two ✓ ▤");
  assert.equal(sanitizeText(""), "");
});

test("SGR color codes are stripped", () => {
  assert.equal(sanitizeText("\x1b[31mred\x1b[0m \x1b[1;38;5;208mbold\x1b[m"), "red bold");
});

test("cursor movement and mode escapes are stripped", () => {
  assert.equal(sanitizeText("a\x1b[1Ab\x1b[2Kc\x1b[?25ld\x1b[?25he\x1b[10;20Hf"), "abcdef");
});

test("OSC 8 hyperlinks keep only their text", () => {
  assert.equal(sanitizeText("\x1b]8;;https://x.dev\x1b\\link\x1b]8;;\x1b\\ and \x1b]0;title\x07done"), "link and done");
});

test("other ESC sequences are stripped", () => {
  assert.equal(sanitizeText("a\x1b7b\x1b8c\x1b(Bd\x1bPq#1\x1b\\e\x1b_Gx\x1b\\f"), "abcdef");
});

test("carriage-return progress lines keep the last overwrite", () => {
  assert.equal(sanitizeText("10%\r50%\r100%\ndone"), "100%\ndone");
  assert.equal(sanitizeText("progress 1\rprogress 2\r\nnext"), "progress 2\nnext");
});

test("CRLF becomes LF", () => {
  assert.equal(sanitizeText("a\r\nb\r\n"), "a\nb\n");
});

test("tabs become three spaces", () => {
  assert.equal(sanitizeText("a\tb"), "a   b");
});

test("BEL, NUL and other C0 controls are removed, newlines kept", () => {
  assert.equal(sanitizeText("a\x07b\x00c\x08d\x7fe\nf\x1b"), "abcde\nf");
});
