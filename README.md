# YoRHa Bunker for Pi

Private Pi coding agent extension that applies a YoRHa-inspired TUI and adds separate Build and Hacking operating modes. It is not a standalone application.

This repository is private and maintained as a personal operations reference.

## What the extension changes in Pi

The installer adds a global `yorha-bunker` theme and the `yorha-bunker-hud` extension. The extension provides:

- a custom header, footer, editor, response cards, code panels, and compact tool activity;
- Build-mode access to Superpowers skills and pi-subagents orchestration;
- a Hacking Unit overlay and session-persisted CTF status;
- provider connection, allowance, token, and response-time telemetry.

The installer also enables Pi's `quietStartup` setting, sets global `tuiMode` to `fullscreen`, and binds the thinking-level cycle to `Ctrl+Shift+T`. It preserves the existing tool-expansion binding, whose Pi default is `Ctrl+O`.

## Requirements

- The Pi coding agent, installed on `PATH` as `pi`.
- Node.js, Bash, Python 3, and `jq`.
- Network access when Pi installs the pinned Build packages.
- The installed `codex` CLI for OpenAI Codex subscription-allowance telemetry. The rest of the extension works without this optional telemetry source.
- Ghostty and Kitty are optional and only enable terminal image rendering; neither is required for the rest of the extension.

Pi extensions execute with full user permissions. Inspect third-party package updates before installing them. Delegated agents share filesystem and environment access; tool allowlists control agent capabilities but are **not OS sandboxes**. Never delegate secrets.

## Installation

From this repository, run:

```bash
bash install.sh
```

The installer creates a timestamped restore bundle under `~/.pi/agent/backups/` before changing settings, keybindings, the installed extension, or the theme. It preserves unrelated settings, keybindings, themes, extensions, and package entries.

The Build packages are pinned as:

