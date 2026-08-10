export interface TransmissionTelemetry {
  messageTimestamp: number;
  requestTokens: number;
  elapsedMs?: number;
}

export function calculateRequestTokens(usage: { input: number; output: number }): number {
  return Math.max(0, usage.input) + Math.max(0, usage.output);
}

export function formatTokenCount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value < 1_000) return Math.round(value).toLocaleString("en-US");
  if (value < 1_000_000) return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)}K`;
  return `${(value / 1_000_000).toFixed(value < 10_000_000 ? 1 : 0)}M`;
}

export function formatElapsedTime(elapsedMs: number | undefined): string {
  if (elapsedMs === undefined || !Number.isFinite(elapsedMs) || elapsedMs < 0) return "—";
  if (elapsedMs < 1_000) return `${Math.max(1, Math.round(elapsedMs))}MS`;
  if (elapsedMs < 60_000) return `${(elapsedMs / 1_000).toFixed(1)}S`;
  const totalSeconds = Math.round(elapsedMs / 1_000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}M ${String(seconds).padStart(2, "0")}S`;
  const hours = Math.floor(totalMinutes / 60);
  return `${hours}H ${String(totalMinutes % 60).padStart(2, "0")}M`;
}

export function formatTransmissionTelemetry(telemetry: TransmissionTelemetry, width: number): string {
  const tokens = formatTokenCount(telemetry.requestTokens);
  const elapsed = formatElapsedTime(telemetry.elapsedMs);
  if (width >= 76) return `⌁ TOTAL TOKENS ${tokens}  ·  ELAPSED ${elapsed}`;
  return `⌁ Σ ${tokens} TOKENS · ${elapsed}`;
}

export function isTransmissionTelemetry(value: unknown): value is TransmissionTelemetry {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<TransmissionTelemetry>;
  return typeof item.messageTimestamp === "number"
    && typeof item.requestTokens === "number"
    && (item.elapsedMs === undefined || typeof item.elapsedMs === "number");
}
