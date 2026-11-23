import assert from "node:assert/strict";
import test from "node:test";
import { registerToolCards, toolOptionsFromSettings, type PiToolOptions, type RegisterToolCardsDeps } from "../tool-cards-register.ts";
import { defaultMetrics } from "../text-width.ts";

const theme = { fg: (_c: string, t: string) => t, bold: (t: string) => t };
const TOOLS = ["bash", "read", "edit", "write", "grep", "find", "ls"] as const;
const KITTY_SEQUENCE = "\x1b_Ga=T,f=100,q=2,C=1;AAAA\x1b\\";

interface Harness {
  registered: any[];
  images: Array<{ base64: string; filename: string }>;
  reads: string[];
  created: Array<{ tool: string; cwd: string; options: PiToolOptions }>;
}

function setup(overrides: Partial<RegisterToolCardsDeps> & { imageLines?: readonly string[] } = {}): Harness {
  const h: Harness = { registered: [], images: [], reads: [], created: [] };
  const { imageLines, ...rest } = overrides;
  registerToolCards({ registerTool: (t: any) => h.registered.push(t) } as any, {
    cwd: "/work",
    homeDir: "/home/u",
    assetsDir: new URL("file:///assets/"),
    env: { TERM_PROGRAM: "other" },
    metrics: defaultMetrics,
    settings: () => ({}),
    createDefinition: (name, cwd, options) => {
      h.created.push({ tool: name, cwd, options });
      return {
        name, label: name, description: `${name} tool`, promptSnippet: `${name} snippet`, parameters: { cwd },
        execute: async (_id: string, params: any) => ({ cwd, params }),
      };
    },
    readFile: (url: URL) => { h.reads.push(url.pathname); return Buffer.from("png"); },
    createImage: (base64, opts) => {
      h.images.push({ base64, filename: opts.filename });
      return { render: () => imageLines ?? [KITTY_SEQUENCE] };
    },
    ...rest,
  });
  return h;
}

const tool = (h: Harness, name: string) => h.registered.find((t) => t.name === name);
const ctx = (args: any, extra: any = {}) => ({ args, isError: false, isPartial: false, outputPad: 0, durationMs: 1200, ...extra });
const done = { expanded: false, isPartial: false };
const text = (t: string) => ({ content: [{ type: "text", text: t }] });

test("registers all seven built-in tools keeping execute and adding self-shell renderers", () => {
  const h = setup();
  assert.deepEqual(h.registered.map((t) => t.name).sort(), [...TOOLS].sort());
  for (const t of h.registered) {
    assert.equal(typeof t.execute, "function");
    assert.equal(typeof t.renderCall, "function");
    assert.equal(typeof t.renderResult, "function");
    assert.equal(t.renderShell, "self");
  }
});

test("renderCall shows a running header only while the call is partial, then yields to the result card", () => {
  const h = setup();
  const bash = tool(h, "bash");
  const running = bash.renderCall({ command: "npm test" }, theme, ctx({ command: "npm test" }, { isPartial: true })).render(80);
  assert.equal(running.length, 1);
  assert.match(running[0], /⟳ BASH\s+npm test · running/);
  assert.deepEqual(bash.renderCall({ command: "npm test" }, theme, ctx({ command: "npm test" })).render(80), []);
  assert.deepEqual(bash.renderResult(text("partial"), { expanded: false, isPartial: true }, theme, ctx({ command: "x" }, { isPartial: true })).render(80), []);
});

test("renderResult builds a collapsed bash card from the result text", () => {
  const h = setup();
  const lines = tool(h, "bash").renderResult(text("ℹ pass 4\nℹ fail 0"), done, theme, ctx({ command: "npm test" })).render(100);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /✓ BASH\s+npm test · 1\.2s · exit 0 · 4 passed/);
});

test("failed bash result auto-expands and reads the exit code from the text", () => {
  const h = setup();
  const lines = tool(h, "bash").renderResult(text("boom\n\nCommand exited with code 2"), done, theme, ctx({ command: "false" }, { isError: true })).render(100);
  assert.match(lines[0], /✗ BASH\s+false · 1\.2s · exit 2/);
  assert.equal(lines.some((l) => l.includes("boom")), true);
});

