import assert from "node:assert/strict";
import test from "node:test";
import { calculateRequestTokens, formatElapsedTime, formatTokenCount, formatTransmissionTelemetry, isTransmissionTelemetry } from "../transmission-format.ts";

const telemetry = {
  messageTimestamp: 1_786_285_928_000,
  requestTokens: 12_456,
  elapsedMs: 12_345,
};

test("request tokens include only current input and output", () => {
  assert.equal(calculateRequestTokens({ input: 7_700, output: 327 }), 8_027);
  assert.equal(calculateRequestTokens({ input: -1, output: 12 }), 12);
});

test("token counts use compact stable notation", () => {
  assert.equal(formatTokenCount(0), "0");
  assert.equal(formatTokenCount(999), "999");
  assert.equal(formatTokenCount(1_250), "1.3K");
  assert.equal(formatTokenCount(12_345), "12K");
  assert.equal(formatTokenCount(1_250_000), "1.3M");
});

test("elapsed response time uses readable compact units", () => {
  assert.equal(formatElapsedTime(842), "842MS");
  assert.equal(formatElapsedTime(12_345), "12.3S");
  assert.equal(formatElapsedTime(128_000), "2M 08S");
  assert.equal(formatElapsedTime(3_720_000), "1H 02M");
  assert.equal(formatElapsedTime(undefined), "—");
});

test("wide transmission telemetry shows only current-request tokens and elapsed time", () => {
  assert.equal(formatTransmissionTelemetry(telemetry, 120), "⌁ TOTAL TOKENS 12K  ·  ELAPSED 12.3S");
});

test("narrow transmission telemetry retains both requested values", () => {
  assert.equal(formatTransmissionTelemetry(telemetry, 60), "⌁ Σ 12K TOKENS · 12.3S");
});

test("persisted telemetry validation accepts only valid records", () => {
  assert.equal(isTransmissionTelemetry(telemetry), true);
  assert.equal(isTransmissionTelemetry({ requestTokens: 1 }), false);
  assert.equal(isTransmissionTelemetry({ ...telemetry, elapsedMs: "12S" }), false);
});
