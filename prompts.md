## Phase 1: document-phase Skill

**Prompt:**
Create a skill that documents completed Claude Code build phases for the IssueFlow project.
After each phase, the user invokes the skill to log what happened into structured files,
building an audit trail of the entire build process.

User Decisions:
- "What was generated": auto-detect via `git diff --name-only HEAD~1`, user confirms
- Location: inside the project at `.claude/skills/document-phase/SKILL.md`

Inputs the skill collects interactively:
1. Phase number
2. Phase name
3. Prompt used (the exact prompt given to Claude for this phase)
4. Manual changes made after Claude's output (user types; "none" is valid)
5. Is this the final phase? (yes/no)

Auto-detection: run `git diff --name-only HEAD~1`, display list, ask user to confirm or edit.

Outputs:
1. prompts.md (project root) — append Phase N block with prompt, generated files, manual changes
2. Instructions.md (project root) — append one-line summary under `## Phase Log`
3. run.md (project root, final phase only) — step-by-step run guide from package.json + compose.yml

**Generated:**
- .claude/skills/document-phase/SKILL.md

**Manual Changes:**
None

---

## Phase 2: Foundation + Users + Auth

**Prompt:**
Implement the following plan:

# IssueFlow — Full Implementation Plan (Phases 2–8)

Install missing packages (@nestjs/jwt, @nestjs/passport, @nestjs/schedule, passport,
passport-jwt, passport-local, bcrypt). Then implement Phase 2:

- TypeORM config in app.module.ts connecting to postgres (host/user/pass/db = issueflow)
- User entity: id, username, email, fullName, role (ADMIN/DEVELOPER/VIEWER), passwordHash, createdAt
- UsersModule: CRUD, POST /users/update/:userId (not PATCH), all returns 200
- AuthModule: JWT (1h expiry, secret from env), bcrypt hashing, login/logout/me
- Global JwtAuthGuard via APP_GUARD; @Public() decorator to opt out
- In-memory Set of JTIs for logout deny-list
- ValidationPipe(whitelist: true, transform: true) in main.ts

**Generated:**
- src/app.module.ts
- src/main.ts
- src/common/decorators/current-user.decorator.ts
- src/common/decorators/public.decorator.ts
- src/common/decorators/roles.decorator.ts
- src/common/guards/roles.guard.ts
- src/users/user.entity.ts
- src/users/dto/create-user.dto.ts
- src/users/dto/update-user.dto.ts
- src/users/users.service.ts
- src/users/users.controller.ts
- src/users/users.module.ts
- src/auth/jwt.strategy.ts
- src/auth/local.strategy.ts
- src/auth/guards/jwt-auth.guard.ts
- src/auth/auth.service.ts
- src/auth/auth.controller.ts
- src/auth/auth.module.ts
- package.json (added auth/schedule/bcrypt packages)

**Manual Changes:**
None

---

## Phase 3: Projects + Tickets Core

**Prompt:**
(Continuation of full plan — Phase 3)

Implement Projects and Tickets modules:
- AuditLog entity (actor, action, entityType, entityId, performedBy, changes, timestamp) — append-only
- Project entity: id, name, description, ownerId, createdAt, deletedAt (@DeleteDateColumn)
- ProjectsModule: CRUD, PATCH /projects/:projectId, soft-delete, restore (ADMIN), GET /projects/deleted (ADMIN), GET /projects/:projectId/workload
- Ticket entity: id, title, description, status, priority, type, projectId, assigneeId, dueDate, isOverdue, version (@VersionColumn), createdAt, deletedAt
- TicketsModule: CRUD, PATCH /tickets/:ticketId, soft-delete, restore (ADMIN)
- Status lifecycle: TODO→IN_PROGRESS→IN_REVIEW→DONE only; reject backward; DONE tickets reject all updates
- Auto-assignment: if no assigneeId, pick DEVELOPER with fewest non-DONE tickets in project (tie-break: earliest createdAt); log with actor=SYSTEM
- Optimistic locking: version mismatch → 409 ConflictException
- Route order: /deleted and /export BEFORE /:ticketId

**Generated:**
- src/audit-log/audit-log.entity.ts
- src/audit-log/audit-log.service.ts
- src/audit-log/audit-log.controller.ts
- src/audit-log/audit-log.module.ts
- src/projects/project.entity.ts
- src/projects/dto/create-project.dto.ts
- src/projects/dto/update-project.dto.ts
- src/projects/projects.service.ts
- src/projects/projects.controller.ts
- src/projects/projects.module.ts
- src/tickets/ticket.entity.ts
- src/tickets/dto/create-ticket.dto.ts
- src/tickets/dto/update-ticket.dto.ts
- src/tickets/tickets.service.ts
- src/tickets/tickets.controller.ts
- src/tickets/tickets.module.ts

