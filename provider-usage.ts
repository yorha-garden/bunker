import { spawn } from "node:child_process";

export const PROVIDER_USAGE_REFRESH_INTERVAL_MS = 30_000;

export function shouldPollProviderUsage(
  provider: string,
  lastRefreshStartedAt: number,
  now = Date.now(),
  force = false,
  intervalMs = PROVIDER_USAGE_REFRESH_INTERVAL_MS,
): boolean {
  if (provider !== "openai-codex") return false;
  return force || now - lastRefreshStartedAt >= intervalMs;
}

export interface UsageWindow {
  remainingPercent: number;
  resetAt?: number;
  windowMinutes?: number;
}

export interface ApiRateLimit {
  remaining: number;
  limit: number;
  reset?: string;
}

export type ProviderUsageState =
  | { provider: string; status: "unsupported" | "loading" | "unavailable"; updatedAt?: number }
  | {
      provider: "openai-codex";
      status: "available";
      plan?: string;
      primary: UsageWindow;
      secondary?: UsageWindow;
      creditBalance?: string;
      updatedAt: number;
    }
  | {
      provider: "openai";
      status: "available";
      requests?: ApiRateLimit;
      tokens?: ApiRateLimit;
      updatedAt: number;
    };

const percent = (value: number) => Math.max(0, Math.min(100, value));

function usageWindow(value: unknown): UsageWindow | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as { usedPercent?: unknown; resetsAt?: unknown; windowDurationMins?: unknown };
  if (typeof item.usedPercent !== "number" || !Number.isFinite(item.usedPercent)) return undefined;
  return {
    remainingPercent: percent(100 - item.usedPercent),
    resetAt: typeof item.resetsAt === "number" ? item.resetsAt : undefined,
    windowMinutes: typeof item.windowDurationMins === "number" ? item.windowDurationMins : undefined,
  };
}

export function parseCodexUsageResult(value: unknown, now = Date.now()): ProviderUsageState | undefined {
  if (!value || typeof value !== "object") return undefined;
  const result = value as { rateLimits?: unknown };
  if (!result.rateLimits || typeof result.rateLimits !== "object") return undefined;
  const limits = result.rateLimits as {
    primary?: unknown;
    secondary?: unknown;
    planType?: unknown;
    credits?: { hasCredits?: unknown; balance?: unknown };
  };
  const primary = usageWindow(limits.primary);
  if (!primary) return undefined;
  const secondary = usageWindow(limits.secondary);
  const creditBalance = limits.credits?.hasCredits === true && typeof limits.credits.balance === "string"
    ? limits.credits.balance
    : undefined;
  return {
    provider: "openai-codex",
    status: "available",
    plan: typeof limits.planType === "string" ? limits.planType.toUpperCase() : undefined,
    primary,
    secondary,
    creditBalance,
    updatedAt: now,
  };
}

