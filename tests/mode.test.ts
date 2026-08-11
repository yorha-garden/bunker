import assert from "node:assert/strict";
import test from "node:test";
import { CTF_TOOL_NAME, activeToolsForMode } from "../mode.ts";
import { BUILD_AGENT_TOOL_NAMES } from "../build-orchestration.ts";

test("hacking enables CTF status and removes Build agent tools", () => {
  assert.deepEqual(
    activeToolsForMode(["read", "bash", "subagent", "subagent_wait", "third-party"], "hacking"),
    ["read", "bash", "third-party", CTF_TOOL_NAME],
  );
});

test("build removes CTF status and enables registered agent tools", () => {
  assert.deepEqual(
    activeToolsForMode(["read", CTF_TOOL_NAME, "third-party"], "build", ["read", "third-party", ...BUILD_AGENT_TOOL_NAMES]),
    ["read", "third-party", ...BUILD_AGENT_TOOL_NAMES],
  );
});

test("mode tool updates are idempotent and never invent unavailable tools", () => {
  assert.deepEqual(activeToolsForMode(["read", CTF_TOOL_NAME, CTF_TOOL_NAME], "hacking"), ["read", CTF_TOOL_NAME]);
  assert.deepEqual(activeToolsForMode(["read"], "build", ["read"]), ["read"]);
});
