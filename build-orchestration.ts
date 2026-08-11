import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const BUILD_AGENT_TOOL_NAMES = ["subagent", "subagent_wait"] as const;
export const SUBAGENT_RPC_REQUEST_EVENT = "subagents:rpc:v1:request";

export interface BuildFleetEntry {
  key: string;
  agent: string;
  role?: string;
  model?: string;
  goal?: string;
  startedAt?: number;
  tokens: { input: number; output: number; total: number };
}

export interface BuildFleetState {
  available: boolean;
  entries: BuildFleetEntry[];
  totalActive: number;
  omitted: number;
  updatedAt?: number;
}

export const EMPTY_BUILD_FLEET: BuildFleetState = {
  available: false,
  entries: [],
  totalActive: 0,
  omitted: 0,
};

function finiteNonNegative(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

export function parseBuildFleetReply(reply: unknown): BuildFleetState | undefined {
  if (!reply || typeof reply !== "object") return undefined;
  const envelope = reply as { success?: unknown; data?: unknown };
  if (envelope.success !== true || !envelope.data || typeof envelope.data !== "object") return undefined;
  const fleet = (envelope.data as { fleet?: unknown }).fleet;
  if (!fleet || typeof fleet !== "object") return undefined;
  const raw = fleet as { version?: unknown; entries?: unknown; totalActive?: unknown; omitted?: unknown };
  if (raw.version !== 1 || !Array.isArray(raw.entries)) return undefined;
  const entries = raw.entries.flatMap((item): BuildFleetEntry[] => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.key !== "string" || typeof row.agent !== "string") return [];
    const tokenSource = row.tokens && typeof row.tokens === "object" ? row.tokens as Record<string, unknown> : {};
    return [{
      key: row.key,
      agent: row.agent,
      role: typeof row.role === "string" ? row.role : undefined,
      model: typeof row.model === "string" ? row.model : undefined,
      goal: typeof row.goal === "string" ? row.goal : undefined,
      startedAt: typeof row.startedAt === "number" ? row.startedAt : undefined,
      tokens: {
        input: finiteNonNegative(tokenSource.input),
        output: finiteNonNegative(tokenSource.output),
        total: finiteNonNegative(tokenSource.total),
      },
    }];
  });
  return {
    available: true,
    entries,
    totalActive: finiteNonNegative(raw.totalActive),
    omitted: finiteNonNegative(raw.omitted),
    updatedAt: Date.now(),
  };
}

export function buildFleetLabel(state: BuildFleetState): string {
  if (!state.available) return "BUILD UNIT OFFLINE";
  if (state.totalActive === 0) return "BUILD UNIT READY";
  return `BUILD UNIT ${state.totalActive} ACTIVE${state.omitted > 0 ? ` · +${state.omitted}` : ""}`;
}

export function requestBuildFleet(pi: ExtensionAPI, timeoutMs = 500): Promise<BuildFleetState> {
  return new Promise((resolve) => {
    const requestId = crypto.randomUUID();
    const replyEvent = `subagents:rpc:v1:reply:${requestId}`;
    let settled = false;
    let unsubscribe = () => {};
    const finish = (state: BuildFleetState) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(state);
    };
    unsubscribe = pi.events.on(replyEvent, (reply) => finish(parseBuildFleetReply(reply) ?? EMPTY_BUILD_FLEET));
    const timer = setTimeout(() => finish(EMPTY_BUILD_FLEET), timeoutMs);
    pi.events.emit(SUBAGENT_RPC_REQUEST_EVENT, {
      version: 1,
      requestId,
      method: "status",
      params: {},
    });
  });
}

export function buildModeSystemPrompt(basePrompt: string): string {
  return `${basePrompt}\n\n<yorha-build-orchestration>\nBUILD MODE is active. Before responding or acting, read the using-superpowers skill and follow it. Use the native Pi skill system for every applicable skill. For implementation work, prefer the Superpowers sequence: brainstorm or clarify design, write a plan, use test-driven development, implement, request review, and verify before claiming completion. Use the subagent tool when delegation creates genuine independent context or parallel value. Keep one writer per working tree; use separate worktrees for concurrent writers. Treat subagents as untrusted collaborators with shared filesystem and environment access, review their output in the parent, and never describe tool allowlists as OS isolation. Load yorha-build-orchestration for the complete Bunker workflow.\n</yorha-build-orchestration>`;
}
