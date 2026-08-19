# YoRHa Bunker HUD for Pi

Global Pi TUI theme and extension matching the approved Ghostty/YoRHa environment.

## Controls

| Control | Action |
|---|---|
| `Shift+Tab` | Toggle Build/Hacking mode |
| `Ctrl+Shift+H` | Toggle the Hacking Unit overlay (Hacking mode only) |
| `Ctrl+Shift+T` | Cycle Pi thinking level |
| `Ctrl+O` | Toggle compact/detailed tool output (Pi native fallback) |
| `/yorha-mode build|hacking` | Explicitly set mode |
| `/yorha-panel` | Toggle the Hacking Unit overlay |
| `/yorha-agents` | Show the active Build Unit subagent fleet |

Build is always the startup mode. CTF metadata persists in session entries but is hidden until Hacking mode is active. The agent-managed `yorha_ctf_status` tool is active only in Hacking mode and stores verification status, never flag text.

## Build orchestration

Build mode combines pinned [Superpowers v6.2.0](https://github.com/obra/superpowers) skills with [pi-subagents v0.46.0](https://github.com/nicobailon/pi-subagents):

- YoRHa injects a Build-only bootstrap that requires skill discovery before action.
- The `yorha-build-orchestration` skill coordinates brainstorming, planning, TDD, implementation, specification/code review, and fresh verification.
- `subagent` and `subagent_wait` are enabled in Build mode and removed in Hacking mode.
- The status line and footer show the bounded active fleet reported by pi-subagents' public RPC rather than scraping tool output.
- Read-only scouts/reviewers may run concurrently. Writers must have disjoint scopes and separate worktrees; the parent reviews and integrates their changes.
- Superpowers' upstream always-on extension is intentionally filtered out. Its skills remain available, while YoRHa owns mode-aware activation.

The default package agents include `scout`, `researcher`, `worker`, `reviewer`, and `oracle`. Delegated processes share filesystem and environment access. Agent tool allowlists are capability controls, **not OS sandboxes**; review third-party package updates and never delegate secrets.

Model responses and verbose execution are visually isolated:

- Rasterized Pixelarticons robot cards mark each model turn.
- `POD 042 / RESPONSE` and `END TRANSMISSION` frame finalized model text.
- The padded Pod icon and `TACTICAL ANALYSIS` label share one response-card row; thinking text remains directly beneath it.
- Active tools use one compact live line (`EXECUTING <TOOL> · <elapsed>`) above the editor instead of a large duplicate execution card.
- The Pod heading is locality-free; `LOCAL`/`LINK` now precedes the mode and `INSERT` state in the editor's centered channel divider.
- Tool boxes use the recessed `#131317` surface while retaining Pi's built-in renderers and native `Ctrl+O` expansion. Collapsed output hints now advertise `Click output / Ctrl+O to expand` when rendered; click routing is best-effort and terminal/runtime dependent, while `Ctrl+O` remains reliable.
- Fenced Markdown renders as recessed, syntax-highlighted panels with `BASH`, `TEXT`, or the declared language in the header; literal triple-backtick fences are not displayed.
- Provider telemetry is lifecycle-backed: `STANDBY`, `ACTIVE`, `LINKED`, `DEGRADED`, or `OFFLINE`.
- Footer runtime telemetry is ordered as `$model $level $context`; the thinking level is amber and has no redundant label.
- Provider allowance telemetry is shown beside runtime data for OpenAI Codex subscriptions and OpenAI API keys. Codex displays the remaining subscription window and reset time through the installed `codex` CLI; OpenAI displays request/token rate-limit percentages reported by API response headers. OpenAI does not expose prepaid-credit or billing balance through ordinary API keys.
- Every finalized assistant transmission ends with that request's input-plus-output token total and its elapsed provider response time. The counter resets for each user request, compacts responsively, and persists outside model context.

Pixelarticons SVG sources are distributed under the MIT license in `assets/pixelarticons/LICENSE`. Generated 48×48 transparent PNGs are derived from those sources for Ghostty/Kitty terminal image rendering.

The panel requires at least 110 columns and 28 rows. It hides responsively below that threshold and reserves an eight-row bottom margin so it does not cover the Operator Input Channel.

## Install

```bash
bash install.sh
```

The installer creates a timestamped restore bundle under `~/.pi/agent/backups/` before changing anything. It preserves unrelated settings, keybindings, themes, extensions, and package entries. It installs exact pinned package versions; inspect their source before installation because Pi extensions execute with full user permissions. Set `YORHA_SKIP_PACKAGES=1` only for offline staging or installer tests—the package entries are still configured and Pi may reconcile them later.

Original pre-install restore bundle created for this deployment:

```bash
bash ~/.pi/agent/backups/yorha-bunker-20260807T235306Z-64447/restore.sh
```

The installer also enables Pi's supported `quietStartup` setting and global `tuiMode: "fullscreen"`. Fullscreen uses the terminal alternate screen so the previous shell prompt is restored when Pi exits; override per invocation with `pi --tui-mode regular`.

The `quietStartup` setting hides built-in startup help and loaded resource listings while preserving the custom YoRHa header. Run `pi --verbose` whenever the full resource inventory is needed.

Current malformed/duplicate skill diagnostics can be repaired separately and reversibly:

```bash
bash repair-startup.sh
```

Original pre-repair restore bundle created for this deployment:

```bash
bash ~/.pi/agent/backups/yorha-startup-20260808T111909Z-46744/restore.sh
```

After installation or repair, run `/reload` in Pi or start a new Pi session.

## Verify

```bash
python3 tests/test_theme.py
node --test tests/*.test.ts
YORHA_SKIP_PACKAGES=1 bash tests/test_install.sh
python3 tests/test_tui_smoke.py
```
