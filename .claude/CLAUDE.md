# IssueFlow — Claude Code Instructions

## Project
NestJS 11 + TypeScript 5 + TypeORM + PostgreSQL REST API.
Assignment: TDP 2026 IssueFlow ticket management platform.

## Stack
- NestJS 11, TypeScript 5
- TypeORM with PostgreSQL (compose.yml already configured — do not modify it)
- JWT auth via @nestjs/jwt + @nestjs/passport
- class-validator + class-transformer for all DTOs
- @nestjs/schedule for cron jobs (auto-escalation)
- multer for file uploads (attachments, CSV import)
- csv-parse + csv-stringify for CSV export/import
- Jest for unit and e2e tests

## Architecture
One NestJS module per domain:
- UsersModule
- AuthModule
- ProjectsModule
- TicketsModule (includes dependencies, attachments, export/import, soft-delete)
- CommentsModule (includes mentions)
- AuditLogModule
- SchedulerModule (auto-escalation cron job)

## API Contract (MUST follow exactly)
- IDs are auto-increment integers (NOT uuid)
- Update user: POST /users/update/:userId (not PATCH)
- Update project: PATCH /projects/:projectId
- Update ticket: PATCH /tickets/:ticketId
- Update comment: PATCH /tickets/:ticketId/comments/:commentId
- All endpoints return 200 OK (not 201 for creates)
- Auth endpoints: POST /auth/login, POST /auth/logout, GET /auth/me
- Workload: GET /projects/:projectId/workload
- Mentions: GET /users/:userId/mentions

## Entity Rules
- All IDs: @PrimaryGeneratedColumn() (integer)
- Soft delete on Ticket and Project: @DeleteDateColumn()
- Optimistic locking on Ticket and Comment: @VersionColumn()
- AuditLog: append-only, never updated or deleted

## Business Rules — NEVER skip these
1. Ticket status lifecycle: TODO → IN_PROGRESS → IN_REVIEW → DONE only (no backward)
2. DONE tickets cannot be updated at all
3. Optimistic locking: concurrent PATCH on same ticket/comment returns 409
4. Soft delete only for tickets and projects — no hard delete exposed
5. Restore endpoints (POST /:id/restore) are ADMIN-only
6. GET /tickets/deleted and GET /projects/deleted are ADMIN-only
7. Ticket cannot transition to DONE if it has unresolved dependencies (blockers not in DONE)
8. Both tickets in a dependency must belong to the same project
9. Auto-assignment: on ticket create with no assigneeId, assign least-loaded DEVELOPER
   in the project (tie-break: earliest createdAt). Record in AuditLog with actor=SYSTEM
10. Auto-escalation cron: for each overdue ticket (dueDate < now, status != DONE):
    LOW→MEDIUM→HIGH→CRITICAL, then set isOverdue=true. Idempotent on CRITICAL.
    Manual PATCH priority resets isOverdue=false.
11. @mentions: parse @username from comment body on create/update.
    Re-evaluate on update (add new, remove stale). Case-insensitive matching.
12. Attachment constraints: max 10MB, allowed types: image/png, image/jpeg,
    application/pdf, text/plain
13. Every state-changing action writes to AuditLog:
    { actor: 'USER'|'SYSTEM', action, entityType, entityId, performedBy, timestamp }

## Testing
- Run: npm run test, npm run test:e2e