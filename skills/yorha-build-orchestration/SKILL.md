---
name: yorha-build-orchestration
description: Orchestrates software design, implementation, testing, review, and verification in YoRHa Build mode with Superpowers and pi-subagents. Use for feature work, bug fixes, refactors, implementation plans, or multi-agent coding tasks while Build mode is active.
license: MIT
compatibility: Requires Pi, obra/superpowers skills, and pi-subagents for delegation.
---

# YoRHa Build Orchestration

Use this workflow only while YoRHa **Build mode** is active. The parent agent owns decisions, integration, and final claims.

## Mandatory sequence

1. **Skill check** — read `using-superpowers`, then read every applicable process and domain skill before acting.
2. **Design** — use `brainstorming` before designing new behavior. Confirm material product or architecture choices with the operator.
3. **Recon** — inspect targeted code directly. Delegate to `scout` only when an isolated context will produce a useful handoff.
4. **Plan** — use `writing-plans` for multi-step work. Make tasks small, testable, and explicit about files and verification.
5. **Implement** — use `test-driven-development`. Prefer one `worker` writer at a time in a working tree.
6. **Review** — use `requesting-code-review`. Check specification compliance before code quality. The parent must inspect findings and the actual diff.
7. **Verify** — use `verification-before-completion`; run fresh commands and report exact evidence. Never infer success from a subagent summary.
8. **Finish** — use `finishing-a-development-branch` when branch integration or cleanup is relevant.

For bugs, load `systematic-debugging` before proposing a fix. For independent read-only questions, `dispatching-parallel-agents` may fan out scouts or reviewers.

## Delegation policy

Use `subagent` only when delegation is worth its context and token cost:

- **scout**: narrow codebase reconnaissance; read-only in intent.
- **researcher**: external or broad evidence gathering.
- **worker**: one bounded implementation task after design approval.
- **reviewer**: specification, correctness, tests, security, or quality review.
- **oracle**: difficult architecture or debugging consultation, not automatic authority.

Default async runs return control to the operator. Use `subagent_wait` only when the current turn must receive a result. Do not poll or sleep for completion.

### Parallel safety

- Parallelize independent, read-only investigation freely within sensible limits.
- Never let two writers edit the same working tree concurrently.
- Put concurrent writers in separate git worktrees with disjoint scopes.
- Project-local agents are repository-controlled prompts. Enable them only for a trusted repository and retain confirmation.
- Tool allowlists constrain model-facing tools; they are **not** an operating-system sandbox. Children can share filesystem and environment access.
- Never place secrets in delegated prompts or artifacts.

## Completion report

State:

- what changed,
- files changed,
- tests and verification commands with outcomes,
- review findings resolved or still open,
- residual risks and the next operator decision, if any.
