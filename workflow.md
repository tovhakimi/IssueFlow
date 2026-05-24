# IssueFlow — AI-Assisted Development Workflow

## Overview

Every stage of IssueFlow's development was AI-assisted, from architecture planning through testing and documentation. This document covers the tools, techniques, and strategies used.

| Tool / Technique           | Purpose                                              |
|----------------------------|------------------------------------------------------|
| CLAUDE.md                  | Project instructions: locked in the API contract before any code was written |
| document-phase Skill       | Automated phase documentation after each build step  |
| validate-requirements Skill| PDF-driven test generation and coverage reporting    |
| Model Router Plugin        | Automatic model tier routing (Haiku/Sonnet/Opus)     |
| Graphify                   | Codebase knowledge graph for architectural analysis  |

---

## 1. Project Instructions (CLAUDE.md)

**Strategy:** Write `CLAUDE.md` manually from the requirements PDF _before_ opening Claude Code.

**Why this matters:** CLAUDE.md acts as a contract between you and the AI. By front-loading all API routes, entity rules, and business rules into the instructions file, every subsequent prompt inherits those constraints automatically. Claude Code reads CLAUDE.md at the start of every session, so it never drifts from the spec — even across multiple sessions and hundreds of prompts.

**What it contains:**
- Stack and architecture summary
- Exact API contract (routes, methods, status codes)
- Entity rules (ID types, soft-delete scope, versioned entities)
- 13 business rules that must never be skipped
- Test commands

**Result:** Zero API contract drift across 8 build phases and 11 bug fixes.

---

## 2. Custom Skills

### 2.1 document-phase

| Property  | Value                                     |
|-----------|-------------------------------------------|
| Trigger   | `/document-phase`                         |
| Location  | `.claude/skills/document-phase/SKILL.md`  |

**What it does:** After completing and committing a build phase, the user invokes `/document-phase`. The skill interactively collects the phase number, name, prompt used, and whether it's the final phase. It auto-detects changed files via `git diff --name-only HEAD~1`, asks for confirmation, then appends structured records to `prompts.md` and `Instructions.md`. On the final phase, it also generates `run.md`.

**Why it matters:** Without this skill, documentation would be ad-hoc and inconsistent. The skill enforces a standard format for every phase, ensuring nothing is forgotten.

### 2.2 validate-requirements

| Property  | Value                                           |
|-----------|--------------------------------------------------|
| Trigger   | `/validate-requirements`                        |
| Location  | `.claude/skills/validate-requirements/SKILL.md` |

**What it does:** Reads the actual requirements PDF at runtime using `pdfminer`, dynamically identifies every testable requirement, generates curl-based tests, executes them against `localhost:3000`, and reports pass/fail results with coverage statistics.

**Why it matters:** This is a PDF-driven testing approach — the tests are generated from the source of truth (the spec PDF), not from the implementation. If a requirement exists in the PDF but the API doesn't satisfy it, the test catches it. This prevents the "implemented what I thought the spec said" failure mode.

**Test data:** All test entities are prefixed with `_vr_` + timestamp to avoid polluting real data.

---

## 3. Plugin: Model Router

