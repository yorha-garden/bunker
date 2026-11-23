# Tool Cards: Hybrid Tool Output Rendering

## Goal
Improve agent UX by rendering built-in tool calls as structured cards in the YoRHa Bunker theme. Routine successes collapse to one line; failures, edits, and matches expand automatically.

## Scope
First deliverable: tool cards for `bash`, `read`, `edit`, `write`, `grep`, `find`, `ls`.
Follow-up specs (out of scope here): richer assistant Markdown (tables, callouts, headings) and activity cards (file-changed, subagent progress).

## Approach
Register same-name tools that set only `renderCall` / `renderResult` (render-only override, documented in Pi extensions "Overriding Built-in Tools"). Execution, truncation, and prompt metadata stay Pi's. Rejected: patching `Text.prototype.render` (blind to structure, fragile with render caching) and wrapping tool execution (duplicates Pi logic).

## Modules
- `tool-cards.ts`: card layout, header, collapse policy, per-tool summaries.
- `output-detect.ts`: pure detector returning one of `diff | json | test | error | text`; falls back to `text`.
- Reuse `tokens.ts`, `GLYPH`, the recessed `#131317` panel, and `fit()` truncation.
- `index.ts` registers the overrides.

## Collapse policy
Collapsed = one line: `<glyph> <TOOL>  <key arg> · <duration> · <summary>`.
- `bash`: `✓ BASH  npm test · 2.1s · exit 0 · 41 passed`; auto-expand on exit != 0 or error/traceback in output.
- `read`: `✓ READ  path · N lines` (range if requested); never auto-expands.
- `edit`: `✓ EDIT  path · +A −D`; always expanded with colored diff.
- `write`: `✓ WRITE  path · N lines (new|overwrote)`; shows first lines.
- `grep`: `✓ GREP  "pat" · M matches in F files`; expanded, max 8 matches grouped by file, match highlighted.
- `find` / `ls`: `✓ FIND  pat · N results`; never auto-expands.
- Running: `⟳ <TOOL> <arg> · <elapsed>`. Failure glyph `✗`.

## Expanded card
Header line, then recessed panel. Content by detector: diff (green/red), JSON (pretty-printed), test (pass/fail summary first), error (failing line highlighted), text (plain). Long output truncated middle to first 20 / last 10 lines with `N lines hidden · Ctrl+O`.

## Constraints
- Every line truncated to terminal width; narrow widths drop duration then summary before clipping the command.
- `render()` returns `readonly string[]` and never mutates cached arrays (Pi 1.6.0).
- Headers show the command as written; no secret redaction (unchanged guidance: keep secrets out of commands).
- Detector is heuristic; wrong guess degrades to plain text.

## Testing
- Unit tests for detector and per-tool summary/collapse decisions, including width truncation and narrow terminals.
- Existing suite (`node --test tests/*.test.ts`) and TUI smoke test must pass.
- Work on a branch, PR to `main`; sync installed copy after merge.
