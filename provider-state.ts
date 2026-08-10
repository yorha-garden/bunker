export type ProviderLinkState = "standby" | "active" | "linked" | "degraded" | "offline";

export function initialProviderState(hasModel: boolean, hasConfiguredAuth: boolean): ProviderLinkState {
  return hasModel && hasConfiguredAuth ? "standby" : "offline";
}

export function providerStateAfterHttp(status: number): { state: ProviderLinkState; responseHealthy: boolean } {
  if (status >= 200 && status < 400) return { state: "active", responseHealthy: true };
  return { state: "degraded", responseHealthy: false };
}

export function providerStateAfterMessage(
  current: ProviderLinkState,
  responseHealthy: boolean,
  stopReason?: string,
): ProviderLinkState {
  if (stopReason === "error") return "degraded";
  if (stopReason === "aborted") return current === "active" ? "standby" : current;
  if (stopReason === "stop" || stopReason === "toolUse" || stopReason === "length" || responseHealthy) return "linked";
  return current;
}

export function providerStateLabel(state: ProviderLinkState): string {
  return state.toUpperCase();
}
