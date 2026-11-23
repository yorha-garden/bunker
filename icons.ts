export type ToolName = "bash" | "read" | "edit" | "write" | "grep" | "find" | "ls";
export type IconMode = "image" | "glyph";

export const GLYPHS: Record<ToolName, string> = {
  bash: "$", read: "▤", edit: "✎", write: "▣", grep: "⌕", find: "◎", ls: "▦",
};
export const STATUS_GLYPH = { running: "⟳", ok: "✓", fail: "✗" } as const;

export function iconFile(tool: ToolName): string {
  return `tool-${tool}.png`;
}

export function resolveIconMode(setting: string | undefined, env: { TERM_PROGRAM?: string; TERM?: string }): IconMode {
  if (setting === "image" || setting === "glyph") return setting;
  const program = (env.TERM_PROGRAM ?? "").toLowerCase();
  const term = (env.TERM ?? "").toLowerCase();
  return program === "ghostty" || term.includes("kitty") || term.includes("ghostty") ? "image" : "glyph";
}
