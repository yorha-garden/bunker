import type { CardModel } from "./card-model.ts";
import { GLYPHS, STATUS_GLYPH } from "./icons.ts";
import { truncateMiddle } from "./output-detect.ts";
import { defaultMetrics, type TextMetrics } from "./text-width.ts";

export interface CardTheme { fg(color: string, text: string): string; bold(text: string): string }

const STATUS_COLOR = { running: "warning", ok: "success", fail: "error" } as const;
const IMAGE_ICON_CELLS = 2;

function header(model: CardModel, width: number, theme: CardTheme, metrics: TextMetrics, iconLines?: readonly string[]): string {
  const fit = (text: string) => metrics.truncateToWidth(text, Math.max(1, width), "");
  const useImage = iconLines !== undefined && iconLines.length === 1;
  const icon = useImage ? `${iconLines[0]} ` : `${theme.fg("accent", GLYPHS[model.tool])} `;
  const iconCells = (useImage ? IMAGE_ICON_CELLS : metrics.visibleWidth(GLYPHS[model.tool])) + 1;
  const status = theme.fg(STATUS_COLOR[model.status], STATUS_GLYPH[model.status]);
  const label = theme.fg("toolTitle", theme.bold(model.tool.toUpperCase()));
  const build = (parts: { icon: boolean; duration: boolean; summary: boolean }) => {
    const tail = [parts.duration ? model.duration : undefined, parts.summary ? model.summary : undefined].filter(Boolean);
    const rest = tail.length ? ` · ${tail.join(" · ")}` : "";
    return `${parts.icon ? icon : ""}${status} ${label}  ${theme.fg("text", model.arg)}${theme.fg("dim", rest)}`;
  };
  const attempts = [
    { icon: true, duration: true, summary: true },
    { icon: false, duration: true, summary: true },
    { icon: false, duration: false, summary: true },
    { icon: false, duration: false, summary: false },
  ];
  for (const a of attempts) {
    const candidate = build(a);
    // image escape sequences have unreliable width; measure the text without the icon and add its cells
    const measured = metrics.visibleWidth(a.icon ? build({ ...a, icon: false }) : candidate) + (a.icon ? iconCells : 0);
    if (measured <= width) return candidate;
  }
  return fit(build(attempts[3]));
}

function colorBody(model: CardModel, line: string, theme: CardTheme): string {
  if (model.kind === "diff") {
    if (line.startsWith("+") && !line.startsWith("+++")) return theme.fg("success", line);
    if (line.startsWith("-") && !line.startsWith("---")) return theme.fg("error", line);
    return theme.fg("dim", line);
  }
  if (model.kind === "error") return theme.fg("error", line);
  return theme.fg("muted", line);
}

export function renderCardLines(
  model: CardModel,
  width: number,
  theme: CardTheme,
  opts: { expanded: boolean; iconLines?: readonly string[]; metrics?: TextMetrics },
): string[] {
  const metrics = opts.metrics ?? defaultMetrics;
  const fit = (text: string) => metrics.truncateToWidth(text, Math.max(1, width), "");
  const head = header(model, width, theme, metrics, opts.iconLines);
  const show = opts.expanded || model.autoExpand;
  if (!show || model.status === "running" || model.body.length === 0) return [head];
  let body = model.body;
  if (model.kind === "json") {
    try { body = JSON.stringify(JSON.parse(model.body.join("\n")), null, 2).split("\n"); } catch { /* keep raw */ }
  }
  const cut = truncateMiddle(body, 20, 10);
  const out = [head, ...cut.lines.map((l) => fit(`  ${colorBody(model, l, theme)}`))];
  if (cut.hidden > 0) out.splice(1 + 20, 0, fit(theme.fg("muted", `  ${cut.hidden} lines hidden · Ctrl+O`)));
  return out;
}
