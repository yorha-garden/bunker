# README Refresh Design

**Date:** 2026-08-29  
**Status:** Approved design

## Objective

Rewrite the repository README as a personal operational reference for the YoRHa Bunker extension. The document must explain that this repository contains an extension for the Pi coding agent rather than a standalone application.

## Audience and tone

The primary reader is the repository owner returning to install, operate, verify, repair, or understand the extension. Use direct technical prose. Keep YoRHa terminology only where it names an actual interface element or operating mode.

The README will identify the project as private without adding license or redistribution language.

## Reference pattern

Use the practical structure found in established Pi extension READMEs such as `pi-subagents`:

1. State the purpose in one sentence.
2. Give the installation path early.
3. Show first-use controls and commands.
4. Explain behavior and architecture after the reader can start using it.
5. Keep security constraints next to the features that create them.

Do not copy wording or presentation assets from another repository.

## Structure

The README will contain:

1. Title and one-sentence purpose
2. Private-project note
3. What the extension changes in Pi
4. Requirements
5. Installation and reload instructions
6. Controls and first-use commands
7. Build mode
8. Hacking mode
9. Provider and response telemetry
10. Project layout
11. Verification commands
12. Repair and restore procedures
13. Known constraints

## Content rules

- Preserve factual implementation details from the current README.
- Retain exact pinned package versions and security caveats.
- Retain the machine-specific restore commands because this is a personal operational document.
- Separate normal installation from startup repair and restoration.
- Remove repeated descriptions of the same UI behavior.
- Avoid badges, promotional claims, contribution instructions, and open-source license language.
- Use short paragraphs, compact lists, and tables only where they improve lookup speed.
- Do not imply that third-party subagents are isolated from the host system.
- Do not claim support or behavior that the repository tests and source do not establish.

## Repository description

Use this GitHub repository description:

> Private Pi extension with a YoRHa-inspired TUI, Build and Hacking modes, subagent orchestration, provider usage telemetry, and responsive tool output.

## Validation

Before completion:

1. Run the README through the Unslop preservation and prose scanners.
2. Check every command, path, version, shortcut, mode name, and security constraint against the source and tests.
3. Run the repository test suite to ensure documentation changes did not disturb tracked files or scripts.
4. Give the finished README to a fresh reader context and verify that it can answer installation, first-use, verification, recovery, and architecture questions.
