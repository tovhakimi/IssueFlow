# Phase 1: document-phase Skill

## Goal
Create a reusable Claude Code skill that automates phase documentation after each build step — so the prompt log and phase summaries are consistent and nothing is forgotten.

## Skill Design

| Property      | Value                                        |
|---------------|----------------------------------------------|
| **Trigger**   | `/document-phase`                            |
| **Location**  | `.claude/skills/document-phase/SKILL.md`     |
| **Type**      | Interactive (collects inputs via questions)   |

## Input Flow

1. **Phase number** — integer (e.g., `2`)
2. **Phase name** — short label (e.g., `Foundation + Users + Auth`)
3. **Prompt used** — the exact prompt given to Claude for this phase
4. **Is this the final phase?** — yes/no (controls whether `run.md` is generated)

## Auto-Detection

Run `git diff --name-only HEAD~1` to detect files changed in the last commit. Display the list and ask the user to confirm or edit.

## Outputs

| File              | Action      | Content                                              |
|-------------------|-------------|------------------------------------------------------|
| `prompts.md`      | Append      | Phase N block: prompt, generated files list           |
| `Instructions.md` | Append      | One-line summary under `## Phase Log`                 |
| `run.md`          | Create      | Full build/run guide (final phase only)               |

## Key Design Decisions
- **Interactive, not fully automated** — because the prompt text and manual changes need human input; auto-detecting everything would miss context
- **Git diff for file detection** — faster and more accurate than scanning the filesystem; the user confirms so mistakes are caught
- **Append-only to prompts.md** — each invocation adds; never overwrites previous phases

## Dependencies on Other Phases
- None — this is a tooling phase that runs independently of the app code

## Risks & Edge Cases
- If the user hasn't committed yet, `git diff HEAD~1` shows wrong files — the skill warns and asks for manual input
- Multi-commit phases need the user to adjust the file list manually
