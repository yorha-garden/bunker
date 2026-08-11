import type { OperationalMode } from "./tokens.ts";
import { BUILD_AGENT_TOOL_NAMES } from "./build-orchestration.ts";

export const CTF_TOOL_NAME = "yorha_ctf_status";

export function activeToolsForMode(
  active: readonly string[],
  mode: OperationalMode,
  available: readonly string[] = active,
): string[] {
  const buildTools = new Set<string>(BUILD_AGENT_TOOL_NAMES);
  const unique = [...new Set(active)].filter((name) => name !== CTF_TOOL_NAME && !buildTools.has(name));
  if (mode === "hacking") return [...unique, CTF_TOOL_NAME];
  const availableSet = new Set(available);
  return [...unique, ...BUILD_AGENT_TOOL_NAMES.filter((name) => availableSet.has(name))];
}
