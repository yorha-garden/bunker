const PATCH = Symbol.for("yorha-bunker.tool-output-affordance");
const EXPAND_HINT = /(ctrl\+o)((?:\x1b\[[0-9;]*m)*\s+)to expand\b/gi;
const ANSI = /\x1b\[[0-9;]*m/g;

function visibleWidth(text: string): number {
  return text.replace(ANSI, "").length;
}

export function clickFriendlyExpandHint(text: string, maxWidth?: number): string {
  if (/click output\s*\//i.test(text)) return text;
  const next = text.replace(EXPAND_HINT, (_match, key: string, separator: string) => {
    const prefix = key[0] === key[0]?.toUpperCase() ? "Click output" : "click output";
    return `${prefix} / ${key}${separator}to expand`;
  });
  return maxWidth !== undefined && visibleWidth(next) > maxWidth ? text : next;
}

export function installToolOutputAffordance(TextClass: { prototype: { render(width: number): readonly string[] } }): () => void {
  const prototype = TextClass.prototype as any;
  const prior = prototype[PATCH] as { original: Function; patched?: Function } | undefined;
  const original = prior?.original ?? prototype.render;

  const patched = function (this: unknown, width: number): readonly string[] {
    return (original.call(this, width) as readonly string[]).map((line: string) => clickFriendlyExpandHint(line, width));
  };

  prototype[PATCH] = { original, patched };
  prototype.render = patched;
  return () => {
    if (prototype.render === patched) prototype.render = original;
    if (prototype[PATCH]?.patched === patched) prototype[PATCH] = { original };
  };
}
