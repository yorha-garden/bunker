export const UI = {
  minWidth: 110,
  minPanelHeight: 28,
  panelWidth: 34,
  panelBottomMargin: 8,
  workingIntervalMs: 110,
} as const;

export const GLYPH = {
  linked: "◆",
  prompt: "❯",
  pointer: "◇",
  tool: "▸",
  response: "◈",
  analysis: "⌁",
  scan: ["◐", "◓", "◑", "◒"],
  phaseDone: "◆",
  phaseTodo: "◇",
} as const;

export const LABEL = {
  wordmark: "Y o R H a",
  network: "BUNKER COMMAND NETWORK",
  unit: "TERMINAL 9S-110 / PI AGENT",
  pod: "POD 042 — SUPPORT UNIT",
  inactive: "Hacking mode inactive.",
} as const;

export type OperationalMode = "build" | "hacking";
