# YoRHa Bunker HUD for Pi

## I. Executive Summary

**Goal:** Deliver a globally installed, Ghostty-native YoRHa Bunker HUD for Pi with distinct Build/Hacking modes, compact tool presentation, persistent agent-managed CTF state, and a non-overlapping right-side CTF overlay.

**Success Metrics:**
- Pi loads the `yorha-bunker` theme and extension globally with no startup, reload, or rendering errors while preserving the existing `clawd-on-desk` extension and provider settings.
- At terminal widths of 110 columns or greater, Build/Hacking mode switching, the CTF overlay, compact tool display, and all configured shortcuts behave exactly as approved.
- CTF metadata survives `/reload`, session resume, and mode changes; the UI never presents a flag as verified unless the custom state tool explicitly records verification.

## II. Skill Matrix

| Component | Required Skill/Reference | Implementation Role |
|---|---|---|
| Pi extension architecture | Pi `extensions.md` | Lifecycle hooks, shortcuts, commands, custom tool, persisted entries, and UI registration |
| Terminal components and overlays | Pi `tui.md` | Header, footer, editor, widgets, responsive right overlay, animation, and width-safe rendering |
| Color system | Pi `themes.md`; existing YoRHa palette | Complete dark theme using Ghostty background `#16161A` and approved semantic colors |
| Keybindings | Pi `keybindings.md` | Rebind thinking cycle and preserve Pi's native `Ctrl+O` tool expansion |
| Visual design | `frontend-design`; approved HTML preview | Translate the approved Bunker HUD visual hierarchy into terminal-safe components |
| Persistence and CTF safety | CTF project constraints; Pi session entries | Branch-aware state restoration and explicit flag-verification evidence |

## III. Logic & Architecture

The repository will remain the source of truth and deploy a non-destructive global package:

```text
yorha-bunker/
├── index.ts                 extension entry point
├── components.ts            header/footer/editor/overlay renderers
├── ctf-state.ts             validation, transitions, persistence reconstruction
├── theme/yorha-bunker.json  complete Pi theme
├── install.sh               backup + global deployment + JSON merge
└── tests/                   state/layout/config checks

                           ┌─ Build mode (startup default)
Shift+Tab ─ mode manager ──┤  full HUD; CTF tool inactive; panel closed
                           └─ Hacking mode
                              CTF tool active; Ctrl+Shift+H may show panel

Agent → yorha_ctf_status tool → validate transition → append session entry
                                                └→ refresh footer/panel/widget

Ctrl+Shift+H → Build: notify "Hacking mode inactive."
              Hacking: toggle top-right overlay
                        └→ visible only at width ≥110 and adequate height

Ctrl+O → Pi native app.tools.expand (unchanged)
Ctrl+Shift+T → app.thinking.cycle (moved from Shift+Tab)
```

The overlay will use a top-right anchor, a 34-column target width, bounded height, and bottom margin sufficient to stay above the editor dock. It will not use shadows. If the terminal is narrower than 110 columns or too short for the panel plus editor clearance, the panel hides and a warning notification is emitted once per visibility attempt.

CTF phases are strictly ordered:

`TRIAGE → ANALYSIS → EXPLOITATION → VERIFICATION → COMPLETE`

The tool may update descriptive metadata and append evidence, but phase regressions or skips require an explicit override reason. Flag state remains only `UNVERIFIED` or `VERIFIED`; no complete or masked flag value is stored or displayed by this UI.

## IV. Phased Roadmap

## Stage 1: Source Structure and Theme
> **Entry Condition:** Approved preview and decisions are recorded; no global Pi files have been modified.
> **Exit Condition:** A complete source package and schema-valid dark theme exist in the repository without installation.

### Module 1.1: Package Scaffolding

- [x] [P1.1.1] Create Source Package: Add the `yorha-bunker/` repository with extension, component, state, installer, and test boundaries.
      depends_on: none
      Verify: `find . -maxdepth 3 -type f | sort` shows every planned source/test file and no files under `~/.pi/agent` have changed.

- [x] [P1.1.2] Centralize Design Tokens: Define palette, glyphs, labels, minimum width, panel dimensions, animation frames, and mode constants once for reuse by every component.
      depends_on: P1.1.1
      Verify: `rg '#[0-9A-Fa-f]{6}|110|34' . --glob '*.ts'` reports values only in the designated token/config module except test fixtures.

### Module 1.2: Pi Theme

