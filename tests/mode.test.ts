import assert from "node:assert/strict";
import test from "node:test";
import { CTF_TOOL_NAME, activeToolsForMode } from "../mode.ts";

test("hacking adds only the CTF status tool", () => {
  assert.deepEqual(activeToolsForMode(["read", "bash", "third-party"], "hacking"), ["read", "bash", "third-party", CTF_TOOL_NAME]);
});

test("build removes only the CTF status tool", () => {
  assert.deepEqual(activeToolsForMode(["read", CTF_TOOL_NAME, "third-party"], "build"), ["read", "third-party"]);
});

test("mode tool updates are idempotent", () => {
  assert.deepEqual(activeToolsForMode(["read", CTF_TOOL_NAME, CTF_TOOL_NAME], "hacking"), ["read", CTF_TOOL_NAME]);
  assert.deepEqual(activeToolsForMode(["read"], "build"), ["read"]);
});