**Manual Changes:**
None

---

## Phase 4: Comments + Mentions + Audit Log

**Prompt:**
(Continuation of full plan — Phase 4)

Implement Comments and Mentions:
- Comment entity: id, ticketId, authorId, content, version (@VersionColumn), createdAt, updatedAt
- Mention entity: id, commentId, userId, createdAt
- CommentsModule: CRUD under /tickets/:ticketId/comments, optimistic locking on update (409 on mismatch)
- @mention parsing: regex /@([a-zA-Z0-9_]+)/g, case-insensitive username lookup
- On create/update: sync mentions — add new, remove stale
- MentionsController in CommentsModule (not UsersModule) owns GET /users/:userId/mentions to avoid circular dependency
- Every state-changing action writes to AuditLog; GET /audit-logs with optional filters

**Generated:**
- src/comments/comment.entity.ts
- src/comments/mention.entity.ts
- src/comments/dto/create-comment.dto.ts
- src/comments/dto/update-comment.dto.ts
- src/comments/comments.service.ts
- src/comments/comments.controller.ts
- src/comments/mentions.controller.ts
- src/comments/comments.module.ts

**Manual Changes:**
None

---

## Phase 5: Dependencies + Attachments + Export/Import

**Prompt:**
(Continuation of full plan — Phase 5)

Implement ticket dependencies, file attachments, and CSV bulk operations:
- TicketDependency entity: ticketId (blocked), blockedById (blocker)
- Both tickets must be in same project; cannot DONE a ticket with unresolved blockers
- Attachment entity: id, ticketId, filename, originalName, contentType, path, size
- Multer diskStorage; max 10MB; allowed: image/png, image/jpeg, application/pdf, text/plain
- CSV export: GET /tickets/export?projectId= → csv-stringify
- CSV import: POST /tickets/import (multipart: file + projectId) → memoryStorage, csv-parse/sync
- Result: { created, failed, errors }

**Generated:**
- src/tickets/ticket-dependency.entity.ts
- src/tickets/attachment.entity.ts
- src/tickets/dto/create-dependency.dto.ts
- (tickets.service.ts and tickets.controller.ts extended with dependency/attachment/CSV logic)

**Manual Changes:**
None

---

## Phase 6: Scheduler (Auto-Escalation)

**Prompt:**
(Continuation of full plan — Phase 6)

Implement hourly cron job for overdue ticket escalation:
- @Cron(CronExpression.EVERY_HOUR) in EscalationService
- For each ticket where dueDate < now AND status != DONE AND deletedAt IS NULL:
  LOW→MEDIUM, MEDIUM→HIGH, HIGH→CRITICAL
  At CRITICAL: set isOverdue=true (idempotent)
- Manual PATCH to priority resets isOverdue=false
- Log each escalation to AuditLog with actor=SYSTEM

**Generated:**
- src/scheduler/escalation.service.ts
- src/scheduler/scheduler.module.ts

**Manual Changes:**
None

---

## Phase 7: Tests

**Prompt:**
(Continuation of full plan — Phase 7)

Write unit tests and e2e tests:

Unit (src/):
- tickets.service.spec.ts: status lifecycle (forward OK, backward throws), DONE guard, optimistic locking (version mismatch → 409, match → OK), auto-assignment (uses DEVELOPER when no assigneeId), priority reset clears isOverdue, blocker check blocks DONE transition
- comments.service.spec.ts: @mention parsing, case-insensitive match, stale mention removal, new mention addition, optimistic locking
- escalation.service.spec.ts: cron handler delegates to ticketsService.escalateOverdueTickets

E2e (test/):
- In-memory mock (no DB): create user → login → GET /auth/me → logout → token denied → re-login → GET /users
- Validates 200 status codes, passwordHash not exposed, JWT deny-list works

**Generated:**
- src/tickets/tickets.service.spec.ts
- src/comments/comments.service.spec.ts
- src/scheduler/escalation.service.spec.ts
- test/app.e2e-spec.ts

**Manual Changes:**
None

---

## Phase 8: Documentation

**Prompt:**
Review all the md files and make sure everything is documented. Also create a run.md file with instructions on how to run and build the project.

**Generated:**
- prompts.md
- Instructions.md (updated)
- run.md

**Manual Changes:**
None