The [claude-model-router-hook](https://github.com/tzachbon/claude-model-router-hook) plugin automatically selects the appropriate Claude model tier based on prompt complexity. No manual model switching needed.

| Tier       | Used For                                              | Cost    |
|------------|-------------------------------------------------------|---------|
| **Haiku**  | Git operations, file lookups, formatting, quick reads | Lowest  |
| **Sonnet** | Feature implementation, debugging, code writing, tests| Medium  |
| **Opus**   | Architecture planning, deep multi-file analysis       | Highest |

**Sub-agent routing:** Agents spawned during a session also follow tier rules. Simple search agents use Haiku, implementation agents use Sonnet, and only architectural reasoning gets Opus.

**Configuration:** `~/.claude/model-router.json` supports `"warn"` (recommend only) or `"autoswitch"` (change model automatically). Prefix any prompt with `~` to bypass classification.

---

## 4. Knowledge Graph: Graphify

Ran `/graphify` to generate a codebase knowledge graph for architectural visualization.

| Metric      | Value |
|-------------|-------|
| Nodes       | 422   |
| Edges       | 735   |
| Communities | 18    |
| Files       | 71    |

**God nodes (most connected):**

| Node              | Edges |
|-------------------|-------|
| TicketsService    | 26    |
| TicketsController | 18    |
| UsersService      | 17    |
| CommentsService   | 15    |

**Output:** `graphify-out/` directory containing `graph.html` (interactive visualization) and `GRAPH_REPORT.md` (text summary).

**How to view:** Open `graphify-out/graph.html` in a browser.

---

## 5. Build Phases

| Phase | Name                          | Summary                                                    | Plan                                     |
|-------|-------------------------------|------------------------------------------------------------|------------------------------------------|
| 0     | Architecture & Planning       | Module map, data model, phase breakdown                    | [plan-phase-0.md](plans/plan-phase-0.md) |
| 1     | document-phase Skill          | Created automated documentation skill                      | [plan-phase-1.md](plans/plan-phase-1.md) |
| 2     | Foundation + Users + Auth     | TypeORM, User entity, JWT auth, guards, decorators         | [plan-phase-2.md](plans/plan-phase-2.md) |
| 3     | Projects + Tickets Core       | AuditLog, Project, Ticket, status lifecycle, auto-assign   | [plan-phase-3.md](plans/plan-phase-3.md) |
| 4     | Comments + Mentions + Audit   | Comment, Mention, @mention sync, audit wiring              | [plan-phase-4.md](plans/plan-phase-4.md) |
| 5     | Deps + Attachments + CSV      | Dependencies, file uploads, CSV export/import              | [plan-phase-5.md](plans/plan-phase-5.md) |
| 6     | Scheduler                     | Hourly auto-escalation cron job                            | [plan-phase-6.md](plans/plan-phase-6.md) |
| 7     | Testing                       | 31 tests: unit (status, lock, mentions) + e2e (auth flow) | [plan-phase-7.md](plans/plan-phase-7.md) |
| 8     | Documentation + Dockerize     | Docs, Dockerfile, single-command startup                   | [plan-phase-8.md](plans/plan-phase-8.md) |

---

## 6. Fixes Log

| Fix | Title                                  | Phase | Root Cause                                             |
|-----|----------------------------------------|-------|--------------------------------------------------------|
| 1   | AUTO_ASSIGN Audit Log                  | 3     | Auto-assign merged into CREATE entry instead of separate SYSTEM entry |
| 2   | TicketType TASK -> TECHNICAL           | 3     | Enum value didn't match spec (TASK vs TECHNICAL)       |
| 3   | Dependency API Contract                | 5     | DTO field name, route param, and response format mismatched spec |
| 4   | @Mention Mechanism (4 bugs)            | 4     | Case-sensitive lookup, missing response field, broken joins, no relations |
| 5   | Auto-Assignment & Workload (4 bugs)    | 3     | Missing JOIN, wrong field name, wrong sort, audit guard bug |
| 6   | Auto-Assignment Scope                  | 3     | Query searched all developers system-wide, not project-scoped |
| 7   | Optimistic Locking Bypass              | 3+4   | Version field was optional; TypeORM error uncaught     |
| 8   | Missing Audit: User Create/Update      | 2     | No audit log entries for CREATE_USER / UPDATE_USER     |
| 9   | Missing Audit: Dependency Add/Remove   | 5     | No audit log entries for ADD_DEPENDENCY / REMOVE_DEPENDENCY |
| 10  | Missing Audit: Attachment Add/Remove   | 5     | No audit log entries for ADD_ATTACHMENT / REMOVE_ATTACHMENT |
| 11  | DELETE /users Security                 | 2     | No ADMIN guard, no self-delete prevention, no reference cleanup |

---

## 7. Model Usage

Model selection was handled automatically by the Model Router plugin throughout the project. The plugin classifies each prompt by complexity using keyword and pattern matching (zero API calls) and routes to the appropriate tier.

**How it played out across phases:**
- **Planning (Phase 0):** Opus — full architecture reasoning with tradeoff analysis
- **Skill creation (Phase 1):** Sonnet — structured template generation
- **Implementation (Phases 2-6):** Sonnet for code writing, Haiku for git ops and file lookups within those sessions
- **Bug fixes:** Sonnet for diagnosis and code changes
- **Testing (Phase 7):** Sonnet for test authoring
- **Documentation (Phase 8):** Mix of Sonnet (content generation) and Haiku (file operations)
- **Deep analysis (security/performance reviews):** Opus — multi-file reasoning across the full codebase
