import { Markdown, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

const PATCH = Symbol.for("yorha-bunker.code-panel-renderer");
const DEEP_BG = "\x1b[48;2;19;19;23m";
const RESET_BG = "\x1b[49m";

function panelLabel(language: unknown): string {
  if (typeof language !== "string" || !language.trim()) return "TEXT";
  return language.trim().split(/\s+/)[0]!.replace(/[^a-zA-Z0-9_+.#-]/g, "").toUpperCase().slice(0, 20) || "TEXT";
}

function withDeepBackground(text: string): string {
  return DEEP_BG + text.replace(/\x1b\[0m/g, `\x1b[0m${DEEP_BG}`) + RESET_BG;
}

export function installCodePanelRenderer(): () => void {
  const prototype = Markdown.prototype as any;
  const prior = prototype[PATCH] as { original: Function; patched?: Function } | undefined;
  const original = prior?.original ?? prototype.renderToken;

  const patched = function (this: any, token: any, width: number, nextTokenType?: string): string[] {
    if (token?.type !== "code") return original.call(this, token, width, nextTokenType);

    const label = panelLabel(token.lang);
    const panelWidth = Math.max(8, width);
    const topPrefix = `┌─ ${label} `;
    const top = topPrefix + "─".repeat(Math.max(1, panelWidth - visibleWidth(topPrefix) - 1)) + "┐";
    const bottom = "└" + "─".repeat(Math.max(1, panelWidth - 2)) + "┘";
    const innerWidth = Math.max(1, panelWidth - 4);
    const highlighted = this.theme.highlightCode
      ? this.theme.highlightCode(token.text, token.lang)
      : token.text.split("\n").map((line: string) => this.theme.codeBlock(line));
    const lines = [withDeepBackground(this.theme.codeBlockBorder(top))];

    for (const sourceLine of highlighted) {
      const wrapped = wrapTextWithAnsi(sourceLine, innerWidth);
      for (const part of wrapped.length > 0 ? wrapped : [""]) {
        const clipped = truncateToWidth(part, innerWidth, "");
        const padding = " ".repeat(Math.max(0, innerWidth - visibleWidth(clipped)));
        const left = this.theme.codeBlockBorder("│ ");
        const right = this.theme.codeBlockBorder(" │");
        lines.push(withDeepBackground(left + clipped + padding + right));
      }
    }
    lines.push(withDeepBackground(this.theme.codeBlockBorder(bottom)));
    if (nextTokenType && nextTokenType !== "space") lines.push("");
    return lines;
  };

  prototype[PATCH] = { original, patched };
  prototype.renderToken = patched;
  return () => {
    if (prototype.renderToken === patched) prototype.renderToken = original;
    if (prototype[PATCH]?.patched === patched) prototype[PATCH] = { original };
  };
}
