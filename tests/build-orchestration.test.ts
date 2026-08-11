import assert from "node:assert/strict";
import test from "node:test";
import { EMPTY_BUILD_FLEET, buildFleetLabel, buildModeSystemPrompt, parseBuildFleetReply } from "../build-orchestration.ts";

test("parses the bounded pi-subagents fleet DTO", () => {
  const state = parseBuildFleetReply({
    success: true,
    data: {
      fleet: {
        version: 1,
        totalActive: 3,
        omitted: 1,
        entries: [
          { key: "opaque", agent: "reviewer", role: "spec", model: "fast", goal: "Review behavior", tokens: { input: 10, output: 5, total: 15 } },
          { key: 42, agent: "invalid" },
        ],
      },
    },
  });
  assert.equal(state?.available, true);
  assert.equal(state?.totalActive, 3);
  assert.equal(state?.omitted, 1);
  assert.equal(state?.entries.length, 1);
  assert.deepEqual(state?.entries[0].tokens, { input: 10, output: 5, total: 15 });
  assert.equal(buildFleetLabel(state!), "BUILD UNIT 3 ACTIVE · +1");
});

test("rejects malformed and unsuccessful fleet replies", () => {
  assert.equal(parseBuildFleetReply(undefined), undefined);
  assert.equal(parseBuildFleetReply({ success: false }), undefined);
  assert.equal(parseBuildFleetReply({ success: true, data: { fleet: { version: 2, entries: [] } } }), undefined);
  assert.equal(buildFleetLabel(EMPTY_BUILD_FLEET), "BUILD UNIT OFFLINE");
  assert.equal(buildFleetLabel({ ...EMPTY_BUILD_FLEET, available: true }), "BUILD UNIT READY");
});

test("Build prompt requires Superpowers, safe delegation, review, and verification", () => {
  const prompt = buildModeSystemPrompt("base");
  assert.match(prompt, /^base/);
  assert.match(prompt, /using-superpowers/);
  assert.match(prompt, /test-driven development/i);
  assert.match(prompt, /one writer per working tree/i);
  assert.match(prompt, /review their output in the parent/i);
  assert.match(prompt, /verify before claiming completion/i);
});
