export interface TextMetrics {
  visibleWidth(text: string): number;
  truncateToWidth(text: string, width: number, ellipsis?: string): string;
}

const SGR = /\x1b\[[0-9;]*m/g;
const RESET = "\x1b[0m";

function visibleWidth(text: string): number {
  return [...text.replace(SGR, "")].length;
}

function truncateToWidth(text: string, width: number, ellipsis = ""): string {
  if (visibleWidth(text) <= width) return text;
  const limit = Math.max(0, width - visibleWidth(ellipsis));
  let out = "";
  let used = 0;
  let styled = false;
  let i = 0;
  while (i < text.length) {
    SGR.lastIndex = i;
    const sgr = SGR.exec(text);
    if (sgr && sgr.index === i) {
      out += sgr[0];
      styled = true;
      i += sgr[0].length;
      continue;
    }
    if (used >= limit) break;
    const char = String.fromCodePoint(text.codePointAt(i)!);
    out += char;
    used += 1;
    i += char.length;
  }
  return `${out}${styled ? RESET : ""}${ellipsis}`;
}

/** Test-only fallback that counts code points; production code must inject Pi's visibleWidth/truncateToWidth. */
export const defaultMetrics: TextMetrics = { visibleWidth, truncateToWidth };
