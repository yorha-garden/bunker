# README Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current README with a concise personal operations guide for the private YoRHa Bunker extension and provide the finalized GitHub repository description.

**Architecture:** The README will follow a task-first structure: identity and requirements, installation and first use, operating modes and telemetry, then maintenance and implementation reference. Existing verified facts remain intact while repeated UI descriptions are consolidated.

**Tech Stack:** Markdown, Bash command examples, Pi extension APIs and commands, Unslop prose validation scripts.

## Global Constraints

- The repository is private and the README is primarily for its owner.
- Use restrained technical prose; YoRHa terms appear only for real interface concepts.
- State that this is an extension for the Pi coding agent, not a standalone application.
- Preserve exact pinned versions, commands, shortcuts, restore paths, and security boundaries.
- Do not add badges, promotional claims, contribution instructions, or open-source license language.
- Use this repository description verbatim: `Private Pi extension with a YoRHa-inspired TUI, Build and Hacking modes, subagent orchestration, provider usage telemetry, and responsive tool output.`

---

### Task 1: Establish the factual README contract

**Files:**
- Read: `README.md`
- Read: `index.ts`
- Read: `install.sh`
- Read: `repair-startup.sh`
- Read: `mode.ts`
- Read: `build-orchestration.ts`
- Read: `provider-usage.ts`
- Read: `tool-output-affordance.ts`
- Read: `tests/*.test.ts`
- Read: `tests/test_install.sh`
- Read: `tests/test_tui_smoke.py`
- Create: `/tmp/yorha-readme-facts.md`

**Interfaces:**
- Consumes: implementation, test contracts, existing README, and approved design.
- Produces: a checked list of names, versions, commands, controls, dimensions, paths, and safety statements that the rewrite must preserve.

- [ ] **Step 1: Extract current claims**

Record the existing README’s commands, shortcuts, package versions, mode behavior, telemetry behavior, panel dimensions, and restore paths in `/tmp/yorha-readme-facts.md`.

- [ ] **Step 2: Verify claims against implementation and tests**

For each claim, cite the source or test file that establishes it. Mark unsupported wording for removal rather than carrying it into the rewrite.

- [ ] **Step 3: Check the factual contract**

Run:

```bash
grep -nE 'pi-subagents@0\.46\.0|superpowers@v6\.2\.0|Ctrl\+Shift\+H|Ctrl\+Shift\+T|Ctrl\+O|110 columns|28 rows|restore\.sh' /tmp/yorha-readme-facts.md
```

Expected: every required operational fact appears in the fact sheet.

### Task 2: Rewrite the README

**Files:**
- Modify: `README.md`
- Read: `docs/superpowers/specs/2026-08-29-readme-refresh-design.md`
- Read: `/tmp/yorha-readme-facts.md`

**Interfaces:**
- Consumes: approved structure and verified fact sheet.
- Produces: a complete task-first operations README with no placeholder sections.

- [ ] **Step 1: Diagnose the current prose**

Copy the source README to `/tmp/yorha-readme-original.md`, then run the Unslop constraint extractor and scanners from `/Users/aliceevr/.pi/agent/skills/unslop` against it. Save scanner output under `/tmp/yorha-readme-unslop-before/`.

- [ ] **Step 2: Draft the complete README**

Write these sections in order: purpose and private status, changes to Pi, requirements, installation, controls, Build mode, Hacking mode, telemetry and rendering, project layout, verification, repair and restore, known constraints.

- [ ] **Step 3: Preserve operational facts**

Compare the draft against `/tmp/yorha-readme-facts.md`. Restore any omitted command, version, shortcut, safety condition, or recovery path required by the approved design.

- [ ] **Step 4: Check Markdown integrity**

Run:

