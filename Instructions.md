## Setup
- Planned phases and architecture with claude.ai before opening Claude Code
- Wrote CLAUDE.md manually based on requirements doc and README.md
- Created document-phase skill for automated documentation

## Phase Log
- Phase 1 (document-phase Skill): created `.claude/skills/document-phase/SKILL.md` — interactive skill that logs phase prompts, generated files, and manual changes to prompts.md and Instructions.md after each build phase
- Phase 2 (Foundation + Users + Auth): wired TypeORM + PostgreSQL, User entity, UsersModule (CRUD), AuthModule (JWT login/logout/me, bcrypt, in-memory deny-list), global JwtAuthGuard via APP_GUARD
- Phase 3 (Projects + Tickets Core): AuditLog entity, ProjectsModule (soft-delete, workload), TicketsModule (status lifecycle, auto-assignment, optimistic locking, soft-delete, DONE guard)
- Phase 4 (Comments + Mentions + Audit Log): Comment + Mention entities, CommentsModule with @mention sync (add/remove stale), MentionsController owns GET /users/:userId/mentions, AuditLog wired to all mutations
- Phase 5 (Dependencies + Attachments + Export/Import): TicketDependency entity (same-project rule, DONE blocker gate), Attachment entity (10MB limit, type filter), CSV export via csv-stringify, CSV import via csv-parse/sync
- Phase 6 (Scheduler): EscalationService with @Cron(EVERY_HOUR) — escalates overdue ticket priority LOW→MEDIUM→HIGH→CRITICAL, sets isOverdue=true at CRITICAL
- Phase 7 (Tests): 17 unit tests (status lifecycle, optimistic lock, auto-assign, mentions, cron) + 6 e2e tests (auth happy path with in-memory mock), all passing
- Phase 8 (Documentation): generated prompts.md, updated Instructions.md, created run.md