- [x] [P1.2.1] Build Complete Dark Theme: Map all required Pi color tokens to the approved YoRHa palette, with terminal/default-compatible text and Ghostty field `#16161A`; do not add noise, scanline, gradient, image, or shadow backgrounds.
      depends_on: P1.1.2
      Verify: Parse the JSON with `jq`; compare its keys against Pi's theme schema; confirm `#16161A` is the only base field background.

- [x] [P1.2.2] Add Theme Contract Tests: Assert unique theme name, required token coverage, approved palette membership, and forbidden visual effects/unknown color literals.
      depends_on: P1.2.1
      Verify: Run the package theme test command and observe zero failed assertions.

### 🧪 Stage 1 Test Procedures

#### Test 1.1: Theme Completeness
- **Type:** Automated configuration test
- **Preconditions:** Stage 1 source files exist; Python 3 and `jq` are available.
- **Steps:**
  1. Parse `theme/yorha-bunker.json` with `jq empty`.
  2. Run the theme contract test.
  3. Compare required token names with Pi's installed theme schema.
- **Expected Result:** Valid JSON, every required token is present, optional fallbacks are intentional, and no unapproved colors appear.
- **Pass Command:** `python3 tests/test_theme.py && jq empty theme/yorha-bunker.json`
- **Fail Indicators:** JSON parse failure, missing token, duplicate theme name, unknown literal, or non-`#16161A` base background.

#### Test 1.2: No Premature Global Mutation
- **Type:** Integration safety test
- **Preconditions:** Snapshot hashes of existing `~/.pi/agent/settings.json`, extension list, and optional keybindings were recorded.
- **Steps:**
  1. Recompute hashes/listing after Stage 1.
  2. Compare with the baseline.
- **Expected Result:** Existing global files and extensions are byte-identical; only repository source files were added.
- **Pass Command:** Execute the generated baseline comparison script from the package tests.
- **Fail Indicators:** Any changed global Pi setting, keybinding, extension, or theme.

## Stage 2: Mode and CTF State Core
> **Entry Condition:** Stage 1 theme and package contracts pass.
> **Exit Condition:** Build/Hacking mode logic and branch-aware CTF state are deterministic and independently tested.

### Module 2.1: Mode Controller

- [x] [P2.1.1] Implement Build-First Mode State: Start every session in Build mode, close the CTF panel on Build entry, and preserve CTF metadata without displaying it.
      depends_on: P1.1.2
      Verify: Unit tests show startup mode is always Build even when restored CTF metadata exists.

- [x] [P2.1.2] Implement Tool Activation Boundary: Add `yorha_ctf_status` to active tools only in Hacking mode and remove only that tool when returning to Build, preserving every unrelated built-in and extension tool.
      depends_on: P2.1.1
      Verify: Tests start with arbitrary tool sets and confirm only `yorha_ctf_status` changes.

### Module 2.2: CTF State Model

- [x] [P2.2.1] Define Validated CTF Contract: Model challenge name, category, target, ordered phase, evidence records, and binary flag-verification status with strict length and enum constraints.
      depends_on: P1.1.2
      Verify: Valid fixtures pass; malformed phases, oversized values, empty evidence, and unknown fields fail safely.

- [x] [P2.2.2] Implement Transition Rules: Permit normal forward progress, reject accidental regressions/skips, and require a non-empty override reason for exceptional transitions.
      depends_on: P2.2.1
      Verify: Transition matrix tests cover every adjacent transition, regression, skip, duplicate update, and explicit override.

- [x] [P2.2.3] Implement Branch-Aware Persistence: Append immutable custom session entries for accepted updates and reconstruct the newest valid state from the active branch on startup/reload/resume.
      depends_on: P2.2.2
      Verify: Fixtures with forks, stale entries, malformed data, and multiple updates restore only the latest valid state on the selected branch.

- [x] [P2.2.4] Register Agent-Managed Status Tool: Expose a narrowly described `yorha_ctf_status` tool that returns concise state-change evidence, records no flag text, and throws on invalid updates.
      depends_on: P2.1.2, P2.2.3
      Verify: Stub execution records accepted updates, rejects invalid input as tool errors, and never serializes a flag value.

### 🧪 Stage 2 Test Procedures

#### Test 2.1: Mode and Tool Isolation
- **Type:** Unit
- **Preconditions:** Mode controller and mocked Pi active-tool API are available.
- **Steps:**
  1. Start with built-in and third-party tools active.
  2. Enter Hacking mode.
  3. Return to Build mode.
- **Expected Result:** Hacking adds exactly `yorha_ctf_status`; Build removes exactly that tool; all prior tools remain active; startup is Build.
- **Pass Command:** `node --test tests/mode.test.ts`
- **Fail Indicators:** Lost unrelated tools, duplicate tools, Hacking startup, or panel remaining open in Build.