test("edit result uses details.diff produced by Pi's edit tool", () => {
  const h = setup();
  const diff = " 1 keep\n-2 old\n+2 new\n 3 keep";
  const result = { content: [{ type: "text", text: "Successfully replaced 1 block(s) in a.ts." }], details: { diff, firstChangedLine: 2 } };
  const lines = tool(h, "edit").renderResult(result, done, theme, ctx({ path: "a.ts" })).render(100);
  assert.match(lines[0], /✓ EDIT\s+a\.ts · 1\.2s · \+1 −1/);
  assert.equal(lines.includes("  -2 old"), true);
  assert.equal(lines.includes("  +2 new"), true);
});

test("write result renders the written content from call args", () => {
  const h = setup();
  const lines = tool(h, "write").renderResult(text("Successfully wrote to a.txt"), done, theme, ctx({ path: "a.txt", content: "one\ntwo" })).render(100);
  assert.match(lines[0], /✓ WRITE\s+a\.txt · 1\.2s · 2 lines/);
  assert.equal(lines.includes("  one"), true);
});

test("Pi's empty-result strings produce empty summaries", () => {
  const h = setup();
  const ls = tool(h, "ls").renderResult(text("(empty directory)"), done, theme, ctx({ path: "src" })).render(100);
  assert.match(ls[0], /LS\s+src · 1\.2s · 0 entries/);
  const grep = tool(h, "grep").renderResult(text("No matches found"), done, theme, ctx({ pattern: "x" })).render(100);
  assert.match(grep[0], /GREP\s+"x" · 1\.2s · 0 matches/);
  const find = tool(h, "find").renderResult(text("No files found matching pattern"), done, theme, ctx({ pattern: "*.zz" })).render(100);
  assert.match(find[0], /FIND\s+\*\.zz · 1\.2s · 0 results/);
});

test("outputPad indents every line and narrows the card", () => {
  const h = setup();
  const lines = tool(h, "bash").renderResult(text("ok"), done, theme, ctx({ command: "echo" }, { outputPad: 2 })).render(30);
  assert.equal(lines[0].startsWith("  ✓ BASH"), true);
  assert.equal(lines.every((l) => defaultMetrics.visibleWidth(l) <= 30), true);
});

test("glyph mode never creates images and draws the text glyph", () => {
  const h = setup({ env: { YORHA_ICONS: "glyph", TERM_PROGRAM: "ghostty" } });
  const lines = tool(h, "bash").renderResult(text("ok"), done, theme, ctx({ command: "echo" })).render(80);
  assert.equal(h.images.length, 0);
  assert.equal(h.reads.length, 0);
  assert.match(lines[0], /^\$ ✓ BASH/);
});

test("image mode passes the icon row through, advancing the cursor past the kitty image", () => {
  const h = setup({ env: { YORHA_ICONS: "image" } });
  const lines = tool(h, "bash").renderResult(text("ok"), done, theme, ctx({ command: "echo" })).render(80);
  assert.deepEqual(h.images.map((i) => i.filename), ["tool-bash.png"]);
  assert.equal(h.reads.length, 1);
  assert.equal(lines[0].startsWith(`${KITTY_SEQUENCE}\x1b[2C `), true);
  assert.match(lines[0], /✓ BASH\s+echo/);
});

test("image mode defaults on for Ghostty and off elsewhere", () => {
  const ghostty = setup({ env: { TERM_PROGRAM: "ghostty" } });
  tool(ghostty, "ls").renderResult(text("a"), done, theme, ctx({})).render(80);
  assert.equal(ghostty.images.length, 1);
  const other = setup({ env: { TERM_PROGRAM: "Apple_Terminal" } });
  tool(other, "ls").renderResult(text("a"), done, theme, ctx({})).render(80);
  assert.equal(other.images.length, 0);
});

test("missing asset file falls back to the glyph without throwing", () => {
  const h = setup({ env: { YORHA_ICONS: "image" }, readFile: () => { throw new Error("ENOENT"); } });
  const lines = tool(h, "bash").renderResult(text("ok"), done, theme, ctx({ command: "echo" })).render(80);
  assert.match(lines[0], /^\$ ✓ BASH/);
});

test("image fallback text (terminal without image support) uses the glyph", () => {
  const h = setup({ env: { YORHA_ICONS: "image" }, imageLines: ["[Image: tool-bash.png [image/png]]"] });
  const lines = tool(h, "bash").renderResult(text("ok"), done, theme, ctx({ command: "echo" })).render(80);
  assert.match(lines[0], /^\$ ✓ BASH/);
});

