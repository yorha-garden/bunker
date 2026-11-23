import * as card from "./card-model.ts";
import { iconFile, resolveIconMode, type ToolName } from "./icons.ts";
import { renderCardLines, type CardTheme } from "./tool-cards.ts";
import type { TextMetrics } from "./text-width.ts";

export interface RenderComponent {
  invalidate(): void;
  render(width: number): readonly string[];
}

export interface RegisterToolCardsDeps {
  cwd: string;
  assetsDir: URL;
  env: NodeJS.ProcessEnv;
  metrics: TextMetrics;
  /** Pi's own definitions from createXToolDefinition(cwd); execute and schemas are kept untouched. */
  definitions: Record<ToolName, any>;
  /** Builds a Pi Image component for a PNG icon. */
  createImage: (
    base64: string,
    opts: { maxWidthCells: number; maxHeightCells: number; widthPx: number; heightPx: number; filename: string },
  ) => { render(width: number): readonly string[] };
  readFile?: (url: URL) => Buffer;
}

const ICON_PIXELS = 48;
const ICON_CELLS = 2;
const ICON_RENDER_WIDTH = 8;
const KITTY_PREFIX = "\x1b_G";
const ITERM2_PREFIX = "\x1b]1337;File=";
const EMPTY: RenderComponent = { invalidate() {}, render: () => [] };

const textOf = (result: { content?: Array<{ type: string; text?: string }> } | undefined): string =>
  (result?.content ?? []).map((c) => (c.type === "text" ? c.text ?? "" : "")).join("\n");

const str = (value: unknown): string => (typeof value === "string" ? value : "");
const num = (value: unknown): number | undefined => (typeof value === "number" ? value : undefined);

type Build = (args: any, text: string, result: any, opts: card.CardOpts) => card.CardModel;

const BUILDERS: Record<ToolName, Build> = {
  bash: (a, t, _r, o) => card.bashCard({ command: str(a.command) }, t, o),
  read: (a, t, _r, o) => card.readCard({ path: str(a.path), offset: num(a.offset), limit: num(a.limit) }, t, o),
  edit: (a, t, r, o) => card.editCard({ path: str(a.path) }, typeof r?.details?.diff === "string" ? r.details.diff : undefined, t, o),
  write: (a, t, _r, o) => card.writeCard({ path: str(a.path), content: str(a.content) }, t, o),
  grep: (a, t, _r, o) => card.grepCard({ pattern: str(a.pattern) }, t, o),
  find: (a, t, _r, o) => card.findCard({ pattern: str(a.pattern) }, t, o),
  // Pi's ls prints "(empty directory)" instead of an empty listing.
  ls: (a, t, _r, o) => card.lsCard({ path: str(a.path) || undefined }, t === "(empty directory)" ? "" : t, o),
};

export function registerToolCards(pi: { registerTool(tool: any): void }, deps: RegisterToolCardsDeps): void {
  const mode = resolveIconMode(deps.env.YORHA_ICONS, deps.env);
  const readFile = deps.readFile ?? (() => { throw new Error("readFile not provided"); });
  const iconData = new Map<ToolName, string | null>();

  const iconLines = (tool: ToolName): readonly string[] | undefined => {
    if (mode !== "image") return undefined;
    try {
      if (!iconData.has(tool)) iconData.set(tool, readFile(new URL(iconFile(tool), deps.assetsDir)).toString("base64"));
      const base64 = iconData.get(tool)!;
      const image = deps.createImage(base64, {
        maxWidthCells: ICON_CELLS, maxHeightCells: 1, widthPx: ICON_PIXELS, heightPx: ICON_PIXELS, filename: iconFile(tool),
      });
      const lines = image.render(ICON_RENDER_WIDTH);
      const first = lines[0] ?? "";
      const drawsImage = lines.length === 1 && (first.includes(KITTY_PREFIX) || first.includes(ITERM2_PREFIX));
      if (!drawsImage) return undefined;
      // Kitty draws with C=1, so the cursor stays put; step over the icon cells before the text.
      return [first.includes(KITTY_PREFIX) ? `${first}\x1b[${ICON_CELLS}C` : first];
    } catch {
      iconData.set(tool, null);
      return undefined;
    }
  };

  const cardComponent = (tool: ToolName, model: card.CardModel, theme: CardTheme, expanded: boolean, outputPad: number): RenderComponent => {
    let icon: readonly string[] | undefined;
    let iconResolved = false;
    return {
      invalidate() {},
      render(width: number): readonly string[] {
        if (!iconResolved) { icon = iconLines(tool); iconResolved = true; }
        const indent = " ".repeat(outputPad);
        const lines = renderCardLines(model, Math.max(1, width - outputPad), theme, { expanded, iconLines: icon, metrics: deps.metrics });
        return lines.map((line) => `${indent}${line}`);
      },
    };
  };

  for (const tool of Object.keys(BUILDERS) as ToolName[]) {
    const build = BUILDERS[tool];
    pi.registerTool({
      ...deps.definitions[tool],
      // Pi stacks renderCall above renderResult inside one shell. Own the shell and let exactly one of the two draw.
      renderShell: "self",
      renderCall(args: any, theme: CardTheme, context: any): RenderComponent {
        if (!context?.isPartial) return EMPTY;
        const model = build(args ?? {}, "", undefined, { isError: false, isPartial: true });
        return cardComponent(tool, model, theme, false, context.outputPad ?? 1);
      },
      renderResult(result: any, options: { expanded: boolean; isPartial: boolean }, theme: CardTheme, context: any): RenderComponent {
        if (options.isPartial) return EMPTY;
        const opts = { isError: Boolean(context?.isError), isPartial: false, durationMs: context?.durationMs };
        const model = build(context?.args ?? {}, textOf(result), result, opts);
        return cardComponent(tool, model, theme, options.expanded, context?.outputPad ?? 1);
      },
    });
  }
}