#### Test 2.2: CTF State Validation and Persistence
- **Type:** Unit
- **Preconditions:** State fixtures and reconstruction functions exist.
- **Steps:**
  1. Run accepted phase progression through COMPLETE.
  2. Attempt regression and skipped progression without override.
  3. Restore state from a forked branch fixture.
  4. Search serialized state for flag-like values.
- **Expected Result:** Ordered progress succeeds; unsafe transitions fail; active branch restores correctly; only verification status is persisted.
- **Pass Command:** `node --test tests/ctf-state.test.ts`
- **Fail Indicators:** Invalid transition accepted, stale branch selected, malformed entry crashes restoration, or a flag value is stored.

## Stage 3: Bunker HUD Components
> **Entry Condition:** Stage 2 state and mode tests pass.
> **Exit Condition:** All approved UI surfaces render width-safe, theme-aware components matching the preview's hierarchy.

### Module 3.1: Persistent HUD

- [x] [P3.1.1] Build Header Component: Render YoRHa wordmark, terminal identity, context usage, model, thinking level, and Build/Hacking state with approved palette and no custom background treatment.
      depends_on: P2.1.1
      Verify: Snapshot tests at 110, 140, and 200 columns show no line exceeds the supplied width.

- [x] [P3.1.2] Build Footer Component: Render link state, Git branch, active-tool count, context percentage, model/session status, and CTF standby/armed state with branch-change invalidation and cleanup.
      depends_on: P2.1.1
      Verify: Footer updates on mode, model, thinking, branch, and CTF state changes without stale colors or leaked listeners.

- [x] [P3.1.3] Build Custom Editor Frame: Extend `CustomEditor`, preserve all application/editor keybindings, and add YoRHa channel and mode labels without changing text-edit behavior.
      depends_on: P2.1.1
      Verify: Input, multiline entry, submit, cancel, history, and app shortcuts delegate correctly; every rendered line respects width.

- [x] [P3.1.4] Build Pod and Status Widgets: Add a concise above-editor Pod 042 recommendation/status card and mode-aware status indicators that do not cover the editor.
      depends_on: P2.2.3, P3.1.2
      Verify: Widget placement is above the editor, is bounded in height, and changes between Build and Hacking content.

### Module 3.2: Motion and Presentation

- [x] [P3.2.1] Add Immersive Working Indicator: Use amber/steel scanner frames with bounded refresh interval and restore default behavior on shutdown.
      depends_on: P3.1.1
      Verify: Frame tests confirm valid width and interval; manual run shows smooth animation without uncontrolled timers.

- [x] [P3.2.2] Configure Compact Tool Presentation: Start sessions with tools collapsed, retain Pi's native `Ctrl+O` expansion, and use theme tokens for call/result states rather than replacing built-in execution semantics.
      depends_on: P1.2.1
      Verify: `Ctrl+O` alternates compact and detailed tool output and no built-in tool implementation is overridden.

- [x] [P3.2.3] Style Messages and Dialog Surfaces: Apply theme-backed user/custom/tool backgrounds, markdown/syntax colors, YoRHa notifications, and custom extension dialogs while leaving original session/model content unchanged.
      depends_on: P1.2.1, P3.1.4
      Verify: Render samples cover user, assistant, thinking, custom message, notification, selection, warning, and error states.

### 🧪 Stage 3 Test Procedures

#### Test 3.1: Width Safety
- **Type:** Automated component snapshot
- **Preconditions:** Components can render against stub theme/context data.
- **Steps:**
  1. Render every component at 109, 110, 140, and 200 columns.
  2. Measure each line with `visibleWidth()`.
  3. Verify narrow fallbacks and truncation.
- **Expected Result:** No line exceeds width; 110-column layout contains all primary telemetry; 109-column layout uses safe compact fallbacks.
- **Pass Command:** `node --test tests/*.test.ts`
- **Fail Indicators:** Overflow, malformed ANSI resets, missing primary label, or exception on narrow width.

#### Test 3.2: Editor and Tool Controls
- **Type:** Integration with stubs
- **Preconditions:** Custom editor and UI context stubs are available.
- **Steps:**
  1. Feed normal text, editing keys, submit, Escape, and configured app shortcuts to the editor.
  2. Toggle tool expansion twice.
- **Expected Result:** Editor behavior matches Pi's base editor; tool output begins collapsed, expands, then collapses.
- **Pass Command:** `node --test tests/*.test.ts`
- **Fail Indicators:** Swallowed app shortcut, altered submitted text, failure to expand, or custom built-in tool execution.

