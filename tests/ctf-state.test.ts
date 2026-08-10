import assert from "node:assert/strict";
import test from "node:test";
import { EMPTY_CTF_STATE, applyCtfUpdate, restoreCtfState } from "../ctf-state.ts";

const empty = () => ({ ...EMPTY_CTF_STATE, evidence: [] });

test("normal phase progression and evidence deduplication", () => {
  let state = applyCtfUpdate(empty(), { challenge: "Black Box", category: "pwn", target: "tcp/31337", evidence: ["NX enabled"] }, 1);
  state = applyCtfUpdate(state, { phase: "ANALYSIS", evidence: ["NX enabled", "PIE disabled"] }, 2);
  assert.equal(state.phase, "ANALYSIS");
  assert.deepEqual(state.evidence.map((item) => item.text), ["NX enabled", "PIE disabled"]);
});

test("regressions and skipped phases require an override reason", () => {
  const analysis = applyCtfUpdate(empty(), { phase: "ANALYSIS" }, 1);
  assert.throws(() => applyCtfUpdate(analysis, { phase: "TRIAGE" }, 2), /overrideReason/);
  assert.throws(() => applyCtfUpdate(analysis, { phase: "VERIFICATION" }, 2), /overrideReason/);
  assert.equal(applyCtfUpdate(analysis, { phase: "VERIFICATION", overrideReason: "Imported verified exploit transcript" }, 2).phase, "VERIFICATION");
});

test("verified status is permitted only in verification or complete", () => {
  assert.throws(() => applyCtfUpdate(empty(), { verified: true }), /VERIFICATION/);
  const verification = applyCtfUpdate(empty(), { phase: "VERIFICATION", overrideReason: "Reproduced independently" });
  assert.equal(applyCtfUpdate(verification, { verified: true }).verified, true);
});

test("restoration uses the newest valid active-branch entry", () => {
  const first = applyCtfUpdate(empty(), { challenge: "First" }, 1);
  const second = applyCtfUpdate(first, { phase: "ANALYSIS" }, 2);
  const restored = restoreCtfState([
    { type: "custom", customType: "yorha-ctf-state", data: first },
    { type: "custom", customType: "other", data: second },
    { type: "custom", customType: "yorha-ctf-state", data: { bad: true } },
    { type: "custom", customType: "yorha-ctf-state", data: second },
  ]);
  assert.equal(restored.phase, "ANALYSIS");
  assert.equal(restored.challenge, "First");
});

test("state model has no field for flag text", () => {
  const state = applyCtfUpdate(empty(), { phase: "VERIFICATION", overrideReason: "test", verified: true });
  assert.equal(JSON.stringify(state).includes("flag{"), false);
  assert.deepEqual(Object.keys(state).sort(), ["category", "challenge", "evidence", "phase", "target", "updatedAt", "verified"]);
});
