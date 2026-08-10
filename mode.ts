import type { OperationalMode } from "./tokens.ts";

export const CTF_TOOL_NAME = "yorha_ctf_status";

export function activeToolsForMode(active: readonly string[], mode: OperationalMode): string[] {
  const unique = [...new Set(active)];
  if (mode === "hacking") {
    return unique.includes(CTF_TOOL_NAME) ? unique : [...unique, CTF_TOOL_NAME];
  }
  return unique.filter((name) => name !== CTF_TOOL_NAME);
}
