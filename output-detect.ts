export type OutputKind = "diff" | "json" | "test" | "error" | "text";

const TEST_NODE = /^ℹ (?:pass|fail) \d+/m;
const TEST_PY = /\d+ (?:passed|failed)/;
const ERROR_RE = /^(?:Traceback \(most recent call last\)|(?:\w+)?Error:|error(?:\[\w+\])?:|fatal:|npm ERR!|panic:)/im;

export function detectOutput(text: string): OutputKind {
  const trimmed = text.trim();
  if (!trimmed) return "text";
  if (/^(?:--- |\+\+\+ |@@ )/m.test(trimmed) && /^[+-]/m.test(trimmed)) return "diff";
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try { JSON.parse(trimmed); return "json"; } catch { /* fall through */ }
  }
  if (TEST_NODE.test(trimmed) || TEST_PY.test(trimmed)) return "test";
  if (ERROR_RE.test(trimmed)) return "error";
  return "text";
}

export function summarizeTests(text: string): string | undefined {
  const node = { pass: /^ℹ pass (\d+)/m.exec(text), fail: /^ℹ fail (\d+)/m.exec(text) };
  let passed: number | undefined;
  let failed: number | undefined;
  if (node.pass || node.fail) {
    passed = node.pass ? Number(node.pass[1]) : 0;
    failed = node.fail ? Number(node.fail[1]) : 0;
  } else {
    const p = /(\d+) passed/.exec(text);
    const f = /(\d+) failed/.exec(text);
    if (!p && !f) return undefined;
    passed = p ? Number(p[1]) : 0;
    failed = f ? Number(f[1]) : 0;
  }
  return failed > 0 ? `${failed} failed · ${passed} passed` : `${passed} passed`;
}

export function parseExitCode(text: string): number | undefined {
  const match = /Command exited with code (\d+)/.exec(text);
  return match ? Number(match[1]) : undefined;
}

export function truncateMiddle(lines: readonly string[], head = 20, tail = 10): { lines: string[]; hidden: number } {
  if (lines.length <= head + tail) return { lines: [...lines], hidden: 0 };
  return { lines: [...lines.slice(0, head), ...lines.slice(lines.length - tail)], hidden: lines.length - head - tail };
}
