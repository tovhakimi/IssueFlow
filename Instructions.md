## Setup
- Planned phases and architecture with claude.ai before opening Claude Code
- Wrote CLAUDE.md manually based on requirements doc and README.md
- Created document-phase skill for automated documentation
- Installed [claude-model-router-hook](https://github.com/tzachbon/claude-model-router-hook) plugin for automatic model tier routing — classifies each prompt by complexity and switches between Haiku (simple tasks), Sonnet (implementation), and Opus (architecture/deep analysis) with zero API calls. This ensures cost-efficient model usage: simple git ops don't burn Opus tokens, while complex refactors get the reasoning power they need.

## Phase Log
- Phase 1 (document-phase Skill): created `.claude/skills/document-phase/SKILL.md` — interactive skill that logs phase prompts, generated files, and manual changes to prompts.md and Instructions.md after each build phase
- Phase 2 (Foundation + Users + Auth): wired TypeORM + PostgreSQL, User entity, UsersModule (CRUD), AuthModule (JWT login/logout/me, bcrypt, in-memory deny-list), global JwtAuthGuard via APP_GUARD
- Phase 3 (Projects + Tickets Core): AuditLog entity, ProjectsModule (soft-delete, workload), TicketsModule (status lifecycle, auto-assignment, optimistic locking, soft-delete, DONE guard)
- Phase 4 (Comments + Mentions + Audit Log): Comment + Mention entities, CommentsModule with @mention sync (add/remove stale), MentionsController owns GET /users/:userId/mentions, AuditLog wired to all mutations
- Phase 5 (Dependencies + Attachments + Export/Import): TicketDependency entity (same-project rule, DONE blocker gate), Attachment entity (10MB limit, type filter), CSV export via csv-stringify, CSV import via csv-parse/sync
- Phase 6 (Scheduler): EscalationService with @Cron(EVERY_HOUR) — escalates overdue ticket priority LOW→MEDIUM→HIGH→CRITICAL, sets isOverdue=true at CRITICAL
- Phase 7 (Tests): 17 unit tests (status lifecycle, optimistic lock, auto-assign, mentions, cron) + 6 e2e tests (auth happy path with in-memory mock), all passing
- Phase 8 (Documentation): generated prompts.md, updated Instructions.md, created run.md

## Fixes
- AUTO_ASSIGN audit log: tickets.service.ts was merging auto-assignment into the CREATE log entry. Fixed to write two separate entries — actor=USER/action=CREATE and actor=SYSTEM/action=AUTO_ASSIGN. Tests updated to assert both.
- TicketType TASK → TECHNICAL: renamed enum value across entity, service spec, and performance spec to match API contract.
- Dependency API contract: fixed 3 violations — DTO field `blockedById` → `blockedBy`, DELETE param `:blockedById` → `:blockerId`, GET now returns Ticket[] instead of TicketDependency[]. Replaced deprecated findByIds() with findBy({ id: In([...]) }).
- @Mention mechanism: fixed 4 bugs — (1) case-insensitive username lookup via ILike, (2) added `mentionedUsers: [{ id, username, fullName }]` to all comment responses, (3) `findMentionsByUser` now returns full comments instead of raw mention rows, (4) added @ManyToOne/@OneToMany relations on Mention↔Comment and Mention→User with eager loading.
- Auto-assignment & workload: fixed 4 bugs — (1) workload query missing LEFT JOIN on tickets, (2) response field `activeTickets` → `openTicketCount`, (3) workload sort by `openTicketCount` instead of user `createdAt`, (4) auto-assign audit log guard now requires `assigneeId` to be truthy before logging.
- Graphify: ran `/graphify` to generate a codebase knowledge graph (`graphify-out/`) for architectural visualization and analysis — 422 nodes, 735 edges, 18 communities across 71 files.

## Model Usage
Throughout this project, model selection was handled automatically by the [claude-model-router-hook](https://github.com/tzachbon/claude-model-router-hook) plugin. Instead of manually switching models, the plugin classifies each prompt by complexity and routes to the appropriate tier:

| Tier | Used For |
|------|----------|
| **Haiku** | Git operations, file lookups, formatting, quick reads |
| **Sonnet** | Feature implementation, debugging, code writing, test authoring |
| **Opus** | Architecture planning, deep multi-file analysis, complex refactors |

Sub-agents spawned during a session also follow these tier rules — simple search agents use Haiku, implementation agents use Sonnet, and only architectural reasoning gets Opus. This keeps costs down without sacrificing quality where it matters.