function headerNumber(headers: Record<string, string>, name: string): number | undefined {
  const raw = Object.entries(headers).find(([key]) => key.toLowerCase() === name)?.[1];
  if (raw === undefined) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function headerValue(headers: Record<string, string>, name: string): string | undefined {
  return Object.entries(headers).find(([key]) => key.toLowerCase() === name)?.[1];
}

function apiLimit(headers: Record<string, string>, unit: "requests" | "tokens"): ApiRateLimit | undefined {
  const remaining = headerNumber(headers, `x-ratelimit-remaining-${unit}`);
  const limit = headerNumber(headers, `x-ratelimit-limit-${unit}`);
  if (remaining === undefined || limit === undefined || limit <= 0) return undefined;
  return { remaining, limit, reset: headerValue(headers, `x-ratelimit-reset-${unit}`) };
}

export function parseOpenAIRateLimitHeaders(headers: Record<string, string>, now = Date.now()): ProviderUsageState | undefined {
  const requests = apiLimit(headers, "requests");
  const tokens = apiLimit(headers, "tokens");
  if (!requests && !tokens) return undefined;
  return { provider: "openai", status: "available", requests, tokens, updatedAt: now };
}

export function openAIUsageAfterHeaders(
  previous: ProviderUsageState,
  headers: Record<string, string>,
  now = Date.now(),
): ProviderUsageState {
  return parseOpenAIRateLimitHeaders(headers, now)
    ?? (previous.provider === "openai" && previous.status === "available"
      ? previous
      : { provider: "openai", status: "unavailable", updatedAt: now });
}

function limitPercent(limit: ApiRateLimit | undefined): number | undefined {
  return limit ? percent((limit.remaining / limit.limit) * 100) : undefined;
}

function resetLabel(resetAt: number | undefined, now: number): string | undefined {
  if (resetAt === undefined) return undefined;
  const seconds = Math.max(0, resetAt - Math.floor(now / 1000));
  if (seconds < 60) return `${seconds}S`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}M`;
  if (seconds < 86400) return `${Math.ceil(seconds / 3600)}H`;
  return `${Math.ceil(seconds / 86400)}D`;
}

export function providerUsageRemainingPercent(state: ProviderUsageState): number | undefined {
  if (state.status !== "available") return undefined;
  if (state.provider === "openai-codex") {
    return Math.min(state.primary.remainingPercent, state.secondary?.remainingPercent ?? 100);
  }
  const values = [limitPercent(state.requests), limitPercent(state.tokens)].filter((value): value is number => value !== undefined);
  return values.length ? Math.min(...values) : undefined;
}

export function formatProviderUsage(state: ProviderUsageState, width: number, now = Date.now()): string {
  if (state.status === "unsupported") return "";
  if (state.status === "loading") return state.provider === "openai-codex" ? "CODEX …" : "API …";
  if (state.status === "unavailable") return state.provider === "openai-codex" ? "CODEX —" : "API —";
  if (state.provider === "openai-codex") {
    const remaining = Math.round(providerUsageRemainingPercent(state) ?? state.primary.remainingPercent);
    const reset = resetLabel(state.primary.resetAt, now);
    const credit = state.creditBalance ? ` · $${state.creditBalance}` : "";
    if (width >= 150) return `CODEX ${remaining}% LEFT${reset ? ` · RESET ${reset}` : ""}${credit}`;
    return `CODEX ${remaining}%${reset ? ` · ${reset}` : ""}${credit}`;
  }
  const requests = limitPercent(state.requests);
  const tokens = limitPercent(state.tokens);
  const fields = [
    requests === undefined ? undefined : `R ${Math.round(requests)}%`,
    tokens === undefined ? undefined : `T ${Math.round(tokens)}%`,
  ].filter(Boolean);
  return `${width >= 150 ? "OPENAI API" : "API"} ${fields.join(" · ") || "—"}`;
}

export function codexAccountEmailFromToken(token: string | undefined): string | undefined {
  if (!token) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString("utf8"));
    const email = payload?.["https://api.openai.com/profile"]?.email;
    return typeof email === "string" ? email.toLowerCase() : undefined;
  } catch {
    return undefined;
  }
}

export async function queryCodexUsage(options: {
  expectedEmail?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
} = {}): Promise<ProviderUsageState | undefined> {
  const { expectedEmail, signal, timeoutMs = 8_000 } = options;
  return new Promise((resolve) => {
    const child = spawn("codex", ["app-server", "--stdio"], { stdio: ["pipe", "pipe", "ignore"] });
    let buffer = "";
    let settled = false;
    const finish = (value?: ProviderUsageState) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      child.kill();
      resolve(value);
    };
    const abort = () => finish();
    const timer = setTimeout(() => finish(), timeoutMs);
    signal?.addEventListener("abort", abort, { once: true });
    child.on("error", () => finish());
    child.on("exit", () => finish());
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      buffer += chunk;
      while (buffer.includes("\n")) {
        const newline = buffer.indexOf("\n");
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        try {
          const message = JSON.parse(line) as { id?: number; result?: unknown };
          if (message.id === 1) {
            child.stdin.write(`${JSON.stringify({ method: "initialized", params: {} })}\n`);
            child.stdin.write(`${JSON.stringify({ id: 2, method: "account/read", params: {} })}\n`);
          } else if (message.id === 2) {
            const account = message.result as { account?: { email?: unknown } } | undefined;
            const email = typeof account?.account?.email === "string" ? account.account.email.toLowerCase() : undefined;
            if (expectedEmail && email !== expectedEmail.toLowerCase()) {
              finish();
            } else {
              child.stdin.write(`${JSON.stringify({ id: 3, method: "account/rateLimits/read", params: {} })}\n`);
            }
          } else if (message.id === 3) {
            finish(parseCodexUsageResult(message.result));
          }
        } catch {}
      }
    });
    child.stdin.write(`${JSON.stringify({
      id: 1,
      method: "initialize",
      params: { clientInfo: { name: "yorha-bunker", title: "YoRHa Bunker", version: "1.0.0" } },
    })}\n`);
  });
}
