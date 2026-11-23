# Tool Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render built-in `bash`, `read`, `edit`, `write`, `grep`, `find`, `ls` tool calls as hybrid collapsed/expanded cards with Pixelarticons icons in Ghostty.

**Architecture:** Pure, unit-tested modules (`output-detect.ts`, `card-model.ts`, `icons.ts`) compute what a card says. `tool-cards.ts` turns a `CardModel` into width-safe terminal lines. `index.ts` re-registers each built-in tool with `...createXToolDefinition(cwd)` and overrides only `renderCall`/`renderResult`.

**Tech Stack:** TypeScript (Node `--test`, type stripping, `.ts` import suffixes), `@earendil-works/pi-coding-agent` 1.6.0, `@earendil-works/pi-tui` (`Image`, `Text`, `truncateToWidth`, `visibleWidth`), Python 3 + Pillow for icon rasterizing.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-11-23-tool-cards-design.md`. Branch `feat/tool-cards`; PR to `main`; sync installed copy after merge.
- `render()` returns `readonly string[]` and never mutates cached arrays (Pi 1.6.0).
- Every rendered line is truncated to terminal width (`fit` = `truncateToWidth(text, Math.max(1, width), "")`).
- Narrow widths drop icon first, then duration, then summary, before clipping the command.
- Collapsed card = one line: `<icon> <status> <TOOL>  <arg> · <duration> · <summary>`.
- Auto-expand: bash exit != 0 or error output; edit (diff); write (first lines); grep (max 8 matches grouped by file). Never: read, find, ls.
- Long bodies: first 20 / last 10 lines, then `N lines hidden · Ctrl+O`.
- Panel background `#131317`; theme colors via `theme.fg("success"|"error"|"accent"|"dim"|"muted"|"toolTitle", ...)`.
- Detector is heuristic and falls back to plain text. Headers show the command as written (no redaction).
- Tests: `node --test tests/*.test.ts` must stay green (41 passing before this plan).
- Spec deviations (both simplifications, noted in spec Task 6): status (`✓ ✗ ⟳`) is a colored text glyph, not an image, so only 7 tool icons are rasterized; icon mode is chosen by env var `YORHA_ICONS=image|glyph|auto` (default `auto`) instead of a `settings.json` key, which Pi's settings schema may reject.

## File Structure

- Create `output-detect.ts` — `detectOutput`, `summarizeTests`, `parseExitCode`, `truncateMiddle`.
- Create `card-model.ts` — `CardModel`, `formatDuration`, one `xxxCard()` per tool.
- Create `icons.ts` — `IconName`, `GLYPHS`, `resolveIconMode`.
- Create `tool-cards.ts` — `renderCardLines(model, width, theme, icon)`, `createCardComponent`, `registerToolCards(pi, deps)`.
- Create `scripts/build-icons.py` — rasterize SVG -> `assets/generated/tool-<name>.png`.
- Modify `index.ts` — call `registerToolCards`; `install.sh` already copies `assets/generated/*.png`.
- Tests: `tests/output-detect.test.ts`, `tests/card-model.test.ts`, `tests/icons.test.ts`, `tests/tool-cards.test.ts`.

---

### Task 1: Output detector

**Files:**
- Create: `output-detect.ts`
- Test: `tests/output-detect.test.ts`

**Interfaces:**
- Produces: `type OutputKind = "diff"|"json"|"test"|"error"|"text"`; `detectOutput(text: string): OutputKind`; `summarizeTests(text: string): string | undefined`; `parseExitCode(text: string): number | undefined`; `truncateMiddle(lines: readonly string[], head?: number, tail?: number): { lines: string[]; hidden: number }`.

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { detectOutput, parseExitCode, summarizeTests, truncateMiddle } from "../output-detect.ts";

test("detects diff, json, test, error, text", () => {
  assert.equal(detectOutput("--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b"), "diff");
  assert.equal(detectOutput('{"a": 1, "b": [2]}'), "json");
  assert.equal(detectOutput("ℹ tests 41\nℹ pass 41\nℹ fail 0"), "test");
  assert.equal(detectOutput("Traceback (most recent call last):\n  File x\nValueError: no"), "error");
  assert.equal(detectOutput("Error: ENOENT: no such file"), "error");
  assert.equal(detectOutput("hello\nworld"), "text");
  assert.equal(detectOutput(""), "text");
});