test("image creation failure falls back to the glyph without throwing", () => {
  const h = setup({ env: { YORHA_ICONS: "image" }, createImage: () => { throw new Error("bad image"); } });
  const lines = tool(h, "bash").renderResult(text("ok"), done, theme, ctx({ command: "echo" })).render(80);
  assert.match(lines[0], /^\$ ✓ BASH/);
});

test("renderers tolerate streaming partial args with missing fields", () => {
  const h = setup();
  for (const t of h.registered) {
    for (const args of [{}, undefined, { command: undefined, path: undefined, content: undefined, pattern: undefined }]) {
      assert.doesNotThrow(() => t.renderCall(args, theme, ctx(args, { isPartial: true })).render(80));
      assert.doesNotThrow(() => t.renderCall(args, theme, ctx(args)).render(80));
      assert.doesNotThrow(() => t.renderResult(text(""), done, theme, ctx(args)).render(80));
      assert.doesNotThrow(() => t.renderResult({ content: [] }, done, theme, ctx(args, { isError: true })).render(80));
    }
  }
});

test("execute delegates to a definition built for the session cwd, one per cwd", async () => {
  const h = setup({ settings: () => ({ shellCommandPrefix: "source ~/.env", shellPath: "/bin/zsh", images: { autoResize: false } }) });
  const bash = tool(h, "bash");
  assert.equal(bash.description, "bash tool");
  assert.equal(bash.promptSnippet, "bash snippet");
  assert.deepEqual(bash.parameters, { cwd: "/work" });
  h.created.length = 0;
  assert.deepEqual(await bash.execute("1", { command: "ls" }, undefined, undefined, { cwd: "/a" }), { cwd: "/a", params: { command: "ls" } });
  assert.deepEqual(await bash.execute("2", { command: "pwd" }, undefined, undefined, { cwd: "/b" }), { cwd: "/b", params: { command: "pwd" } });
  assert.deepEqual(await bash.execute("3", { command: "ls" }, undefined, undefined, { cwd: "/a" }), { cwd: "/a", params: { command: "ls" } });
  assert.deepEqual(h.created.map((c) => c.cwd), ["/a", "/b"]);
  assert.deepEqual(h.created[0].options, {
    bash: { commandPrefix: "source ~/.env", shellPath: "/bin/zsh" },
    read: { autoResizeImages: false },
  });
});

test("toolOptionsFromSettings mirrors Pi's own tool options", () => {
  assert.deepEqual(toolOptionsFromSettings({}, "/home/u"), { bash: { commandPrefix: undefined, shellPath: undefined }, read: { autoResizeImages: true } });
  assert.equal(toolOptionsFromSettings({ shellPath: "~/bin/fish" }, "/home/u").bash.shellPath, "/home/u/bin/fish");
  assert.equal(toolOptionsFromSettings({ shellPath: "~" }, "/home/u").bash.shellPath, "/home/u");
  assert.equal(toolOptionsFromSettings({ shellPath: "/bin/bash" }, "/home/u").bash.shellPath, "/bin/bash");
});

test("tool output and header args are sanitized before rendering", () => {
  const h = setup();
  const bash = tool(h, "bash");
  const result = bash.renderResult(text("\x1b[1Afoo\r\nbar\tbaz\n\nCommand exited with code 1"), done, theme, ctx({ command: "echo\t\x1b[31mhi" }, { isError: true })).render(100);
  const running = bash.renderCall({ command: "a\tb\r" }, theme, ctx({ command: "a\tb\r" }, { isPartial: true })).render(100);
  const edit = tool(h, "edit").renderResult({ content: [{ type: "text", text: "ok" }], details: { diff: "-1 a\tb\r\n+1 \x1b[32mc" } }, done, theme, ctx({ path: "a\x1b]8;;x\x07.ts" })).render(100);
  const write = tool(h, "write").renderResult(text("ok"), done, theme, ctx({ path: "w.txt", content: "x\ty\r\n\x1b[2Jz" })).render(100);
  const grep = tool(h, "grep").renderResult(text("a.ts:1:\tfoo"), done, theme, ctx({ pattern: "\x1b[1Cfoo" })).render(100);
  for (const line of [...result, ...running, ...edit, ...write, ...grep]) {
    assert.equal(/[\x1b\r\t]/.test(line), false, JSON.stringify(line));
  }
  assert.equal(result.some((l) => l.includes("foo")), true);
  assert.equal(result.some((l) => l.includes("bar   baz")), true);
  assert.match(result[0], /BASH\s+echo   hi/);
});
