export const CTF_PHASES = ["TRIAGE", "ANALYSIS", "EXPLOITATION", "VERIFICATION", "COMPLETE"] as const;
export type CtfPhase = (typeof CTF_PHASES)[number];

export interface CtfEvidence {
  text: string;
  at: number;
}

export interface CtfState {
  challenge: string;
  category: string;
  target: string;
  phase: CtfPhase;
  evidence: CtfEvidence[];
  verified: boolean;
  updatedAt: number;
}

export interface CtfUpdate {
  challenge?: string;
  category?: string;
  target?: string;
  phase?: CtfPhase;
  evidence?: string[];
  verified?: boolean;
  overrideReason?: string;
}

export const EMPTY_CTF_STATE: CtfState = Object.freeze({
  challenge: "UNASSIGNED",
  category: "UNKNOWN",
  target: "LOCAL",
  phase: "TRIAGE",
  evidence: [],
  verified: false,
  updatedAt: 0,
});

const MAX_LABEL = 80;
const MAX_EVIDENCE = 24;
const MAX_EVIDENCE_LENGTH = 160;

function cleanLabel(value: string | undefined, fallback: string): string {
  if (value === undefined) return fallback;
  const clean = value.trim().replace(/\s+/g, " ");
  if (!clean) throw new Error("CTF labels cannot be empty");
  if (clean.length > MAX_LABEL) throw new Error(`CTF labels cannot exceed ${MAX_LABEL} characters`);
  return clean;
}

export function isCtfPhase(value: unknown): value is CtfPhase {
  return typeof value === "string" && CTF_PHASES.includes(value as CtfPhase);
}

export function isCtfState(value: unknown): value is CtfState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<CtfState>;
  return typeof state.challenge === "string"
    && typeof state.category === "string"
    && typeof state.target === "string"
    && isCtfPhase(state.phase)
    && Array.isArray(state.evidence)
    && state.evidence.every((item) => item && typeof item.text === "string" && typeof item.at === "number")
    && typeof state.verified === "boolean"
    && typeof state.updatedAt === "number";
}

export function applyCtfUpdate(current: CtfState, update: CtfUpdate, now = Date.now()): CtfState {
  if (!isCtfState(current)) throw new Error("Current CTF state is invalid");
  const nextPhase = update.phase ?? current.phase;
  if (!isCtfPhase(nextPhase)) throw new Error(`Unknown CTF phase: ${String(nextPhase)}`);

  const currentIndex = CTF_PHASES.indexOf(current.phase);
  const nextIndex = CTF_PHASES.indexOf(nextPhase);
  const exceptional = nextIndex < currentIndex || nextIndex > currentIndex + 1;
  if (exceptional && !update.overrideReason?.trim()) {
    throw new Error(`Phase transition ${current.phase} → ${nextPhase} requires overrideReason`);
  }

  const additions = update.evidence ?? [];
  if (!Array.isArray(additions)) throw new Error("Evidence must be an array");
  const evidence = [...current.evidence];
  const seen = new Set(evidence.map((item) => item.text.toLowerCase()));
  for (const raw of additions) {
    if (typeof raw !== "string") throw new Error("Evidence entries must be strings");
    const text = raw.trim().replace(/\s+/g, " ");
    if (!text) throw new Error("Evidence entries cannot be empty");
    if (text.length > MAX_EVIDENCE_LENGTH) throw new Error(`Evidence cannot exceed ${MAX_EVIDENCE_LENGTH} characters`);
    if (!seen.has(text.toLowerCase())) {
      evidence.push({ text, at: now });
      seen.add(text.toLowerCase());
    }
  }
  if (evidence.length > MAX_EVIDENCE) throw new Error(`Evidence register cannot exceed ${MAX_EVIDENCE} entries`);

  if (update.verified === true && nextPhase !== "VERIFICATION" && nextPhase !== "COMPLETE") {
    throw new Error("Flag status may be VERIFIED only during VERIFICATION or COMPLETE");
  }

  return {
    challenge: cleanLabel(update.challenge, current.challenge),
    category: cleanLabel(update.category, current.category),
    target: cleanLabel(update.target, current.target),
    phase: nextPhase,
    evidence,
    verified: update.verified ?? current.verified,
    updatedAt: now,
  };
}

export function restoreCtfState(entries: readonly unknown[]): CtfState {
  let restored: CtfState = { ...EMPTY_CTF_STATE, evidence: [] };
  for (const raw of entries) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as { type?: string; customType?: string; data?: unknown };
    if (entry.type === "custom" && entry.customType === "yorha-ctf-state" && isCtfState(entry.data)) {
      restored = { ...entry.data, evidence: [...entry.data.evidence] };
    }
  }
  return restored;
}