test("invalid JSON-looking text is plain text", () => {
  assert.equal(detectOutput("{not json"), "text");
});

test("summarizes node and pytest style results", () => {
  assert.equal(summarizeTests("ℹ tests 41\nℹ pass 41\nℹ fail 0"), "41 passed");
  assert.equal(summarizeTests("ℹ tests 41\nℹ pass 39\nℹ fail 2"), "2 failed · 39 passed");
  assert.equal(summarizeTests("===== 3 passed, 1 failed in 0.2s ====="), "1 failed · 3 passed");
  assert.equal(summarizeTests("nothing"), undefined);
});

test("parses exit code from Pi bash status line", () => {
  assert.equal(parseExitCode("boom\n\nCommand exited with code 2"), 2);
  assert.equal(parseExitCode("ok"), undefined);
});

test("truncateMiddle keeps head and tail", () => {
  const lines = Array.from({ length: 50 }, (_, i) => `l${i}`);
  const out = truncateMiddle(lines, 20, 10);
  assert.equal(out.hidden, 20);
  assert.equal(out.lines.length, 30);
  assert.equal(out.lines[0], "l0");
  assert.equal(out.lines.at(-1), "l49");
  assert.deepEqual(truncateMiddle(["a", "b"], 20, 10), { lines: ["a", "b"], hidden: 0 });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/output-detect.test.ts`
Expected: FAIL (cannot find module `../output-detect.ts`).

- [ ] **Step 3: Write minimal implementation**

```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/output-detect.test.ts`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Commit**

```bash
git add output-detect.ts tests/output-detect.test.ts
git commit -m "feat: add tool output detector"
```

---

### Task 2: Card model (per-tool summaries and collapse policy)

**Files:**
- Create: `card-model.ts`
- Test: `tests/card-model.test.ts`

**Interfaces:**
- Consumes: `detectOutput`, `summarizeTests`, `parseExitCode`, `OutputKind` from `output-detect.ts`.
- Produces:
  ```ts
  export type CardStatus = "running" | "ok" | "fail";
  export interface CardOpts { isError: boolean; isPartial: boolean; durationMs?: number }
  export interface CardModel {
    tool: "bash"|"read"|"edit"|"write"|"grep"|"find"|"ls";
    arg: string; status: CardStatus; summary: string; duration?: string;
    autoExpand: boolean; kind: OutputKind; body: string[];
  }
  export function formatDuration(ms?: number): string | undefined;
  export function bashCard(args: { command: string }, text: string, o: CardOpts): CardModel;
  export function readCard(args: { path: string; offset?: number; limit?: number }, text: string, o: CardOpts): CardModel;
  export function editCard(args: { path: string }, diff: string | undefined, text: string, o: CardOpts): CardModel;
  export function writeCard(args: { path: string; content: string }, text: string, o: CardOpts): CardModel;
  export function grepCard(args: { pattern: string }, text: string, o: CardOpts): CardModel;
  export function findCard(args: { pattern: string }, text: string, o: CardOpts): CardModel;
  export function lsCard(args: { path?: string }, text: string, o: CardOpts): CardModel;
  ```
  `body` is plain text lines (no ANSI); `tool-cards.ts` colors them.

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { bashCard, editCard, findCard, formatDuration, grepCard, lsCard, readCard, writeCard } from "../card-model.ts";

const ok = { isError: false, isPartial: false, durationMs: 2100 };

test("formatDuration is compact", () => {
  assert.equal(formatDuration(undefined), undefined);
  assert.equal(formatDuration(450), "450ms");
  assert.equal(formatDuration(2100), "2.1s");
  assert.equal(formatDuration(75000), "1m15s");
});

test("bash success collapses with test summary", () => {
  const c = bashCard({ command: "npm test" }, "ℹ tests 41\nℹ pass 41\nℹ fail 0", ok);
  assert.equal(c.status, "ok");
  assert.equal(c.autoExpand, false);
  assert.equal(c.summary, "exit 0 · 41 passed");
  assert.equal(c.duration, "2.1s");
});

test("bash failure auto-expands with exit code", () => {
  const c = bashCard({ command: "false" }, "boom\n\nCommand exited with code 2", { ...ok, isError: true });
  assert.equal(c.status, "fail");
  assert.equal(c.autoExpand, true);
  assert.equal(c.summary, "exit 2");
});

test("bash running", () => {
  const c = bashCard({ command: "sleep 9" }, "", { isError: false, isPartial: true });
  assert.equal(c.status, "running");
  assert.equal(c.summary, "running");
});

test("bash success with error-looking output still auto-expands", () => {
  const c = bashCard({ command: "x" }, "Traceback (most recent call last):\nValueError: no", ok);
  assert.equal(c.autoExpand, true);
});

test("read summary and range", () => {
  const c = readCard({ path: "a.ts", offset: 10, limit: 5 }, "1\n2\n3\n4\n5", ok);
  assert.equal(c.summary, "5 lines · from 10");
  assert.equal(c.autoExpand, false);
});

test("edit counts diff lines and always expands", () => {
  const diff = "--- a\n+++ b\n@@ -1,2 +1,2 @@\n-x\n+y\n+z";
  const c = editCard({ path: "a.ts" }, diff, "", ok);
  assert.equal(c.summary, "+2 −1");
  assert.equal(c.autoExpand, true);
  assert.equal(c.kind, "diff");
});

test("edit error is a failed card", () => {
  const c = editCard({ path: "a.ts" }, undefined, "Error: could not find text", { ...ok, isError: true });
  assert.equal(c.status, "fail");
  assert.equal(c.summary, "Error: could not find text");
});

test("write reports line count and expands first lines", () => {
  const c = writeCard({ path: "n.md", content: "a\nb\nc" }, "Successfully wrote", ok);
  assert.equal(c.summary, "3 lines");
  assert.equal(c.autoExpand, true);
  assert.deepEqual(c.body, ["a", "b", "c"]);
});

test("grep groups matches by file, max 8 shown", () => {
  const out = Array.from({ length: 12 }, (_, i) => `f${i % 3}.ts:${i + 1}:render`).join("\n");
  const c = grepCard({ pattern: "render" }, out, ok);
  assert.equal(c.summary, "12 matches in 3 files");
  assert.equal(c.autoExpand, true);
  assert.equal(c.body.length <= 8 + 3 + 1, true);
});

test("grep with no matches collapses", () => {
  const c = grepCard({ pattern: "zzz" }, "No matches found", ok);
  assert.equal(c.summary, "0 matches");
  assert.equal(c.autoExpand, false);
});

test("find and ls count results", () => {
  assert.equal(findCard({ pattern: "*.ts" }, "a.ts\nb.ts", ok).summary, "2 results");
  assert.equal(lsCard({ path: "." }, "a\nb\nc", ok).summary, "3 entries");
  assert.equal(findCard({ pattern: "*.ts" }, "a.ts", ok).autoExpand, false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/card-model.test.ts`
Expected: FAIL (cannot find module `../card-model.ts`).

- [ ] **Step 3: Write minimal implementation**

```ts
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
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s`;
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
  if (matches.length > shown) body.push(`… ${matches.length - shown} more matches`);
  const summary = matches.length === 0 ? "0 matches" : `${plural(matches.length, "match", "matches")} in ${plural(files.size, "file")}`;
  return {
    tool: "grep", arg: `"${args.pattern}"`, status: status(o), summary,
    duration: formatDuration(o.durationMs), autoExpand: matches.length > 0, kind: "text", body,
  };
}

export function findCard(args: { pattern: string }, text: string, o: CardOpts): CardModel {
  const l = lines(text).filter((x) => x && !/^No files found/i.test(x));
  return {
    tool: "find", arg: args.pattern, status: status(o), summary: plural(l.length, "result"),
    duration: formatDuration(o.durationMs), autoExpand: false, kind: "text", body: l,
  };
}

export function lsCard(args: { path?: string }, text: string, o: CardOpts): CardModel {
  const l = lines(text);
  return {
    tool: "ls", arg: args.path ?? ".", status: status(o), summary: plural(l.length, "entry", "entries"),
    duration: formatDuration(o.durationMs), autoExpand: false, kind: "text", body: l,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/card-model.test.ts`
Expected: PASS (all tests). If the grep body-length assertion fails, fix `grepCard`, not the test.

- [ ] **Step 5: Commit**

```bash
git add card-model.ts tests/card-model.test.ts
git commit -m "feat: add tool card model and collapse policy"
```

---

### Task 3: Icon registry and mode selection

**Files:**
- Create: `icons.ts`
- Test: `tests/icons.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ToolName = "bash"|"read"|"edit"|"write"|"grep"|"find"|"ls";
  export type IconMode = "image" | "glyph";
  export const GLYPHS: Record<ToolName, string>;       // glyph fallbacks, 1 cell each
  export const STATUS_GLYPH: Record<"running"|"ok"|"fail", string>;
  export function iconFile(tool: ToolName): string;   // "tool-bash.png"
  export function resolveIconMode(setting: string | undefined, env: { TERM_PROGRAM?: string; TERM?: string }): IconMode;
  ```

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { GLYPHS, STATUS_GLYPH, iconFile, resolveIconMode } from "../icons.ts";

test("auto picks image only on Ghostty/kitty terminals", () => {
  assert.equal(resolveIconMode(undefined, { TERM_PROGRAM: "ghostty" }), "image");
  assert.equal(resolveIconMode("auto", { TERM: "xterm-kitty" }), "image");
  assert.equal(resolveIconMode("auto", { TERM_PROGRAM: "Apple_Terminal" }), "glyph");
  assert.equal(resolveIconMode("", {}), "glyph");
});

test("explicit setting wins over detection", () => {
  assert.equal(resolveIconMode("glyph", { TERM_PROGRAM: "ghostty" }), "glyph");
  assert.equal(resolveIconMode("image", {}), "image");
  assert.equal(resolveIconMode("bogus", { TERM_PROGRAM: "ghostty" }), "image");
});

test("every tool has a one-cell glyph and an icon file", () => {
  for (const tool of ["bash", "read", "edit", "write", "grep", "find", "ls"] as const) {
    assert.equal([...GLYPHS[tool]].length, 1);
    assert.equal(iconFile(tool), `tool-${tool}.png`);
  }
  assert.deepEqual(Object.keys(STATUS_GLYPH).sort(), ["fail", "ok", "running"]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/icons.test.ts`
Expected: FAIL (cannot find module `../icons.ts`).

- [ ] **Step 3: Write minimal implementation**

```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/icons.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add icons.ts tests/icons.test.ts
git commit -m "feat: add tool icon registry and mode selection"
```

---

### Task 4: Icon assets

**Files:**
- Create: `scripts/build-icons.py`, `assets/pixelarticons/{file,edit,file-plus,search,folder}.svg` (as available), `assets/generated/tool-{bash,read,edit,write,grep,find,ls}.png`
- Test: `tests/test_icons_assets.py`

**Interfaces:**
- Consumes: `icons.ts` file naming (`tool-<name>.png`).
- Produces: seven 48×48 RGBA PNGs, drawn in the theme `amber` (`#BC9A5A`).

- [ ] **Step 1: Write the failing test**

```python
#!/usr/bin/env python3
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ["bash", "read", "edit", "write", "grep", "find", "ls"]

for tool in TOOLS:
    path = ROOT / "assets" / "generated" / f"tool-{tool}.png"
    assert path.exists(), f"missing {path.name}"
    img = Image.open(path)
    assert img.size == (48, 48), f"{path.name} size {img.size}"
    assert img.mode == "RGBA", f"{path.name} mode {img.mode}"
    assert any(px[3] > 0 for px in img.getdata()), f"{path.name} is empty"
print("icon assets ok")
```

- [ ] **Step 2: Run to verify it fails**

Run: `python3 tests/test_icons_assets.py`
Expected: FAIL with `missing tool-bash.png`.

- [ ] **Step 3: Fetch SVGs and write the rasterizer**

Fetch Pixelarticons and choose icons (names must be verified, not guessed):

```bash
cd "$(mktemp -d)" && npm pack pixelarticons --silent && tar xzf pixelarticons-*.tgz
ls package/svg | grep -E '^(terminal|file|edit|file-plus|search|folder|zoom)' | head -30
```

Copy the `-sharp` variant if the repo already uses sharp (`terminal-sharp.svg` exists). Mapping: bash→`terminal-sharp`, read→`file-sharp`, edit→`edit-sharp`, write→`file-plus-sharp`, grep→`search-sharp`, find→`zoom-in-sharp` (or nearest search variant), ls→`folder-sharp`. If a name differs, pick the closest listed and record the mapping in the script's `ICONS` dict. Copy chosen SVGs plus keep `assets/pixelarticons/LICENSE`.

`scripts/build-icons.py` (Pixelarticons paths use only `M h v z` with absolute `M` and relative `h`/`v`, i.e. axis-aligned rectangles):

```python
#!/usr/bin/env python3
import re
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
COLOR = (0xBC, 0x9A, 0x5A, 255)  # theme amber
SCALE = 2  # 24 -> 48 px
ICONS = {
    "bash": "terminal-sharp", "read": "file-sharp", "edit": "edit-sharp", "write": "file-plus-sharp",
    "grep": "search-sharp", "find": "zoom-in-sharp", "ls": "folder-sharp",
}

def rects(d: str):
    for sub in re.findall(r"M[^M]*", d):
        x, y = map(float, re.match(r"M(-?[\d.]+)[ ,](-?[\d.]+)", sub).groups())
        cx, cy = x, y
        pts = [(x, y)]
        for cmd, val in re.findall(r"([hvHV])\s*(-?[\d.]+)", sub):
            v = float(val)
            if cmd == "h": cx += v
            elif cmd == "H": cx = v
            elif cmd == "v": cy += v
            else: cy = v
            pts.append((cx, cy))
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        yield min(xs), min(ys), max(xs), max(ys)

for tool, name in ICONS.items():
    svg = (ROOT / "assets" / "pixelarticons" / f"{name}.svg").read_text()
    img = Image.new("RGBA", (24 * SCALE, 24 * SCALE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    for d in re.findall(r'\sd="([^"]+)"', svg):
        for x0, y0, x1, y1 in rects(d):
            draw.rectangle([x0 * SCALE, y0 * SCALE, x1 * SCALE - 1, y1 * SCALE - 1], fill=COLOR)
    img.save(ROOT / "assets" / "generated" / f"tool-{tool}.png")
print("built", len(ICONS), "icons")
```

Run: `python3 scripts/build-icons.py`
If an icon path uses curves/diagonals (not just rectangles) the result will look wrong: open the PNG (`read` tool on the file) and, for any bad icon, choose a different Pixelarticons icon.

- [ ] **Step 4: Run to verify it passes, then eyeball**

Run: `python3 tests/test_icons_assets.py` — Expected: `icon assets ok`.
Then `read` each `assets/generated/tool-*.png` and confirm it is a recognizable shape.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-icons.py assets tests/test_icons_assets.py
git commit -m "feat: add Pixelarticons tool icons"
```

---

### Task 5: Card renderer

**Files:**
- Create: `tool-cards.ts`
- Test: `tests/tool-cards.test.ts`

**Interfaces:**
- Consumes: `CardModel` (Task 2), `GLYPHS`, `STATUS_GLYPH` (Task 3), `truncateMiddle` (Task 1).
- Produces:
  ```ts
  export interface CardTheme { fg(color: string, text: string): string; bold(text: string): string }
  export function renderCardLines(model: CardModel, width: number, theme: CardTheme, opts: { expanded: boolean; iconLines?: readonly string[] }): string[];
  ```
  `iconLines` is the pre-rendered Kitty image rows (width 2 cells). When absent, a text glyph is used. When provided and its length is not 1, the glyph is used instead (spec fallback for tall icons).

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { bashCard, editCard } from "../card-model.ts";
import { renderCardLines } from "../tool-cards.ts";

const theme = { fg: (_c: string, t: string) => t, bold: (t: string) => t };
const ok = { isError: false, isPartial: false, durationMs: 2100 };

test("collapsed bash card is one line with summary", () => {
  const lines = renderCardLines(bashCard({ command: "npm test" }, "ℹ pass 41\nℹ fail 0", ok), 100, theme, { expanded: false });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /✓ BASH\s+npm test · 2\.1s · exit 0 · 41 passed/);
});

test("failed bash auto-expands even when not user-expanded", () => {
  const card = bashCard({ command: "x" }, "boom\n\nCommand exited with code 2", { ...ok, isError: true });
  const lines = renderCardLines(card, 100, theme, { expanded: false });
  assert.equal(lines[0].includes("✗ BASH"), true);
  assert.equal(lines.some((l) => l.includes("boom")), true);
});

test("user expansion shows body for a successful bash", () => {
  const card = bashCard({ command: "ls" }, "a\nb", ok);
  assert.equal(renderCardLines(card, 100, theme, { expanded: false }).length, 1);
  assert.equal(renderCardLines(card, 100, theme, { expanded: true }).length > 1, true);
});

test("every line fits the width, with narrow degradation", () => {
  const card = bashCard({ command: "a-very-long-command --with --many --flags and more words here" }, "ℹ pass 1\nℹ fail 0", ok);
  for (const width of [120, 80, 50, 30, 12, 1]) {
    for (const l of renderCardLines(card, width, theme, { expanded: true })) {
      assert.equal(visibleWidth(l) <= Math.max(1, width), true, `width ${width}: ${JSON.stringify(l)}`);
    }
  }
  const narrow = renderCardLines(card, 50, theme, { expanded: false })[0];
  assert.equal(narrow.includes("2.1s"), false);
});

test("long bodies show hidden-lines notice", () => {
  const body = Array.from({ length: 60 }, (_, i) => `line ${i}`).join("\n");
  const lines = renderCardLines(bashCard({ command: "x" }, body, ok), 100, theme, { expanded: true });
  assert.equal(lines.some((l) => l.includes("30 lines hidden")), true);
});

test("edit renders diff with colors requested for + and -", () => {
  const colors: string[] = [];
  const t = { fg: (c: string, s: string) => { colors.push(c); return s; }, bold: (s: string) => s };
  renderCardLines(editCard({ path: "a" }, "--- a\n+++ b\n@@ @@\n-x\n+y", "", ok), 100, t, { expanded: false });
  assert.equal(colors.includes("success") && colors.includes("error"), true);
});

test("image icon is used only when it is exactly one row", () => {
  const card = bashCard({ command: "x" }, "", ok);
  const withImage = renderCardLines(card, 100, theme, { expanded: false, iconLines: ["<IMG>"] })[0];
  assert.equal(withImage.startsWith("<IMG>"), true);
  const tall = renderCardLines(card, 100, theme, { expanded: false, iconLines: ["a", "b"] })[0];
  assert.equal(tall.includes("<IMG>") || tall.startsWith("a"), false);
});
```

Note: `visibleWidth` of an image escape sequence is not meaningful; the width test passes `iconLines` only in the last test, which does not check width.

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/tool-cards.test.ts`
Expected: FAIL (cannot find module `../tool-cards.ts`).

- [ ] **Step 3: Write minimal implementation**

```ts
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { CardModel } from "./card-model.ts";
import { GLYPHS, STATUS_GLYPH } from "./icons.ts";
import { truncateMiddle } from "./output-detect.ts";

export interface CardTheme { fg(color: string, text: string): string; bold(text: string): string }

const fit = (text: string, width: number) => truncateToWidth(text, Math.max(1, width), "");
const STATUS_COLOR = { running: "warning", ok: "success", fail: "error" } as const;

function header(model: CardModel, width: number, theme: CardTheme, iconLines?: readonly string[]): string {
  const useImage = iconLines !== undefined && iconLines.length === 1;
  const icon = useImage ? `${iconLines![0]} ` : `${theme.fg("accent", GLYPHS[model.tool])} `;
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
    // image escape sequences have unreliable visibleWidth; measure with the glyph stand-in
    const measured = a.icon && useImage ? build({ ...a, icon: false }) + "  " : candidate;
    if (visibleWidth(measured) <= width) return candidate;
  }
  return fit(build(attempts[3]), width);
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
  opts: { expanded: boolean; iconLines?: readonly string[] },
): string[] {
  const head = header(model, width, theme, opts.iconLines);
  const show = opts.expanded || model.autoExpand;
  if (!show || model.status === "running" || model.body.length === 0) return [head];
  let body = model.body;
  if (model.kind === "json") {
    try { body = JSON.stringify(JSON.parse(model.body.join("\n")), null, 2).split("\n"); } catch { /* keep raw */ }
  }
  const cut = truncateMiddle(body, 20, 10);
  const out = [head, ...cut.lines.map((l) => fit(`  ${colorBody(model, l, theme)}`, width))];
  if (cut.hidden > 0) out.splice(1 + 20, 0, fit(theme.fg("muted", `  ${cut.hidden} lines hidden · Ctrl+O`), width));
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/tool-cards.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tool-cards.ts tests/tool-cards.test.ts
git commit -m "feat: render tool cards with width-safe collapse"
```

---

### Task 6: Register overrides, wire icons, docs, verify

**Files:**
- Modify: `tool-cards.ts` (append `registerToolCards`), `index.ts` (call it near other `registerTool`), `README.md`, `docs/superpowers/specs/2026-11-23-tool-cards-design.md` (record the two deviations)
- Test: `tests/tool-cards.test.ts` (add registration test)

**Interfaces:**
- Consumes: `create{Bash,Read,Edit,Write,Grep,Find,Ls}ToolDefinition(cwd)` from `@earendil-works/pi-coding-agent`; `Image` from `@earendil-works/pi-tui`; card builders (Task 2); `resolveIconMode`, `iconFile` (Task 3); `renderCardLines` (Task 5).
- Produces: `registerToolCards(pi: Pick<ExtensionAPI, "registerTool">, deps: { cwd: string; assetsDir: URL; env: NodeJS.ProcessEnv; theme?: never }): void`.

- [ ] **Step 1: Write the failing test**

```ts
import { registerToolCards } from "../tool-cards.ts";

test("registers all seven built-in tools with render overrides only", () => {
  const registered: any[] = [];
  registerToolCards({ registerTool: (t: any) => registered.push(t) } as any, {
    cwd: process.cwd(), assetsDir: new URL("../assets/generated/", import.meta.url), env: { TERM_PROGRAM: "other" },
  });
  assert.deepEqual(registered.map((t) => t.name).sort(), ["bash", "edit", "find", "grep", "ls", "read", "write"]);
  for (const t of registered) {
    assert.equal(typeof t.execute, "function");
    assert.equal(typeof t.renderCall, "function");
    assert.equal(typeof t.renderResult, "function");
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/tool-cards.test.ts`
Expected: FAIL (`registerToolCards` is not exported).

- [ ] **Step 3: Implement registration**

Append to `tool-cards.ts`:

```ts
import { readFileSync } from "node:fs";
import {
  createBashToolDefinition, createEditToolDefinition, createFindToolDefinition, createGrepToolDefinition,
  createLsToolDefinition, createReadToolDefinition, createWriteToolDefinition, type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { Image, Text, type Component } from "@earendil-works/pi-tui";
import * as card from "./card-model.ts";
import { iconFile, resolveIconMode, type ToolName } from "./icons.ts";

interface Deps { cwd: string; assetsDir: URL; env: NodeJS.ProcessEnv }
const textOf = (result: { content: Array<{ type: string; text?: string }> }) =>
  result.content.map((c) => (c.type === "text" ? c.text ?? "" : "")).join("\n");

export function registerToolCards(pi: Pick<ExtensionAPI, "registerTool">, deps: Deps): void {
  const mode = resolveIconMode(deps.env.YORHA_ICONS, deps.env);
  const icons = new Map<ToolName, string>();
  const iconRow = (tool: ToolName, theme: any): readonly string[] | undefined => {
    if (mode !== "image") return undefined;
    try {
      if (!icons.has(tool)) icons.set(tool, readFileSync(new URL(iconFile(tool), deps.assetsDir)).toString("base64"));
      const image = new Image(icons.get(tool)!, "image/png", { fallbackColor: (t: string) => theme.fg("accent", t) },
        { maxWidthCells: 2, maxHeightCells: 1, filename: iconFile(tool) }, { widthPx: 48, heightPx: 48 });
      return image.render(2);
    } catch { return undefined; }
  };

  const make = (tool: ToolName, original: any, build: (args: any, text: string, result: any, o: card.CardOpts) => card.CardModel) => {
    pi.registerTool({
      ...original,
      renderCall(args: any, theme: any, context: any): Component {
        const model = build(args, "", undefined, { isError: false, isPartial: true });
        const lines = renderCardLines(model, 200, theme, { expanded: false });
        return new Text(lines[0], 0, 0);
      },
      renderResult(result: any, options: any, theme: any, context: any): Component {
        const o = { isError: context.isError, isPartial: options.isPartial, durationMs: context.durationMs };
        const model = build(context.args, textOf(result), result, o);
        return {
          invalidate() {},
          render(width: number): readonly string[] {
            return renderCardLines(model, width, theme, { expanded: options.expanded, iconLines: iconRow(tool, theme) });
          },
        };
      },
    });
  };

  make("bash", createBashToolDefinition(deps.cwd), (a, t, _r, o) => card.bashCard(a, t, o));
  make("read", createReadToolDefinition(deps.cwd), (a, t, _r, o) => card.readCard(a, t, o));
  make("edit", createEditToolDefinition(deps.cwd), (a, t, r, o) => card.editCard(a, r?.details?.diff, t, o));
  make("write", createWriteToolDefinition(deps.cwd), (a, t, _r, o) => card.writeCard({ path: a.path, content: a.content ?? "" }, t, o));
  make("grep", createGrepToolDefinition(deps.cwd), (a, t, _r, o) => card.grepCard(a, t, o));
  make("find", createFindToolDefinition(deps.cwd), (a, t, _r, o) => card.findCard(a, t, o));
  make("ls", createLsToolDefinition(deps.cwd), (a, t, _r, o) => card.lsCard(a, t, o));
}
```

Important: `renderCall` returns the first line (the running-state header) only; `renderResult` replaces it with the final card, so one line per call is not duplicated. If Pi shows both the call line and the result card in one row, set `renderShell: "self"` on each override and have `renderCall` return an empty `Text("", 0, 0)`. Verify in step 5.

In `index.ts`, next to the other tool registrations, add:

```ts
import { registerToolCards } from "./tool-cards.ts";
// ...inside the extension function:
registerToolCards(pi, { cwd: process.cwd(), assetsDir: new URL("./assets/generated/", import.meta.url), env: process.env });
```

Also add `"$SOURCE_DIR/tool-cards.ts" "$SOURCE_DIR/card-model.ts" "$SOURCE_DIR/icons.ts" "$SOURCE_DIR/output-detect.ts"` to the `cp` list in `install.sh` and update `tests/test_install.sh` expectations if it lists files.

- [ ] **Step 4: Run all checks**

Run:
```bash
node --test tests/*.test.ts
python3 tests/test_icons_assets.py
python3 tests/test_theme.py
YORHA_SKIP_PACKAGES=1 bash tests/test_install.sh
bash tests/test_repair_startup.sh
python3 tests/test_tui_smoke.py
```
Expected: all pass. If the smoke test asserts old tool output text, update that assertion to the card format.

- [ ] **Step 5: Manual Ghostty check (record result in the PR)**

Install to a throwaway agent dir, never your real one: `PI_AGENT_DIR=$(mktemp -d) YORHA_SKIP_PACKAGES=1 bash install.sh`, then run Pi with that `PI_AGENT_DIR` in Ghostty and ask it to run `npm test`-like and failing commands, read a file, edit a file, and grep. Confirm: (1) icon is 1 row and aligned, (2) call + result do not duplicate, (3) failures and edits auto-expand, (4) `Ctrl+O` expands collapsed cards, (5) resizing to ~40 columns does not break lines, (6) `YORHA_ICONS=glyph` falls back cleanly. If (1) fails, set `maxHeightCells` or switch to `YORHA_ICONS=glyph` default and note it.

- [ ] **Step 6: Docs and commit**

Update README (`Tool output` paragraph at the "Model output uses a Pixelarticons robot card…" section): describe tool cards, collapse policy, `YORHA_ICONS`. Add a "Deviations" note to the spec Icons section (status glyph as text; env var instead of settings key).

```bash
git add -A -- ':!docs/WALKTHROUGH.md'
git commit -m "feat: render built-in tools as hybrid cards with pixel icons"
```

---

## Self-Review

**Spec coverage:** detector (T1), per-tool summaries/collapse policy/running/failure (T2), icon registry/fallback/Ghostty detection (T3), PNG assets + install (T4), expanded card, truncate-middle, narrow-width degradation, 1-row icon fallback (T5), render-only overrides, install wiring, README, smoke and manual Ghostty check (T6). Out of scope per spec: assistant Markdown and activity cards.

**Placeholders:** none; the only open items are verified at runtime by explicit commands (Pixelarticons names in T4, call/result duplication in T6 step 5).

**Type consistency:** `CardModel`, `CardOpts`, `ToolName`, `renderCardLines(model, width, theme, { expanded, iconLines })`, `registerToolCards(pi, deps)` are defined once and used with identical names.