- [pi-subagents v0.76.1](https://github.com/nicobailon/pi-subagents): `npm:pi-subagents@0.76.1`
- [Superpowers v6.2.0](https://github.com/obra/superpowers): `git:github.com/obra/superpowers@v6.2.0`

For offline staging or installer tests only, skip package installation with:

```bash
YORHA_SKIP_PACKAGES=1 bash install.sh
```

This still configures the package entries. Pi may reconcile them later.

After installation, run `/reload` in Pi or start a new Pi session. Fullscreen mode uses the terminal alternate screen, so Pi restores the previous shell prompt when it exits. Override it for one invocation with `pi --tui-mode regular`.

`quietStartup` hides Pi's built-in startup help and loaded-resource list while keeping the YoRHa header. Use `pi --verbose` when you need the full resource inventory.

## Controls

Build is the startup mode for every session.

| Control | Action |
|---|---|
| `Shift+Tab` | Toggle Build and Hacking modes |
| `Ctrl+Shift+H` | Toggle the Hacking Unit overlay; Hacking mode only |
| `Ctrl+Shift+T` | Cycle Pi's thinking level |
| `Ctrl+O` | Toggle compact and detailed tool output using Pi's native control |
| `/yorha-panel` | Toggle the Hacking Unit overlay |
| `/yorha-agents` | Show the active Build Unit subagent fleet |

Use `/yorha-mode build|hacking` to set the operating mode explicitly.

## Build mode

Build mode adds a mode-specific system prompt that instructs the agent to load the `yorha-build-orchestration` skill. The workflow calls for skill discovery, brainstorming or design clarification, a written plan, test-driven implementation, review, and fresh verification.

The pinned pi-subagents package supplies `scout`, `researcher`, `worker`, `reviewer`, and `oracle`. Its `subagent` and `subagent_wait` tools are available only in Build mode and only when registered by the package. `/yorha-agents`, the status line, and the footer read fleet state through pi-subagents' public RPC interface rather than parsing tool output.

Read-only scouts and reviewers may run concurrently. Writers need disjoint scopes and separate worktrees, and the parent agent remains responsible for reviewing and integrating their work. The Superpowers package's always-on extension is disabled; its skills remain available through YoRHa's mode-aware activation.

## Hacking mode

Hacking mode removes the Build subagent tools and enables `yorha_ctf_status`. The tool records the challenge, category, target, ordered phase, concise evidence, and verification state. Its phases are `TRIAGE`, `ANALYSIS`, `EXPLOITATION`, `VERIFICATION`, and `COMPLETE`.

CTF state persists in session entries but stays hidden until Hacking mode is active. Do not submit or record flag text with `yorha_ctf_status`; its schema has no dedicated flag field. The tool may mark a flag verified only during `VERIFICATION` or `COMPLETE`.

## Provider telemetry and rendering

The footer reports provider link state as `STANDBY`, `ACTIVE`, `LINKED`, `DEGRADED`, or `OFFLINE`. Footer runtime order is `$model $level $context`: model, thinking level, then context. The thinking level is amber and has no extra label.

Allowance telemetry depends on the selected OpenAI provider:

- OpenAI Codex subscription sessions query the installed `codex` CLI every 30 seconds and show remaining subscription allowance and reset time.
- OpenAI API-key sessions show remaining request and token percentages from API response headers. Ordinary API keys do not expose prepaid credit or billing balance.

Each finalized assistant transmission shows that request's input-plus-output token total and provider response time. The values reset for each request, use a compact format at narrow widths, persist with the session, and remain outside model context.

Model output uses a Pixelarticons robot card with `TACTICAL ANALYSIS`, then `POD 042 / RESPONSE` and `END TRANSMISSION` framing. Thinking text remains directly below the card and is not wrapped as a final response. Active tools use one line in the form `EXECUTING <TOOL> · <elapsed>` above the editor. The editor divider shows `LOCAL` or `LINK` before the mode and `INSERT` state.

Built-in tools (`bash`, `read`, `edit`, `write`, `grep`, `find`, `ls`) render as tool cards: one header line of the form `<icon> <status> <TOOL>  <key argument> · <duration> · <summary>`, for example `✓ BASH  npm test · 2.1s · exit 0 · 41 passed`. The status is a colored text glyph (`⟳` running, `✓` ok, `✗` failed). Execution is Pi's own tool code, built for the session's working directory with Pi's `shellPath`, `shellCommandPrefix`, and image auto-resize settings; only rendering is overridden. Escape sequences, control characters, carriage-return overwrites, and tabs are removed from tool output before it is drawn. Each call shows exactly one card: a running header while the tool executes, replaced by the result card when it finishes.

Cards collapse by a hybrid policy. Failed commands (non-zero exit, tracebacks, failing tests), `edit` diffs, `write` content, and `grep` matches expand automatically; successful `bash`, `read`, `find`, and `ls` output stays on the header line. `Ctrl+O` (or a click, where the terminal supports it) expands any card. In expanded bodies, diff lines are green and red, error output is red, JSON is pretty-printed, and other output is muted. Automatically expanded long output keeps the first 20 and last 10 lines with `N lines hidden · Ctrl+O`; a card expanded with `Ctrl+O` shows its full body, including every `grep` match. At narrow widths the icon, then duration, then summary are dropped before the command is clipped.

Each tool has a 48×48 Pixelarticons icon drawn as a one-row inline image in Ghostty and Kitty, with a Unicode glyph (`$ ▤ ✎ ▣ ⌕ ◎ ▦`) elsewhere. Set `YORHA_ICONS=image`, `YORHA_ICONS=glyph`, or `YORHA_ICONS=auto` (default; images for Ghostty and Kitty) in the environment that launches Pi to override detection. A missing icon file falls back to the glyph, and glyphs replace images while the Hacking mode CTF panel is open because the panel overlay is not drawn on rows that hold an image.

Fenced Markdown uses the recessed `#131317` surface. Code fences render as syntax-highlighted panels labeled `BASH`, `TEXT`, or the declared language; the literal triple-backtick fences are not shown. For output still drawn by Pi's own renderers, collapsed output says `Click output / Ctrl+O to expand` when space permits. Click handling depends on the terminal and runtime; `Ctrl+O` is the reliable fallback.

Pixelarticons SVG sources are distributed under the MIT license in `assets/pixelarticons/LICENSE`. Rasterized Pixelarticons are generated as 48×48 transparent PNGs for Ghostty and Kitty terminal image rendering.

## Project layout

| Path | Purpose |
|---|---|
| `index.ts` | Extension entry point, Pi events, modes, shortcuts, commands, and tools |
| `components.ts` | Header, footer, editor, Hacking overlay, response card, and execution widget |
| `build-orchestration.ts` | Build prompt and pi-subagents fleet RPC |
| `mode.ts`, `ctf-state.ts` | Mode-specific tools and persisted CTF state |
| `provider-state.ts`, `provider-usage.ts` | Provider link and allowance telemetry |
| `response.ts`, `transmission-*.ts` | Response framing and per-request telemetry |
| `code-panel.ts`, `tool-output-affordance.ts` | Markdown and tool-output rendering |
| `tool-cards.ts`, `tool-cards-register.ts`, `card-model.ts` | Tool card layout, per-tool summaries, and dependency-injected registration |
| `icons.ts`, `output-detect.ts`, `text-width.ts`, `sanitize.ts` | Icon registry and `YORHA_ICONS` mode, output detector, width helpers, tool output sanitizer |
| `theme/`, `assets/` | Pi theme and generated/source visual assets |
| `skills/yorha-build-orchestration/` | Build workflow skill installed with the extension |
| `install.sh`, `repair-startup.sh` | Installation, backup, repair, and restore setup |
| `tests/` | Unit, installer, repair, theme, and TUI smoke checks |

## Verification

Run the repository checks from its root:

```bash
node --test tests/*.test.ts
python3 tests/test_theme.py
python3 tests/test_icons_assets.py
YORHA_SKIP_PACKAGES=1 bash tests/test_install.sh
bash tests/test_repair_startup.sh
python3 tests/test_tui_smoke.py
```

The TUI smoke test requires a working local Pi installation and compatible terminal test environment.

## Repair and restore

Installation and startup repair are separate operations. To repair the current malformed or duplicate `academic-paper-composer` and `academic-paper-strategist` skill diagnostics, run:

```bash
bash repair-startup.sh
```

The repair creates its own timestamped restore bundle, consolidates the affected skills under `~/.agents/skills/`, enables quiet startup, and prints its restore path. Run `/reload` or restart Pi afterward.

Original pre-install restore bundle for this deployment:

```bash
bash ~/.pi/agent/backups/yorha-bunker-20260807T235306Z-64447/restore.sh
```

Original pre-repair restore bundle for this deployment:

```bash
bash ~/.pi/agent/backups/yorha-startup-20260808T111909Z-46744/restore.sh
```

For later installations or repairs, use the `restore.sh` path printed by that run rather than one of the original deployment paths above.

## Known constraints

The Hacking Unit overlay is 34 columns wide. It requires a terminal at least 110 columns wide and 28 rows high, hides below that threshold, and reserves an eight-row bottom margin so it does not cover the Operator Input Channel.
