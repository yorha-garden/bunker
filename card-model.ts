import { detectOutput, parseExitCode, summarizeTests, type OutputKind } from "./output-detect.ts";

export type CardStatus = "running" | "ok" | "fail";
export interface CardOpts { isError: boolean; isPartial: boolean; durationMs?: number }
export interface CardModel {
  tool: "bash" | "read" | "edit" | "write" | "grep" | "find" | "ls";
  arg: string;
  status: CardStatus;
  summary: string;
  duration?: string;
  autoExpand: boolean;
  kind: OutputKind;
  body: string[];
}

export function formatDuration(ms?: number): string | undefined {
  if (ms === undefined) return undefined;
  if (Math.round(ms) < 1000) return `${Math.round(ms)}ms`;
  const tenths = Math.round(ms / 100);
  if (tenths < 600) return `${(tenths / 10).toFixed(1)}s`;
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}m${seconds % 60}s`;
}

const status = (o: CardOpts): CardStatus => (o.isPartial ? "running" : o.isError ? "fail" : "ok");
const lines = (text: string): string[] => (text ? text.replace(/\n+$/, "").split("\n") : []);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function bashCard(args: { command: string }, text: string, o: CardOpts): CardModel {
  const st = status(o);
  const kind = detectOutput(text);
  let summary: string;
  if (st === "running") summary = "running";
  else if (st === "fail") summary = `exit ${parseExitCode(text) ?? 1}`;
  else {
    const tests = summarizeTests(text);
    summary = tests ? `exit 0 · ${tests}` : "exit 0";
  }
  const hasError = kind === "error" || (kind === "test" && /failed/.test(summarizeTests(text) ?? ""));
  return {
    tool: "bash", arg: args.command.split("\n")[0], status: st, summary,
    duration: formatDuration(o.durationMs), autoExpand: st === "fail" || hasError, kind, body: lines(text),
  };
}

export function readCard(args: { path: string; offset?: number; limit?: number }, text: string, o: CardOpts): CardModel {
  const n = lines(text).length;
  const from = args.offset ? ` · from ${args.offset}` : "";
  return {
    tool: "read", arg: args.path, status: status(o), summary: `${plural(n, "line")}${from}`,
    duration: formatDuration(o.durationMs), autoExpand: false, kind: "text", body: lines(text),
  };
}

export function editCard(args: { path: string }, diff: string | undefined, text: string, o: CardOpts): CardModel {
  const st = status(o);
  if (st === "fail" || !diff) {
    return {
      tool: "edit", arg: args.path, status: st, summary: text.split("\n")[0] || "edit failed",
      duration: formatDuration(o.durationMs), autoExpand: st === "fail", kind: "error", body: lines(text),
    };
  }
  const dl = lines(diff);
  const add = dl.filter((l) => l.startsWith("+") && !l.startsWith("+++")).length;
  const del = dl.filter((l) => l.startsWith("-") && !l.startsWith("---")).length;
  return {
    tool: "edit", arg: args.path, status: st, summary: `+${add} −${del}`,
    duration: formatDuration(o.durationMs), autoExpand: true, kind: "diff", body: dl,
  };
}

export function writeCard(args: { path: string; content: string }, text: string, o: CardOpts): CardModel {
  const st = status(o);
  const body = lines(args.content);
  return {
    tool: "write", arg: args.path, status: st,
    summary: st === "fail" ? text.split("\n")[0] || "write failed" : plural(body.length, "line"),
    duration: formatDuration(o.durationMs), autoExpand: true, kind: st === "fail" ? "error" : "text", body,
  };
}

export function grepCard(args: { pattern: string }, text: string, o: CardOpts): CardModel {
  const matches = lines(text).filter((l) => /^.+?:\d+:/.test(l));
  const files = new Map<string, string[]>();
  for (const m of matches) {
    const file = m.slice(0, m.indexOf(":"));
    (files.get(file) ?? files.set(file, []).get(file)!).push(m.slice(file.length + 1));
  }
  const body: string[] = [];
  let shown = 0;
  for (const [file, ms] of files) {
    if (shown >= 8) break;
    body.push(file);
    for (const m of ms) { if (shown >= 8) break; body.push(`  ${m}`); shown++; }
  }
  if (matches.length > shown) body.push(`… ${plural(matches.length - shown, "more match", "more matches")}`);
  const summary = matches.length === 0 ? "0 matches" : `${plural(matches.length, "match", "matches")} in ${plural(files.size, "file")}`;
  return {
    tool: "grep", arg: `"${args.pattern}"`, status: status(o), summary,
    duration: formatDuration(o.durationMs), autoExpand: matches.length > 0, kind: "text", body,
  };
}

// Pi's find and ls append "\n\n[<N> results|entries limit reached...]" or "[<size> limit reached]".
const LIMIT_NOTICE = /\n\n(\[[^\n]*limit reached[^\n]*\])\s*$/;
const splitNotice = (text: string): { listing: string; notice: string[] } => {
  const match = LIMIT_NOTICE.exec(text);
  return match ? { listing: text.slice(0, match.index), notice: [match[1]] } : { listing: text, notice: [] };
};

export function findCard(args: { pattern: string }, text: string, o: CardOpts): CardModel {
  const { listing, notice } = splitNotice(text);
  const l = lines(listing).filter((x) => x && !/^No files found/i.test(x));
  return {
    tool: "find", arg: args.pattern, status: status(o), summary: plural(l.length, "result"),
    duration: formatDuration(o.durationMs), autoExpand: false, kind: "text", body: [...l, ...notice],
  };
}

export function lsCard(args: { path?: string }, text: string, o: CardOpts): CardModel {
  const { listing, notice } = splitNotice(text);
  const l = lines(listing);
  return {
    tool: "ls", arg: args.path ?? ".", status: status(o), summary: plural(l.length, "entry", "entries"),
    duration: formatDuration(o.durationMs), autoExpand: false, kind: "text", body: [...l, ...notice],
  };
}
