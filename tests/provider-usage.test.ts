import assert from "node:assert/strict";
import test from "node:test";
import {
  codexAccountEmailFromToken,
  formatProviderUsage,
  parseCodexUsageResult,
  parseOpenAIRateLimitHeaders,
  providerUsageRemainingPercent,
} from "../provider-usage.ts";

const now = 1_800_000_000_000;

test("Codex OAuth account identity can be compared without exposing the token", () => {
  const payload = Buffer.from(JSON.stringify({
    "https://api.openai.com/profile": { email: "Operator@Example.com" },
  })).toString("base64url");
  assert.equal(codexAccountEmailFromToken(`header.${payload}.signature`), "operator@example.com");
  assert.equal(codexAccountEmailFromToken("invalid"), undefined);
});

test("Codex usage converts used percentages into remaining allowance", () => {
  const usage = parseCodexUsageResult({
    rateLimits: {
      primary: { usedPercent: 7, windowDurationMins: 10_080, resetsAt: 1_800_604_800 },
      secondary: { usedPercent: 20, windowDurationMins: 300, resetsAt: 1_800_003_600 },
      credits: { hasCredits: false, unlimited: false, balance: "0" },
      planType: "plus",
    },
  }, now);
  assert.ok(usage && usage.status === "available" && usage.provider === "openai-codex");
  assert.equal(usage.primary.remainingPercent, 93);
  assert.equal(usage.secondary?.remainingPercent, 80);
  assert.equal(usage.plan, "PLUS");
  assert.equal(usage.creditBalance, undefined);
  assert.equal(providerUsageRemainingPercent(usage), 80);
});

test("Codex footer shows the limiting window and reset", () => {
  const usage = parseCodexUsageResult({
    rateLimits: { primary: { usedPercent: 7, windowDurationMins: 10_080, resetsAt: 1_800_604_800 } },
  }, now)!;
  assert.equal(formatProviderUsage(usage, 120, now), "CODEX 93% · 7D");
  assert.equal(formatProviderUsage(usage, 160, now), "CODEX 93% LEFT · RESET 7D");
});

test("OpenAI rate-limit headers expose remaining request and token percentages", () => {
  const usage = parseOpenAIRateLimitHeaders({
    "x-ratelimit-limit-requests": "500",
    "x-ratelimit-remaining-requests": "450",
    "x-ratelimit-reset-requests": "12s",
    "X-RateLimit-Limit-Tokens": "100000",
    "X-RateLimit-Remaining-Tokens": "25000",
    "X-RateLimit-Reset-Tokens": "1s",
  }, now);
  assert.ok(usage && usage.status === "available" && usage.provider === "openai");
  assert.equal(providerUsageRemainingPercent(usage), 25);
  assert.equal(formatProviderUsage(usage, 120, now), "API R 90% · T 25%");
  assert.equal(formatProviderUsage(usage, 160, now), "OPENAI API R 90% · T 25%");
});

test("unsupported or absent allowance data stays unobtrusive", () => {
  assert.equal(parseOpenAIRateLimitHeaders({ "content-type": "application/json" }), undefined);
  assert.equal(parseCodexUsageResult({ rateLimits: {} }), undefined);
  assert.equal(formatProviderUsage({ provider: "anthropic", status: "unsupported" }, 120, now), "");
  assert.equal(formatProviderUsage({ provider: "openai-codex", status: "loading" }, 120, now), "CODEX …");
});
