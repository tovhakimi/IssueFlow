## Phase 0: Planning & Architecture

**Prompt:**
Read the attached assessment PDF carefully. Before writing any code, I want to plan the architecture with you. Identify the domain modules, their dependencies, the data model, and any tricky business rules we need to handle carefully. Produce an architecture summary: modules, entities, key API contracts, and a phase breakdown for implementation.

**Key Decisions Made:**

- **Module boundaries**: One NestJS module per domain (Users, Auth, Projects, Tickets, Comments,
  AuditLog, Scheduler). Tickets module absorbs sub-features (dependencies, attachments, export/import)
  rather than splitting into micro-modules — avoids circular dependency hell.
- **IDs**: Auto-increment integers (not UUIDs) — the spec is explicit.
- **Auth**: Global JwtAuthGuard via APP_GUARD + @Public() opt-out decorator, rather than per-route
  guards. Chosen because almost every route needs auth; opt-out is simpler.
- **Soft-delete scope**: Only Ticket and Project. User and Comment are hard-deleted if needed.
- **AuditLog**: Append-only, never updated or deleted. Service injected into other modules
  (no circular dep since AuditLogModule exports AuditLogService).
- **Status lifecycle enforcement**: Reject non-forward transitions at service layer, not DB constraint.
  Easier to return meaningful error messages.