## Stage 4: Responsive Hacking Overlay and Shortcuts
> **Entry Condition:** Stage 3 components pass width and input tests.
> **Exit Condition:** Approved mode/panel shortcuts and responsive non-overlap behavior work as a complete interaction system.

### Module 4.1: Overlay

- [x] [P4.1.1] Build CTF Overlay Component: Render challenge, category, target, ordered phase meter, evidence count/list, and UNVERIFIED/VERIFIED status in a 34-column top-right panel with no shadow.
      depends_on: P2.2.4, P3.1.1
      Verify: Component snapshots include empty, partial, verified, long-value, and maximum-evidence states.

- [x] [P4.1.2] Enforce Editor Clearance and Responsive Hiding: Apply top/right anchoring, bounded height, explicit bottom margin, and visibility checks for width ≥110 and adequate terminal height.
      depends_on: P4.1.1
      Verify: Geometry tests and manual fullscreen checks confirm the panel never intersects the Operator Input Channel; narrow attempts notify once and remain hidden.

- [x] [P4.1.3] Implement Toggle Lifecycle: Maintain one overlay instance/handle, support show/hide without stale component reuse, release focus to the editor, and dispose it on Build transition, reload, session replacement, or shutdown.
      depends_on: P4.1.2
      Verify: Repeated toggles and lifecycle simulations leave no duplicate overlay, captured input, stale handle, or timer.

### Module 4.2: Shortcut Map

- [x] [P4.2.1] Register Mode Shortcut: Bind `Shift+Tab` to Build/Hacking toggle and provide mode notifications/status refresh.
      depends_on: P2.1.2, P3.1.4
      Verify: Shortcut toggles exactly once per press and entering Build closes the panel.

- [x] [P4.2.2] Register Panel Shortcut: Bind `Ctrl+Shift+H`; in Build show exactly `Hacking mode inactive.`, and in Hacking toggle the responsive panel.
      depends_on: P4.1.3
      Verify: Shortcut tests cover Build, Hacking, narrow terminal, repeated toggles, and overlay-focused input.

- [x] [P4.2.3] Prepare Keybinding Merge: Move `app.thinking.cycle` to `Ctrl+Shift+T`, remove its `Shift+Tab` binding, and leave `app.tools.expand` on native `Ctrl+O` without replacing unrelated user bindings.
      depends_on: P4.2.1
      Verify: Generated merge output contains only the intended action override when starting from the current no-keybindings state; fixture tests preserve unrelated keys.

### 🧪 Stage 4 Test Procedures

#### Test 4.1: Shortcut State Matrix
- **Type:** Integration with UI stubs
- **Preconditions:** Extension shortcuts and mocked mode/overlay APIs are registered.
- **Steps:**
  1. Press `Ctrl+Shift+H` in Build.
  2. Press `Shift+Tab`, then `Ctrl+Shift+H` twice.
  3. Press `Shift+Tab` while the panel is visible.
  4. Trigger thinking cycle with `Ctrl+Shift+T` and tool expansion with `Ctrl+O`.
- **Expected Result:** Build emits the inactive notice; Hacking toggles one panel; returning to Build closes it; thinking and tool actions remain available at their approved bindings.
- **Pass Command:** `node --test tests/*.test.ts`
- **Fail Indicators:** Shortcut collision, duplicate toggle, panel visible in Build, lost thinking control, or broken tool expansion.

#### Test 4.2: Overlay Non-Overlap
- **Type:** Manual TUI
- **Preconditions:** Test extension is loaded in fullscreen TUI at 110×30 or larger.
- **Steps:**
  1. Enter Hacking mode and open the overlay.
  2. Fill the editor with one line, then multiple lines.
  3. Resize across 110 columns and below 110 columns.
- **Expected Result:** Overlay remains above the editor dock, never shadows or covers input, and hides below the threshold with one warning.
- **Fail Indicators:** Any intersection with editor text/border, shadow effect, clipped panel content, or overlay remaining visible below threshold.

## Stage 5: Safe Global Deployment and Live Verification
> **Entry Condition:** Stages 1–4 automated tests pass and source behavior matches the approved preview.
> **Exit Condition:** The theme and extension are globally installed, active, recoverable, and manually verified in Ghostty.

### Module 5.1: Non-Destructive Installer

- [x] [P5.1.1] Implement Backup and Rollback: Snapshot affected global files/directories with permissions and generate a restore command before mutation.
      depends_on: P4.2.3
      Verify: Run installer in dry-run and temporary-HOME modes; restore reproduces original hashes and removes only installation-owned files.

