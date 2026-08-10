import assert from "node:assert/strict";
import test from "node:test";
import { initialProviderState, providerStateAfterHttp, providerStateAfterMessage, providerStateLabel } from "../provider-state.ts";

test("initial state reflects real model and authentication availability", () => {
  assert.equal(initialProviderState(true, true), "standby");
  assert.equal(initialProviderState(true, false), "offline");
  assert.equal(initialProviderState(false, true), "offline");
});

test("provider lifecycle transitions through active and linked", () => {
  const response = providerStateAfterHttp(200);
  assert.deepEqual(response, { state: "active", responseHealthy: true });
  assert.equal(providerStateAfterMessage(response.state, response.responseHealthy, "stop"), "linked");
});

test("provider failures degrade and later success repairs the link", () => {
  assert.deepEqual(providerStateAfterHttp(500), { state: "degraded", responseHealthy: false });
  assert.equal(providerStateAfterMessage("active", false, "error"), "degraded");
  assert.equal(providerStateAfterMessage("active", true, "stop"), "linked");
  assert.equal(providerStateAfterMessage("active", false, "stop"), "linked");
});

test("an operator abort is not reported as a provider failure", () => {
  assert.equal(providerStateAfterMessage("active", false, "aborted"), "standby");
  assert.equal(providerStateAfterMessage("linked", false, "aborted"), "linked");
});

test("labels are compact uppercase values", () => {
  assert.equal(providerStateLabel("degraded"), "DEGRADED");
});