```bash
git diff --check -- README.md
python3 - <<'PY'
from pathlib import Path
text = Path('README.md').read_text()
assert '[To be written]' not in text
assert ('TO' + 'DO') not in text
assert text.count('```') % 2 == 0
print('README_STRUCTURE_OK')
PY
```

Expected: no whitespace errors, placeholders, or unbalanced code fences.

### Task 3: Validate prose and facts

**Files:**
- Modify if required: `README.md`
- Read: `/tmp/yorha-readme-facts.md`

**Interfaces:**
- Consumes: rewritten README.
- Produces: preservation and prose-scanner evidence with all blocking findings resolved.

- [ ] **Step 1: Run Unslop validation**

Capture the repository root before entering the Unslop directory, then run:

```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
cd /Users/aliceevr/.pi/agent/skills/unslop
python3 scripts/validate_preservation.py /tmp/yorha-readme-original.md "$REPO_ROOT/README.md"
python3 scripts/banned_phrase_scan.py < "$REPO_ROOT/README.md"
python3 scripts/structure_scan.py < "$REPO_ROOT/README.md"
python3 scripts/silhouette_scan.py < "$REPO_ROOT/README.md"
python3 scripts/readability_metrics.py < "$REPO_ROOT/README.md"
python3 scripts/diff_check.py /tmp/yorha-readme-original.md "$REPO_ROOT/README.md"
```

- [ ] **Step 2: Review every scanner result contextually**

Fix confirmed filler, repetitive structure, inflated claims, and ambiguous wording. Protect technical terms, literal interface labels, commands, and safety rules.

- [ ] **Step 3: Re-run blocking checks**

Repeat preservation, banned-phrase, structure, and silhouette scans after any edit. Expected: no preservation loss and no introduced hard findings.

- [ ] **Step 4: Verify factual anchors**

Run targeted searches for the exact package versions, controls, minimum dimensions, install command, verification commands, and restore paths. Expected: every approved fact remains present exactly once where repetition is unnecessary.

### Task 4: Reader-test the README

**Files:**
- Read: `README.md`
- Modify if required: `README.md`

**Interfaces:**
- Consumes: validated README only, without conversation context.
- Produces: independent answers to installation, operation, verification, recovery, architecture, and security questions.

- [ ] **Step 1: Dispatch a fresh read-only reviewer**

Give the reviewer only `README.md` and ask it to answer:

1. What is this repository?
2. Is it standalone software or a Pi extension?
3. How is it installed and reloaded?
4. How do Build and Hacking modes differ?
5. How is the installation verified?
6. How is the previous setup restored?
7. Which third-party components execute with user-level access?
8. What terminal dimensions does the panel require?

- [ ] **Step 2: Check for unsupported assumptions**

Ask the reviewer to list ambiguities, contradictions, missing prerequisites, and statements that sound promotional rather than operational.

- [ ] **Step 3: Resolve reader-test findings**

Make only evidence-backed corrections. Repeat the relevant prose and factual checks after edits.

### Task 5: Final verification and commit

**Files:**
- Modify: `README.md`
- Commit: `README.md`

**Interfaces:**
- Consumes: reader-tested README and approved repository description.
- Produces: one documentation commit and the description text for the operator to apply to the private repository host.

- [ ] **Step 1: Run repository verification**

Run:

```bash
node --test tests/*.test.ts
python3 tests/test_theme.py
YORHA_SKIP_PACKAGES=1 bash tests/test_install.sh
bash tests/test_repair_startup.sh
python3 tests/test_tui_smoke.py
git diff --check
```

Expected: 41 Node tests pass, all contract/smoke scripts exit zero, and the diff check is clean.

- [ ] **Step 2: Inspect the final diff**

Run:

```bash
git diff -- README.md
git status --short
```

Expected: only the approved README and plan/spec workflow files are changed or newly committed.

- [ ] **Step 3: Request final commit authorization**

Present the README summary, validation evidence, reader-test findings, and exact repository description. Do not commit the README until the operator explicitly finalizes the commit.

- [ ] **Step 4: Commit after authorization**

Run:

```bash
git add README.md docs/superpowers/plans/2026-08-29-readme-refresh.md
git commit -m "docs: rewrite README as operations guide"
```

- [ ] **Step 5: Verify commit and clean status**

Run:

```bash
git status --short --branch
git show --stat --oneline HEAD
```

Expected: clean `main` branch and a commit containing only the README and implementation plan.