- **Auto-assignment tie-break**: Fewest non-DONE tickets in the project → earliest createdAt.
  Raw SQL query for accuracy (TypeORM COUNT with FILTER doesn't work cleanly via ORM).
- **@mentions**: Parse on create AND update. Stale mentions removed on update (not soft-deleted).
- **CLAUDE.md**: Written manually from the spec before opening Claude Code, to lock in the
  contract and prevent drift.

**Phase breakdown agreed:**
1. Tooling (document-phase skill)
2. Foundation: TypeORM + Users + Auth
3. Projects + Tickets core (status lifecycle, auto-assign, soft-delete)
4. Comments + Mentions + AuditLog wiring
5. Dependencies + Attachments + CSV export/import
6. Scheduler (auto-escalation cron)
7. Tests (unit + e2e)
8. Documentation pass

---

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

---

## Phase 2: Foundation + Users + Auth

**Prompt:**
Start the implementation. Phase 2 covers the project foundation and the first two modules.

Install missing packages: @nestjs/jwt, @nestjs/passport, @nestjs/schedule, passport,
passport-jwt, passport-local, bcrypt and their @types.

Then implement:

**TypeORM config** in app.module.ts:
- Connect to postgres: host/user/pass/db = issueflow (from env with defaults)
- synchronize: true for dev, entities auto-loaded
- No migrations needed for this project

**User entity**: id (auto-increment), username, email, fullName, role (ADMIN | DEVELOPER),
passwordHash, createdAt

**UsersModule**:
- POST /users — create user (hash password with bcrypt, never return passwordHash)
- GET /users — list all
- GET /users/:userId — get one
- POST /users/update/:userId — update (NOT PATCH, per spec); partial fields
- All routes return 200

**AuthModule**:
- POST /auth/login — validate credentials, return JWT (1h expiry, secret from JWT_SECRET env)
- POST /auth/logout — add JTI to in-memory deny-list Set; return { message }
- GET /auth/me — return current user (from JWT)
- bcrypt for password hashing/comparing
- JWT deny-list: in-memory Set<string> of JTIs; checked in JwtStrategy.validate()

**Guards & decorators**:
- Global JwtAuthGuard via APP_GUARD (all routes protected by default)
- @Public() decorator to opt out
- @CurrentUser() decorator to extract user from request
- @Roles() + RolesGuard for ADMIN-only routes

**main.ts**: ValidationPipe(whitelist: true, transform: true), global prefix none

**Review after phase:**
- Verified passwordHash is excluded from all responses (using class-transformer @Exclude)
- Confirmed @Public() works on /auth/login and /auth/logout
- Tested JWT expiry and deny-list behavior

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

---

## Phase 3: Projects + Tickets Core

**Prompt:**
Phase 3. AuditLog must come first (other modules depend on it). Then Projects, then Tickets.

**AuditLog entity**: id, actor (USER | SYSTEM enum), action (string), entityType, entityId,
performedBy (nullable — null for SYSTEM), changes (jsonb, nullable), timestamp.
Append-only — no update or delete methods. AuditLogService exported so other modules can inject it.
GET /audit-logs with optional query filters: entityType, entityId, action, actor. Results ordered
timestamp DESC.

**Project entity**: id, name, description, ownerId (FK to users), createdAt,
deletedAt (@DeleteDateColumn for soft-delete).

**ProjectsModule**:
- POST /projects — create; 200
- GET /projects — list (excludes soft-deleted by default via TypeORM)
- GET /projects/:projectId — get one
- PATCH /projects/:projectId — update
- DELETE /projects/:projectId — soft-delete; return { message }
- POST /projects/:projectId/restore — ADMIN only; restore soft-deleted
- GET /projects/deleted — ADMIN only; list soft-deleted (use withDeleted + WHERE deletedAt IS NOT NULL)
- GET /projects/:projectId/workload — returns each DEVELOPER in project with their open ticket count
  (status != DONE, not deleted). Shape: [{ userId, username, openTickets }]

**Ticket entity**: id, title, description, status (TODO|IN_PROGRESS|IN_REVIEW|DONE, default TODO),
priority (LOW|MEDIUM|HIGH|CRITICAL, default LOW), type (BUG|FEATURE|TECHNICAL),
projectId, assigneeId, dueDate, isOverdue (default false),
version (@VersionColumn for optimistic locking), createdAt, deletedAt.

**TicketsModule**:
- POST /tickets — create; 200
- GET /tickets?projectId= — list
- GET /tickets/:ticketId — get one
- PATCH /tickets/:ticketId — update
- DELETE /tickets/:ticketId — soft-delete
- POST /tickets/:ticketId/restore — ADMIN only
- GET /tickets/deleted — ADMIN only
- ROUTE ORDER: /deleted and /export BEFORE /:ticketId (NestJS matches routes top-to-bottom)

**Status lifecycle** (enforce in service.update()):
- STATUS_ORDER = [TODO, IN_PROGRESS, IN_REVIEW, DONE]
- New status index must be strictly > current index → else BadRequestException
- DONE tickets → ForbiddenException on any update attempt

**Optimistic locking**: If dto.version is provided and doesn't match ticket.version → 409 ConflictException

**Auto-assignment**: If no assigneeId on create, run raw SQL to find DEVELOPER with fewest
non-DONE, non-deleted tickets in this project; tie-break by createdAt ASC. Write AuditLog:
actor=USER/action=CREATE first, then actor=SYSTEM/action=AUTO_ASSIGN second.

**Review after phase:**
- Confirmed /projects/deleted returns 403 for non-ADMIN
- Tested backward status transition rejection (IN_PROGRESS → TODO throws 400)
- Verified DONE ticket update throws 403
- Confirmed optimistic lock: two concurrent PATCHes with same version, second gets 409

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

### Fix 1: AUTO_ASSIGN Audit Log

**Problem identified:**
Review of tickets.service.ts revealed auto-assignment was merging into the CREATE log entry —
setting actor=SYSTEM on the CREATE record instead of writing a second entry. The human who
triggered the ticket creation was being erased from the audit trail.

**Requirement (CLAUDE.md rule 13):** Every state-changing action writes to AuditLog with
actor=USER|SYSTEM. Auto-assignment should be a separate SYSTEM entry alongside the USER CREATE.

**Bug invocation prompt:**
```bash
# Create a ticket without assigneeId (triggers auto-assignment)
curl -X POST http://localhost:3000/tickets \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Auto-assign test", "projectId": 1}'

# Check audit log — only one entry exists with actor=SYSTEM, no USER CREATE entry
curl http://localhost:3000/audit-logs?entityType=Ticket&action=CREATE \
  -H "Authorization: Bearer $TOKEN"
# Bug: the CREATE entry has actor=SYSTEM instead of USER; no separate AUTO_ASSIGN entry
```

**Prompt:**
Each auto-assignment is recorded in the Audit Log with actor = SYSTEM, action = AUTO_ASSIGN.
Change to it respectively. The CREATE entry must always have actor=USER and performedBy=userId.
Write a second log entry with actor=SYSTEM/action=AUTO_ASSIGN only when auto-assignment fires.
Update the unit test that asserts on these two separate log calls.

**Fix:**
Always write actor=USER/action=CREATE, then write a second actor=SYSTEM/action=AUTO_ASSIGN entry
only when auto-assignment fires.

**Files changed:**
- src/tickets/tickets.service.ts
- src/tickets/tickets.service.spec.ts

### Fix 2: TicketType Enum: TASK → TECHNICAL

**Problem identified:**
The spec defines ticket types as BUG, FEATURE, TECHNICAL. The initial implementation used TASK
instead of TECHNICAL, which would cause validation failures on import and mismatches with the API
contract.

**Bug invocation prompt:**
```bash
# Try to create a ticket with type TECHNICAL (from the spec)
curl -X POST http://localhost:3000/tickets \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Bug report", "projectId": 1, "type": "TECHNICAL"}'
# Bug: 400 Bad Request — validation rejects "TECHNICAL" because the enum only has "TASK"
```

**Prompt:**
Look at @src/tickets/ticket.entity.ts, change the TicketType to -> BUG, FEATURE, TECHNICAL
respectively. Then change the entire codebase references to 'TASK', running unit tests after
each change and e2e tests at the end.

**What changed:**
Renamed `TicketType.TASK` to `TicketType.TECHNICAL` across the entire codebase.

**Files changed:**
- src/tickets/ticket.entity.ts (enum value + column default)
- src/tickets/tickets.service.spec.ts (mock data)
- src/tickets/tickets.performance.spec.ts (mock data + CSV string)

**Tests:**
- Unit tests: 27/27 passed (6 suites) — ran after each file change to catch breakage incrementally
- E2e tests: 24/24 passed (2 suites) — ran at the end to verify full application

### Fix 5: Auto-Assignment & Workload — 4 Bugs

**Problem identified:**
Verification of the auto-assignment feature (section 3.8) and workload endpoint found four bugs
that would cause runtime failures or incorrect API responses:

1. **Workload query missing LEFT JOIN**: `getWorkload()` in `projects.service.ts` had no
   `LEFT JOIN tickets t ON t."assigneeId" = u.id`, so the `COUNT(t.id) FILTER (...)` had no
   ticket rows to count — the query would crash or return zero for everyone.

2. **Response field name mismatch**: Workload response used `activeTickets` instead of
   `openTicketCount`, violating the API contract (spec says `openTicketCount`).

3. **Workload sort order wrong**: Results were sorted by `u."createdAt" ASC` (user creation date)
   instead of `"openTicketCount" ASC` (least loaded first), which is what callers expect for
   load-balanced assignment visibility.

4. **AUTO_ASSIGN audit log fires with no assignee**: In `tickets.service.ts`, the guard was
   `if (autoAssigned)` — when no DEVELOPER exists in the project, `autoAssign()` returns
   `undefined` but the audit log still recorded a bogus `AUTO_ASSIGN` entry with
   `changes: { assigneeId: undefined }`.

**Bug invocation prompt:**
```bash
# Bug 1+2+3: Workload endpoint returns wrong data
curl http://localhost:3000/projects/1/workload \
  -H "Authorization: Bearer $TOKEN"
# Bug: returns [{ userId, username, activeTickets: 0 }] for everyone (missing JOIN),
# wrong field name (activeTickets instead of openTicketCount), and wrong sort order

# Bug 4: Create ticket in a project with no developers
curl -X POST http://localhost:3000/tickets \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Orphan ticket", "projectId": 99}'
# Bug: AuditLog gets a SYSTEM/AUTO_ASSIGN entry with changes: { assigneeId: undefined }
# even though no developer was assigned
```

**Prompt:**
Fix 4 bugs in auto-assignment and workload:
1. Add `LEFT JOIN tickets t ON t."assigneeId" = u.id` to the workload query
2. Rename response field `activeTickets` → `openTicketCount`
3. Change workload ORDER BY from `u."createdAt" ASC` to `"openTicketCount" ASC`
4. Change auto-assign audit guard from `if (autoAssigned)` to `if (autoAssigned && assigneeId)`

**Fix applied:**
1. Added `LEFT JOIN tickets t ON t."assigneeId" = u.id` to the raw SQL in
   `projects.service.ts:getWorkload()`.
2. Changed the SELECT alias and response mapping from `activeTickets` to `openTicketCount`.
3. Changed `ORDER BY` from `u."createdAt" ASC` to `"openTicketCount" ASC`.
4. Changed the audit log guard in `tickets.service.ts:create()` from `if (autoAssigned)` to
   `if (autoAssigned && assigneeId)` — no log entry when auto-assignment finds no developer.

**Files changed:**
- src/projects/projects.service.ts (workload query: added LEFT JOIN, fixed field name, fixed sort)
- src/tickets/tickets.service.ts (auto-assign audit guard: added `&& assigneeId` check)

**Tests:**
- All 31 tests passing (25 unit + 6 e2e)
- Build: clean (npx tsc --noEmit — no errors)

### Fix 6: Auto-Assignment Scoped to Project Developers

**Problem identified:**
The `autoAssign()` query selected from ALL developers in the system, regardless of whether
they had any connection to the project. A developer who never worked on a project could be
auto-assigned to a ticket in it — violating the principle that auto-assignment should pick
from the project's team.

**Bug invocation prompt:**
```bash
# Create two projects and two developers
# Developer A has tickets in project 1 only
# Developer B has tickets in project 2 only
# Create a ticket in project 1 without assigneeId
curl -X POST http://localhost:3000/tickets \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "New ticket", "projectId": 1}'
# Bug: Developer B (who has never worked on project 1) could be auto-assigned
# because the query searched ALL developers system-wide, not just project-linked ones
```

**Prompt:**
Scope auto-assignment to only pick from developers already linked to the project (i.e.,
assigned to at least one non-deleted ticket in that project). If no developer is linked,
leave `assigneeId` as `null` — no error.

**Fix applied:**
Added an `AND u.id IN (...)` subquery to the `autoAssign()` raw SQL query that restricts
candidates to developers with at least one non-deleted ticket assignment in the same project:
```sql
AND u.id IN (
  SELECT DISTINCT t2."assigneeId"
  FROM tickets t2
  WHERE t2."projectId" = $1
    AND t2."assigneeId" IS NOT NULL
    AND t2."deletedAt" IS NULL
)
```

The `create()` method already handled `undefined` from `autoAssign()` correctly (skips
SYSTEM audit log, stores `null` assigneeId).

**Files changed:**
- src/tickets/tickets.service.ts (autoAssign query: added project-scoped subquery filter)

**Tests:**
- All 31 tests passing (30 unit + 1 e2e suite)
- Build: clean

---

## Phase 4: Comments + Mentions + Audit Log

**Prompt:**
Phase 4. Comments with optimistic locking, @mention parsing, and full AuditLog wiring.

**Comment entity**: id, ticketId (FK), authorId (FK), content, version (@VersionColumn), createdAt, updatedAt.

**Mention entity**: id, commentId (FK), userId (FK), createdAt.

**CommentsModule** — routes under /tickets/:ticketId/comments:
- POST /tickets/:ticketId/comments — create; parse mentions from content; 200
- GET /tickets/:ticketId/comments — list all for ticket
- GET /tickets/:ticketId/comments/:commentId — get one
- PATCH /tickets/:ticketId/comments/:commentId — update; re-sync mentions; optimistic lock on version
- DELETE /tickets/:ticketId/comments/:commentId — delete; remove associated mentions

**@mention sync logic**:
1. Parse /@([a-zA-Z0-9_]+)/g from content (case-insensitive username lookup)
2. On create: find matching users → create Mention rows for found usernames (silently skip unknown)
3. On update: re-parse → add Mention rows for new usernames → delete Mention rows for stale usernames
   (compare current mention set vs new set by userId)

**MentionsController** (in CommentsModule, not UsersModule — avoids circular dep):
- GET /users/:userId/mentions — return all comments where this user is mentioned (join comment + ticket)

**AuditLog wiring**: Every create/update/delete on Tickets, Projects, Comments writes to AuditLog.
actor=USER, performedBy=currentUser.id. Changes field records the DTO passed.

**Decision**: MentionsController lives in CommentsModule even though its route starts with /users/.
Alternative (UsersModule importing CommentsModule importing UsersModule) would create circular dep.

**Review after phase:**
- Verified @mention case-insensitivity: @Admin and @admin both resolve to same user
- Confirmed stale mentions removed on comment update
- Tested optimistic locking on comments: version mismatch → 409
- Checked GET /users/:userId/mentions returns comment content + ticketId

**Generated:**
- src/comments/comment.entity.ts
- src/comments/mention.entity.ts
- src/comments/dto/create-comment.dto.ts
- src/comments/dto/update-comment.dto.ts
- src/comments/comments.service.ts
- src/comments/comments.controller.ts
- src/comments/mentions.controller.ts
- src/comments/comments.module.ts

### Fix 4: @Mention Mechanism — 4 Bugs

**Problem identified:**
Manual audit of the @mention feature (section 3.6) against the spec found four issues:

1. **Case-insensitive matching broken**: `findByUsername()` in `users.service.ts` used a plain
   `findOne({ where: { username } })` — case-sensitive. But `parseMentions()` lowercases extracted
   usernames before lookup, so `@JohnDoe` would search for `"johndoe"` and never match `"JohnDoe"`
   in the database.

2. **Comment responses missing `mentionedUsers` metadata**: The spec requires every comment response
   to include `mentionedUsers: [{ id, username, fullName }]`. All endpoints (create, update, findOne,
   findAll) returned raw Comment entities with no mention data attached.

3. **`findMentionsByUser` broken and returning wrong type**: The method attempted
   `leftJoinAndSelect('m.commentId', 'comment')` on a plain column (not a relation), which fails.
   It then fell back to returning raw Mention rows instead of full comments. The spec says
   "returns all comments where that user was mentioned, newest first."

4. **`Mention` entity had no relations**: Only `commentId` and `userId` as plain `@Column()` — no
   `@ManyToOne` relations to Comment or User, making joins and eager loading impossible.

**Bug invocation prompt:**
```bash
# Bug 1: Mention a user with mixed case — mention silently fails
curl -X POST http://localhost:3000/tickets/1/comments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content": "Hey @JohnDoe please review this"}'
# Bug: user "JohnDoe" exists in DB but parseMentions lowercases to "johndoe",
# and findByUsername does case-sensitive lookup — no match, no mention created

# Bug 2: Comment response missing mentionedUsers field
curl http://localhost:3000/tickets/1/comments/1 \
  -H "Authorization: Bearer $TOKEN"
# Bug: returns { id, ticketId, content, ... } with no mentionedUsers array

# Bug 3: Mentions endpoint returns wrong data
curl http://localhost:3000/users/1/mentions \
  -H "Authorization: Bearer $TOKEN"
# Bug: returns raw Mention rows [{ id, commentId, userId }] instead of Comment objects
```

**Prompt:**
Fix the @mention mechanism to match the spec. Currently there are 4 bugs:

1. `findByUsername` in `users.service.ts` does a case-sensitive lookup, but `parseMentions`
   lowercases usernames before searching. Use a case-insensitive query so `@JohnDoe` and
   `@johndoe` both resolve.

2. Comment responses (create, update, findOne, findAll) don't include
   `mentionedUsers: [{ id, username, fullName }]`. Every comment response needs this field
   populated from the mentions table.

3. `findMentionsByUser` has a broken join on a plain column and returns raw mention rows. It
   should return the actual comments where the user was mentioned, newest first.

4. The `Mention` entity has no `@ManyToOne` relations to `Comment` or `User`, so joins and eager
   loading don't work.

Fix all four. Add `@ManyToOne` relations on `Mention` to both `Comment` and `User`, add a
`mentions` relation on `Comment`, make `findByUsername` case-insensitive with `ILike`, fix
`findMentionsByUser` to return comments with mention metadata, and enrich all comment endpoints
to include `mentionedUsers`.

**Fix applied:**
1. **Mention entity**: Added `@ManyToOne` relations to `Comment` (with back-reference) and `User`
   (eager: true), with `@JoinColumn` on both. Added `onDelete: 'CASCADE'`.
2. **Comment entity**: Added `@OneToMany` to `Mention` with `eager: true`, so mentions are loaded
   on every comment query automatically.
3. **`findByUsername`**: Changed from `findOne({ where: { username } })` to
   `findOne({ where: { username: ILike(username) } })`. Imported `ILike` from TypeORM.
4. **CommentsService**:
   - Added `formatComment()` helper that maps `comment.mentions` to
     `mentionedUsers: [{ id, username, fullName }]`.
   - `create()` and `update()` now re-fetch the comment after saving (to get eager-loaded
     mentions) and return via `formatComment()`.
   - `findAll()` and `findOne()` return via `formatComment()`.
   - `findMentionsByUser()` rewritten: queries mention rows to get commentIds, then fetches
     full comments with eager mentions, returns `{ comments: [...], total }`.
5. **Tests**: Updated `comments.service.spec.ts` mocks to provide `mentions` arrays on comment
   objects and assert `mentionedUsers` in responses.

**Files changed:**
- src/comments/mention.entity.ts — added @ManyToOne relations to Comment and User
- src/comments/comment.entity.ts — added @OneToMany relation to Mention (eager)
- src/users/users.service.ts — ILike import + case-insensitive findByUsername
- src/comments/comments.service.ts — formatComment, enrichComment, fixed findMentionsByUser
- src/comments/comments.service.spec.ts — updated mocks for new response shape

**Tests:**
- Comments suite: 5/5 passing
- Build: clean (npx tsc --noEmit — no errors)

---

## Phase 5: Dependencies + Attachments + Export/Import

**Prompt:**
Phase 5. Three sub-features added to TicketsModule: ticket dependencies, file attachments, CSV bulk ops.

**TicketDependency entity**: id, ticketId (the blocked ticket), blockedById (the blocker ticket).
No cascade — orphaned records cleaned up manually if a ticket is hard-deleted.

**Dependency routes** under /tickets/:ticketId/dependencies:
- POST — body: { "blockedBy": <id> }. Validate both tickets exist and share the same projectId.
  ConflictException if dependency already exists.
- GET — return the full Ticket objects that are blocking this ticket (not the dependency join rows).
- DELETE /:blockerId — remove the dependency row.
- DONE-transition guard: before marking a ticket DONE, call assertNoBlockers() which checks all
  blockers have status=DONE; throws BadRequestException with blocker IDs if not.

**Attachment entity**: id, ticketId, filename (stored name), originalName, contentType, path, size.

**Attachment routes** under /tickets/:ticketId/attachments:
- POST — multipart/form-data; diskStorage to UPLOAD_PATH; max 10MB; allowed MIME: image/png,
  image/jpeg, application/pdf, text/plain; reject others with error.
- GET — list attachments for ticket.
- DELETE /:attachmentId — remove record (does not delete file from disk).

**CSV export**: GET /tickets/export?projectId= — use csv-stringify; stream as text/csv with
Content-Disposition: attachment. Columns: id, title, description, status, priority, type, assigneeId.

**CSV import**: POST /tickets/import?projectId= — multipart file (memoryStorage, not disk).
Parse with csv-parse/sync. For each row call create() — catch errors per row.
Return { created: N, failed: N, errors: ["Row 3: ..."] }.

**Route order reminder**: /export and /import BEFORE /:ticketId in the controller.

**Review after phase:**
- Confirmed cross-project dependency throws 400
- Verified DONE blocked by unresolved blocker throws 400 with IDs listed
- Tested 10MB file rejection (413) and unsupported MIME type rejection
- CSV import: verified partial success (some rows fail, some succeed; errors reported per row)

**Generated:**
- src/tickets/ticket-dependency.entity.ts
- src/tickets/attachment.entity.ts
- src/tickets/dto/create-dependency.dto.ts
- (tickets.service.ts and tickets.controller.ts extended with dependency/attachment/CSV logic)

### Fix 3: Dependency API Contract Corrections

**Problem identified:**
A manual audit of the dependency feature against the spec (section 3.2) found three contract
violations:

1. **DTO field name mismatch**: Spec requires `{ "blockedBy": 42 }` but DTO used `blockedById`.
2. **DELETE route parameter name**: Spec says `/dependencies/{blockerId}` but route used `:blockedById`.
3. **GET response format**: Spec expects the blocking Ticket objects returned; implementation
   returned raw `TicketDependency` join rows (only id/ticketId/blockedById — not useful to callers).
4. **Deprecated TypeORM API**: `findByIds()` used in `assertNoBlockers()` is deprecated in TypeORM
   0.3.20; replaced with `findBy({ id: In([...]) })`.

**Bug invocation prompt:**
```bash
# Bug 1: POST with spec-compliant field name fails
curl -X POST http://localhost:3000/tickets/1/dependencies \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"blockedBy": 2}'
# Bug: 400 — DTO expects "blockedById" not "blockedBy" (whitelist strips it)

# Bug 2: DELETE with spec-compliant param name fails
curl -X DELETE http://localhost:3000/tickets/1/dependencies/2 \
  -H "Authorization: Bearer $TOKEN"
# Bug: route param named :blockedById doesn't match :blockerId from spec

# Bug 3: GET returns raw join rows instead of ticket objects
curl http://localhost:3000/tickets/1/dependencies \
  -H "Authorization: Bearer $TOKEN"
# Bug: returns [{ id: 1, ticketId: 1, blockedById: 2 }] instead of full Ticket objects
```

**Prompt:**
Fix the dependency API to match the spec contract. Three issues:
1. DTO field should be `blockedBy` not `blockedById` (spec says `{ "blockedBy": 42 }`)
2. DELETE route param should be `:blockerId` not `:blockedById` (spec: `/dependencies/{blockerId}`)
3. GET should return full Ticket objects, not raw TicketDependency join rows
4. Replace deprecated `findByIds()` with `findBy({ id: In([...]) })`

**Prompts used in diagnosis:**
- `GET /tickets/{ticketId}/dependencies returns all tickets this ticket is blocked by` — spec text
  flagged that "tickets" (not dependency records) is the expected return type.
- `POST body { "blockedBy": 42 }` — spec literal showed field name discrepancy.
- `DELETE /tickets/{ticketId}/dependencies/{blockerId}` — parameter name in spec vs `:blockedById`
  in code.

**Files changed:**
- src/tickets/dto/create-dependency.dto.ts — field renamed `blockedById` → `blockedBy`
- src/tickets/tickets.controller.ts — route param `:blockedById` → `:blockerId`
- src/tickets/tickets.service.ts:
  - `addDependency()`: references updated to `dto.blockedBy`
  - `getDependencies()`: now returns `Ticket[]` (fetches actual blocker entities via `findBy({ id: In([...]) })`)
  - `assertNoBlockers()`: replaced deprecated `findByIds()` with `findBy({ id: In(blockerIds) })`
  - Added `In` to TypeORM import

---

## Phase 6: Scheduler (Auto-Escalation)

**Prompt:**
Phase 6. Add the hourly auto-escalation cron job as a standalone SchedulerModule.

**EscalationService**:
- @Injectable() with @Cron(CronExpression.EVERY_HOUR)
- Query all tickets where: dueDate < NOW() AND status != DONE AND deletedAt IS NULL
- Escalation map: LOW→MEDIUM, MEDIUM→HIGH, HIGH→CRITICAL, CRITICAL stays (idempotent)
- When priority reaches CRITICAL: set isOverdue=true
- Save each ticket and write AuditLog: actor=SYSTEM, action=ESCALATE,
  changes: { priority, isOverdue }

**Priority reset**: Already handled in Phase 3 — tickets.service.update() sets isOverdue=false
when dto.priority is present.

**SchedulerModule**: imports ScheduleModule.forRoot(), TicketsModule (to inject TicketRepo
and AuditLogService indirectly via EscalationService). Add @nestjs/schedule to app imports.

**Decision**: EscalationService queries ticketRepo directly (injected via TicketsModule exports)
rather than calling ticketsService.update() — avoids triggering the DONE-guard and audit log
re-entry for each escalated ticket.

**Review after phase:**
- Verified cron fires on schedule (forced a manual call in test)
- Confirmed CRITICAL ticket isOverdue=true is idempotent (running again doesn't change it)
- Checked AuditLog entries appear with actor=SYSTEM after escalation

**Generated:**
- src/scheduler/escalation.service.ts
- src/scheduler/scheduler.module.ts

---

## Phase 7: Tests

**Prompt:**
Phase 7. Write unit tests and e2e tests covering all critical business rules.

**Unit tests** (src/):

tickets.service.spec.ts — mock ticketRepo, depRepo, auditLog:
- Status lifecycle: forward transitions pass, backward throws BadRequestException
- DONE update guard: throws ForbiddenException
- Optimistic locking: version mismatch → ConflictException; version match → saves OK
- Auto-assignment: no assigneeId → autoAssign called → AuditLog has SYSTEM/AUTO_ASSIGN entry
- Priority reset: PATCH with priority → isOverdue set to false
- Blocker check: ticket with non-DONE blocker → assertNoBlockers throws when transitioning to DONE

comments.service.spec.ts — mock commentRepo, mentionRepo, userRepo:
- @mention parsing: @alice and @bob both resolved when users exist
- Case-insensitive: @ALICE matches user 'alice'
- Stale mention removal: mention removed when username no longer in updated comment body
- New mention addition: new @username in update creates new Mention row
- Optimistic locking: version mismatch on comment update → ConflictException

escalation.service.spec.ts:
- handleCron() delegates to ticketsService.escalateOverdueTickets()
- Confirms cron handler is wired to escalation method

**E2e tests** (test/) — in-memory mocks, no real DB:
- Create user → login → GET /auth/me → verify response shape
- Logout → use old token → verify 401
- Re-login → verify new token works
- GET /users → verify passwordHash not in response
- All responses return 200 (not 201)

**Review after phase:**
- 27 unit tests passing across 3 suites
- 6 e2e tests passing
- Decided NOT to write DB-dependent e2e tests (would require running Postgres in CI)

**Generated:**
- src/tickets/tickets.service.spec.ts
- src/comments/comments.service.spec.ts
- src/scheduler/escalation.service.spec.ts
- test/app.e2e-spec.ts

---

## Phase 8: Documentation

**Prompt:**
Review all the md files and make sure everything is documented. Also create a run.md file
with instructions on how to run and build the project. Cross-check CLAUDE.md against the
actual implementation — flag any discrepancies.

**Generated:**
- prompts.md (initial version)
- Instructions.md (updated Phase Log)
- run.md

---

## Graphify: Codebase Knowledge Graph

Ran `/graphify` to generate a knowledge graph of the entire IssueFlow codebase.

**What it produced:** `graphify-out/` directory containing:
- `GRAPH_REPORT.md` — text summary of the graph analysis
- `graph.html` — interactive HTML visualization (open in browser)
- Cached AST and semantic analysis data

**Key stats from the report:**
- 422 nodes, 735 edges, 18 communities
- 71 files analyzed

**God nodes (most connected):**
| Node | Edges |
|---|---|
| TicketsService | 26 |
| TicketsController | 18 |
| UsersService | 17 |
| CommentsService | 15 |

**Generated files:** `graphify-out/` directory (gitignored)

---

## Model Router Plugin

**Prompt:**
Install the [claude-model-router-hook](https://github.com/tzachbon/claude-model-router-hook) plugin for automatic model tier routing. This classifies prompts by complexity and switches between Haiku, Sonnet, and Opus automatically — no manual model changes needed.

**Why this matters:**
The assessment requires mentioning which model is used. Rather than manually toggling between models, this plugin handles it automatically based on prompt complexity:
- **Haiku** — git ops, renames, formatting, file searches (cheap, fast)
- **Sonnet** — feature work, debugging, code writing (balanced)
- **Opus** — architecture decisions, deep analysis, complex refactors (full reasoning)

The plugin uses keyword and pattern matching (zero API calls) to classify each prompt. It also injects sub-agent routing rules so spawned agents pick the right tier automatically.

**Installation:**
```bash
claude plugin marketplace add tzachbon/claude-model-router-hook
claude plugin install claude-model-router-hook@claude-model-router-hook
```

**Configuration:** `~/.claude/model-router.json` — supports `"warn"` (recommend only) or `"autoswitch"` (change model automatically). Prefix any prompt with `~` to bypass classification.

**What changed:**
- Removed old manual `SessionStart` hook from `~/.claude/settings.json`
- Deleted `~/.claude/hooks/session-init.sh` (replaced by plugin's version)
- Plugin registered in settings under `enabledPlugins`

---

### Fix 7: Optimistic Locking — Version Bypass & Race Condition

**Problem identified:**
Two bugs in optimistic locking undermined concurrent update protection on both Tickets and Comments:

1. **`version` was optional — locking bypass**: In `UpdateTicketDto` and `UpdateCommentDto`,
   `version` was marked `@IsOptional()`. The service check was
   `if (dto.version !== undefined && dto.version !== ticket.version)` — if a client omitted
   `version`, the check was skipped entirely. Two users could update the same entity without
   any conflict detection.

2. **True concurrent requests got 500 instead of 409**: Even when `version` was sent correctly,
   a race window existed: Request A and B both read version=1, both pass the manual check,
   Request A saves (version bumps to 2), Request B saves — TypeORM throws
   `OptimisticLockVersionMismatchError` which was not caught, bubbling up as 500 Internal Server
   Error instead of 409 Conflict.

**Bug invocation prompt:**
```bash
# Bug 1: Omit version field — bypasses optimistic locking entirely
curl -X PATCH http://localhost:3000/tickets/1 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Sneaky update"}'
# Bug: succeeds with 200 — no conflict detection at all, version field was optional

# Bug 2: Send two concurrent requests with the same version
# Terminal 1:
curl -X PATCH http://localhost:3000/tickets/1 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Update A", "version": 1}'
# Terminal 2 (at the same time):
curl -X PATCH http://localhost:3000/tickets/1 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Update B", "version": 1}'
# Bug: second request returns 500 Internal Server Error instead of 409 Conflict
# because OptimisticLockVersionMismatchError from TypeORM was not caught
```

**Prompt:**
Fix optimistic locking on Tickets and Comments. Two bugs:
1. `version` is `@IsOptional()` in both UpdateTicketDto and UpdateCommentDto — make it
   `@IsNotEmpty()` so clients must always send it (400 if omitted).
2. The `.save()` call doesn't catch `OptimisticLockVersionMismatchError` from TypeORM —
   wrap it in try/catch and re-throw as `ConflictException(409)` for true race conditions.

**Fix applied:**
1. **DTOs**: Replaced `@IsOptional()` with `@IsNotEmpty()` on `version` in both
   `UpdateTicketDto` and `UpdateCommentDto`. Removed the `?` optional marker.
2. **Services**: Imported `OptimisticLockVersionMismatchError` from TypeORM. Wrapped the
   `.save()` call in `tickets.service.ts:update()` and `comments.service.ts:update()` with
   try/catch — catches the TypeORM error and re-throws as `ConflictException`.
3. **Tests**: Added `version` to all `update()` calls in `tickets.service.spec.ts` (6 calls)
   and `tickets.performance.spec.ts` (1 call) that were missing it.

**Files changed:**
- src/tickets/dto/update-ticket.dto.ts — `version` made required
- src/comments/dto/update-comment.dto.ts — `version` made required
- src/tickets/tickets.service.ts — catch `OptimisticLockVersionMismatchError` on save
- src/comments/comments.service.ts — catch `OptimisticLockVersionMismatchError` on save
- src/tickets/tickets.service.spec.ts — added `version` to 6 update calls
- src/tickets/tickets.performance.spec.ts — added `version` to 1 update call

**Tests:**
- All 31 tests passing (6 suites)
- Build: clean

### Fix 8: Missing Audit Logging for User Create & Update

**Problem identified:**
The assignment requires every state-changing action to be recorded in the audit log (CLAUDE.md rule 13). Only `DELETE_USER` was logged. `CREATE_USER` and `UPDATE_USER` were completely missing — creating or updating a user left no audit trail.

**Bug invocation prompt:**
```bash
# Create a user
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"username": "newuser", "email": "new@test.com", "password": "pass123", "fullName": "New User", "role": "DEVELOPER"}'

# Update a user
curl -X POST http://localhost:3000/users/update/1 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"fullName": "Updated Name"}'

# Check audit log — no CREATE_USER or UPDATE_USER entries exist
curl http://localhost:3000/audit-logs?entityType=User \
  -H "Authorization: Bearer $TOKEN"
# Bug: only DELETE_USER entries appear; CREATE_USER and UPDATE_USER are missing
```

**Prompt:**
Add audit logging for user create and update. CREATE_USER should use `performedBy: saved.id` (endpoint is @Public, no authenticated user). UPDATE_USER should accept `performedBy` from `@CurrentUser()` in the controller.

**Fix applied:**
1. `create()`: Added `auditLog.log()` call after save with `action: 'CREATE_USER'`, `performedBy: saved.id`.
2. `update()`: Added `performedBy: number` parameter and `auditLog.log()` call with `action: 'UPDATE_USER'`.
3. Controller: Added `@CurrentUser() user: any` to `update()` handler, passing `user.id` to the service.

**Files changed:**
- src/users/users.service.ts
- src/users/users.controller.ts

**Tests:**
- All 31 tests passing (6 suites)
- Build: clean

### Fix 9: Missing Audit Logging for Ticket Dependency Add/Remove

**Problem identified:**
Adding or removing ticket dependencies are state-changing actions that were not recorded in the audit log. A developer could add/remove blockers with no traceability.

**Bug invocation prompt:**
```bash
# Add a dependency
curl -X POST http://localhost:3000/tickets/1/dependencies \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"blockedBy": 2}'

# Remove a dependency
curl -X DELETE http://localhost:3000/tickets/1/dependencies/2 \
  -H "Authorization: Bearer $TOKEN"

# Check audit log — no dependency-related entries
curl http://localhost:3000/audit-logs?entityType=Ticket \
  -H "Authorization: Bearer $TOKEN"
# Bug: no ADD_DEPENDENCY or REMOVE_DEPENDENCY entries exist
```

**Prompt:**
Log ticket dependency add/remove actions. Add audit logging to `addDependency()` with action `ADD_DEPENDENCY` and `removeDependency()` with action `REMOVE_DEPENDENCY`. Pass `performedBy` from `@CurrentUser()` in the controller.

**Fix applied:**
1. `addDependency()`: Added `performedBy: number` parameter and audit log call with `action: 'ADD_DEPENDENCY'`, `entityType: 'Ticket'`, `entityId: ticketId`.
2. `removeDependency()`: Added `performedBy: number` parameter and audit log call with `action: 'REMOVE_DEPENDENCY'`.
3. Controller: Added `@CurrentUser() user: any` to both handlers, passing `user.id`.

**Files changed:**
- src/tickets/tickets.service.ts
- src/tickets/tickets.controller.ts

**Tests:**
- All 31 tests passing (6 suites)
- Build: clean

### Fix 10: Missing Audit Logging for Attachment Add/Remove

**Problem identified:**
Adding or removing file attachments are state-changing actions that were not recorded in the audit log. Files could be attached to or removed from tickets with no traceability.

**Bug invocation prompt:**
```bash
# Upload an attachment
curl -X POST http://localhost:3000/tickets/1/attachments \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@./test.png"

# Delete an attachment
curl -X DELETE http://localhost:3000/tickets/1/attachments/1 \
  -H "Authorization: Bearer $TOKEN"

# Check audit log — no attachment-related entries
curl http://localhost:3000/audit-logs?entityType=Ticket \
  -H "Authorization: Bearer $TOKEN"
# Bug: no ADD_ATTACHMENT or REMOVE_ATTACHMENT entries exist
```

**Prompt:**
Log attachment add/remove actions. Add audit logging to `addAttachment()` with action `ADD_ATTACHMENT` and `deleteAttachment()` with action `REMOVE_ATTACHMENT`. Pass `performedBy` from `@CurrentUser()` in the controller.

**Fix applied:**
1. `addAttachment()`: Added `performedBy: number` parameter and audit log call with `action: 'ADD_ATTACHMENT'`, `entityType: 'Ticket'`, `entityId: ticketId`.
2. `deleteAttachment()`: Added `performedBy: number` parameter and audit log call with `action: 'REMOVE_ATTACHMENT'`.
3. Controller: Added `@CurrentUser() user: any` to both handlers, passing `user.id`.

**Files changed:**
- src/tickets/tickets.service.ts
- src/tickets/tickets.controller.ts

**Tests:**
- All 31 tests passing (6 suites)
- Build: clean

### Fix 11: DELETE /users/:userId — Missing Authorization, Self-Delete, and Dangling References

**Problem identified:**
The `DELETE /users/:userId` endpoint had three security and data integrity issues:

1. **No authorization guard**: Any authenticated user (DEVELOPER, PM, etc.) could delete any user.
   The endpoint should be ADMIN-only, matching the pattern used for soft-delete restore endpoints.

2. **No self-delete prevention**: An admin could delete themselves, leaving an orphaned active JWT
   with no backing user record. Subsequent requests using that token would fail unpredictably.

3. **No cleanup of dangling references**: Hard-deleting a user left orphaned foreign keys in
   `tickets.assigneeId`, `comments.authorId`, and `projects.ownerId`. Depending on DB constraints,
   this could cause constraint violations or return stale user IDs that no longer resolve.

**Bug invocation prompt:**
```bash
# Bug 1: Non-admin user can delete any user
curl -X DELETE http://localhost:3000/users/2 \
  -H "Authorization: Bearer $DEVELOPER_TOKEN"
# Bug: succeeds with 200 — no role check at all

# Bug 2: Admin deletes themselves
curl -X DELETE http://localhost:3000/users/1 \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# Bug: succeeds with 200 — admin's own JWT is now orphaned

# Bug 3: Dangling references after deletion
curl http://localhost:3000/tickets?projectId=1 \
  -H "Authorization: Bearer $TOKEN"
# Bug: tickets still show assigneeId: 2 (deleted user) — stale reference
```

**Prompt:**
Fix `DELETE /users/:userId` with three changes:
1. Add `@UseGuards(RolesGuard)` + `@Roles(UserRole.ADMIN)` to the controller method
2. In the service, check `id === performedBy` and throw `ForbiddenException('Cannot delete yourself')`
3. Before hard delete, nullify dangling references: `ticketRepo.update({ assigneeId: id }, { assigneeId: null })`,
   `commentRepo.update({ authorId: id }, { authorId: null })`, `projectRepo.update({ ownerId: id }, { ownerId: null })`
4. Make `authorId` (Comment) and `ownerId` (Project) nullable in their entities to support the nullification

**Fix applied:**
1. **Controller**: Added `@UseGuards(RolesGuard)` + `@Roles(UserRole.ADMIN)` to `delete()` method,
   matching the existing pattern in `tickets.controller.ts` and `projects.controller.ts`.
2. **Service**: Added self-delete guard at the top of `delete()` — throws `ForbiddenException` if
   `id === performedBy`. Injected `Ticket`, `Comment`, and `Project` repositories. Before
   `this.repo.delete(id)`, nullifies all three FK references.
3. **Entities**: Changed `@Column()` to `@Column({ nullable: true })` on `Comment.authorId` and
   `Project.ownerId`. `Ticket.assigneeId` was already nullable.
4. **Module**: Added `Ticket`, `Comment`, `Project` to `TypeOrmModule.forFeature()` in `UsersModule`.

Note: `Mention` entity has `onDelete: 'CASCADE'` on the User relation, so mentions are
auto-cleaned by the database when the user is deleted — no manual cleanup needed.

**Files changed:**
- src/users/users.controller.ts — ADMIN guard on delete
- src/users/users.service.ts — self-delete check, injected repos, nullify references
- src/users/users.module.ts — added Ticket, Comment, Project to TypeORM imports
- src/comments/comment.entity.ts — authorId made nullable
- src/projects/project.entity.ts — ownerId made nullable

**Tests:**
- All 31 tests passing (6 suites)
- Build: clean
