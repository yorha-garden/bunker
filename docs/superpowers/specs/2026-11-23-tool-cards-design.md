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

## Icons (Ghostty, Kitty graphics)
Target terminal is Ghostty. Tool, status, and file-type icons are Pixelarticons rendered as inline Kitty-graphics images, reusing the existing `Image`/`pixelIcon` path in `components.ts`.
- Assets: `assets/pixelarticons/*.svg` (source, with LICENSE) rasterized to `assets/generated/*.png`, recolored per theme state (accent, success, error). Icons: bash (terminal), read (file), edit (pen/edit), write (file-plus), grep (search), find (search-box), ls (folder), pass, fail, running. `install.sh` already copies `assets/generated/*.png`; the new files ride along.
- One-line cards require a 1-row icon: render at 2 cells wide (cells are about 1:2, so a square image is 1 row). Verify empirically in Ghostty before committing to the layout; if an icon spans more than 1 row, fall back to the glyph for collapsed lines and keep the image for expanded headers only.
- `icons.ts` registry maps tool/status to `{ png, glyph }`. Image mode is used when the terminal supports Kitty graphics (`TERM_PROGRAM=ghostty` or Pi's image-capability check); otherwise the Unicode glyph (`✓ ✗ ⟳`, tool initials) is used. Setting `yorha.icons: "image" | "glyph" | "auto"` (default `auto`) overrides.
- Risks: Pi has had Kitty redraw/overlay bugs (fixed through 1.6.0) and many images in a long transcript cost bandwidth; icon bytes are base64-cached once per icon, not per card. Narrow widths drop the icon first, then duration, then summary.
- Tests: registry mapping and fallback selection (unit), width math with and without icon, plus a Ghostty manual smoke check recorded in the PR.

### Deviations
- Status is a colored text glyph (`⟳ ✓ ✗`) rather than recolored pass/fail/running PNGs; only the seven tool icons are rasterized.
- Icon mode is chosen by the `YORHA_ICONS=image|glyph|auto` environment variable instead of a `yorha.icons` settings key, so the installer and Pi's settings.json stay unchanged.
- Registration lives in `tool-cards-register.ts` with every Pi dependency (tool definitions, `Image`, text metrics) injected from `index.ts`, so it is unit-tested with fakes and no Pi packages. Cards use `renderShell: "self"` so Pi's default boxed shell and its per-state background are not applied; `renderCall` draws only while the call is running and `renderResult` draws the final card.
- The recessed `#131317` surface is not applied to card bodies (code panels still use it).
- Not implemented: running elapsed time (the running header shows `running`), the `write` `(new|overwrote)` marker (Pi's result does not say), `grep` match highlighting, and the test-summary-first body for test output (the summary is in the header only).
- Only automatically expanded cards are cut to the first 20 / last 10 lines with `N lines hidden · Ctrl+O`; a card expanded with `Ctrl+O` shows its full body, and `grep` then lists every match instead of the first 8.
- Image icons are replaced by glyphs while the CTF panel overlay is open, because pi-tui does not draw overlays on rows that hold an image.

## Constraints
- Every line truncated to terminal width; narrow widths drop duration then summary before clipping the command.
- `render()` returns `readonly string[]` and never mutates cached arrays (Pi 1.6.0).
- Headers show the command as written; no secret redaction (unchanged guidance: keep secrets out of commands).
- Detector is heuristic; wrong guess degrades to plain text.

## Testing
- Unit tests for detector and per-tool summary/collapse decisions, including width truncation and narrow terminals.
- Existing suite (`node --test tests/*.test.ts`) and TUI smoke test must pass.
- Work on a branch, PR to `main`; sync installed copy after merge.