- [x] [P5.1.2] Implement Global Deployment: Copy extension and theme into `~/.pi/agent/extensions/yorha-bunker-hud/` and `~/.pi/agent/themes/`, merge settings/keybindings atomically, and preserve `clawd-on-desk`, model/provider, terminal, and cursor settings.
      depends_on: P5.1.1
      Verify: JSON diff shows only `theme` and `app.thinking.cycle` intended changes plus new installation-owned files.

- [x] [P5.1.3] Add Idempotence and Uninstall Path: Re-running deployment produces no unintended diff; uninstall restores prior theme/keybinding values and leaves unrelated post-install changes intact where possible.
      depends_on: P5.1.2
      Verify: Two consecutive installs are equivalent; temporary-HOME uninstall passes restoration tests.

### Module 5.2: Runtime Verification

- [x] [P5.2.1] Reload and Smoke-Test Pi: Run `/reload`, verify theme discovery and extension startup, and inspect logs/output for errors.
      depends_on: P5.1.2
      Verify: Pi reports no extension/theme/keybinding error and remains operational with existing tools/extensions.

- [x] [P5.2.2] Verify Build Workflow: Exercise header/footer/editor, compact tools, `Ctrl+O`, `Ctrl+Shift+T`, and Build-mode inactive-panel notice in Ghostty.
      depends_on: P5.2.1
      Verify: Every approved Build interaction is observed without custom background effects.

- [x] [P5.2.3] Verify Hacking Workflow and Persistence: Enter Hacking, update status through the custom agent tool, toggle panel, reload/resume, and verify restored metadata and non-overlap at 110 columns.
      depends_on: P5.2.2
      Verify: State and evidence return after reload/resume; panel remains shadowless and above the editor; flag status changes only through explicit verified state.

### 🧪 Stage 5 Test Procedures

#### Test 5.1: Temporary-HOME Deployment
- **Type:** Integration
- **Preconditions:** Installer, uninstaller/restore, and fixture Pi settings are available.
- **Steps:**
  1. Create a temporary HOME containing representative settings, unrelated keybindings, and a third-party extension.
  2. Install twice.
  3. Inspect JSON and file ownership.
  4. Restore/uninstall and compare hashes.
- **Expected Result:** Install is idempotent, unrelated configuration survives, installation files are correct, and restore returns the fixture to its baseline.
- **Pass Command:** `bash tests/test_install.sh`
- **Fail Indicators:** Lost provider/model setting, modified third-party extension, invalid JSON, non-idempotent diff, or incomplete restore.

#### Test 5.2: Ghostty Acceptance Run
- **Type:** Manual E2E
- **Preconditions:** Global install complete; Ghostty uses Cascadia Code Nerd Font and background `#16161A`; terminal is at least 110×30.
- **Steps:**
  1. Start Pi and inspect Build mode.
  2. Execute one tool and toggle detail with `Ctrl+O`.
  3. Cycle thinking with `Ctrl+Shift+T`.
  4. Attempt panel toggle in Build.
  5. Enter Hacking with `Shift+Tab`, invoke `yorha_ctf_status`, and open the panel.
  6. Resize below and above 110 columns.
  7. Run `/reload` and resume the session.
- **Expected Result:** Visual hierarchy matches the approved preview within terminal constraints; no custom background appears; all shortcuts work; overlay never covers input; responsive hiding works; CTF metadata persists.
- **Fail Indicators:** Startup error, wrong background, shortcut conflict, missing status, editor overlap, panel shadow, state loss, or unrelated extension failure.

## V. Final Verification Checklist

- [x] Global theme is `yorha-bunker` and uses Ghostty `#16161A` as its field background.
- [x] No noise, scanline, image, gradient field, or panel shadow is introduced by the Pi customization.
- [x] Existing provider/model/terminal/cursor settings and `clawd-on-desk` remain intact.
- [x] Build is always the startup mode; CTF metadata may restore but remains hidden/inactive.
- [x] `Shift+Tab` toggles Build/Hacking; `Ctrl+Shift+T` cycles thinking; `Ctrl+O` expands tools.
- [x] `Ctrl+Shift+H` reports inactive in Build and toggles exactly one panel in Hacking.
- [x] Overlay appears only at supported dimensions and never covers the Operator Input Channel.
- [x] Built-in tool execution is not overridden; compact/detail behavior remains Pi-native.
- [x] CTF phase transitions and evidence updates are validated and branch-aware.
- [x] No flag text is stored or displayed; only UNVERIFIED/VERIFIED status exists.
- [x] All automated tests pass and the Ghostty-compatible TUI acceptance run has recorded evidence.
- [x] Backup and restore commands are documented and tested before final handoff.
