# Phase 0: Architecture & Planning

## Goal
Design the full system architecture before writing any code. Establish module boundaries, data model, API contracts, and a phased build order — so every subsequent phase has a clear scope and no backtracking.

## Module Map

```
AppModule
  |-- UsersModule        (User CRUD, password hashing)
  |-- AuthModule         (JWT login/logout/me, guards, decorators)
  |-- ProjectsModule     (Project CRUD, soft-delete, workload)
  |-- TicketsModule      (Ticket CRUD, status lifecycle, auto-assign,
  |                       dependencies, attachments, CSV export/import)
  |-- CommentsModule     (Comment CRUD, @mention sync, MentionsController)
  |-- AuditLogModule     (Append-only log, query filters)
  |-- SchedulerModule    (Hourly auto-escalation cron)
```

## Data Model Overview

| Entity           | PK      | Soft Delete | Versioned | Key FKs                    |
|------------------|---------|-------------|-----------|----------------------------|
| User             | int AI  | No          | No        | -                          |
| Project          | int AI  | Yes         | No        | ownerId -> User            |
| Ticket           | int AI  | Yes         | Yes       | projectId, assigneeId      |
| Comment          | int AI  | No          | Yes       | ticketId, authorId -> User |
| Mention          | int AI  | No          | No        | commentId, userId          |
| TicketDependency | int AI  | No          | No        | ticketId, blockedById      |
| Attachment       | int AI  | No          | No        | ticketId                   |
| AuditLog         | int AI  | No          | No        | performedBy (nullable)     |

## Key Design Decisions
- **Global JWT guard via APP_GUARD** — because nearly every route needs auth; `@Public()` opt-out is simpler than per-route opt-in
- **One module per domain, Tickets absorbs sub-features** — dependencies, attachments, and CSV are tightly coupled to tickets; separate modules would create circular deps
- **Auto-increment IDs, not UUIDs** — the spec is explicit about integer IDs
- **Append-only AuditLog** — no update or delete methods; prevents tampering with the audit trail
- **Status lifecycle in service layer, not DB constraint** — allows meaningful error messages on invalid transitions
- **CLAUDE.md written before code** — locks in the API contract and business rules so Claude Code doesn't drift from the spec

## Phase Breakdown

| Phase | Name                          | Scope                                              |
|-------|-------------------------------|-----------------------------------------------------|
| 1     | document-phase Skill          | Build automation for tracking what each phase does  |
| 2     | Foundation + Users + Auth     | TypeORM config, User entity, JWT auth flow          |
| 3     | Projects + Tickets Core       | AuditLog, Project, Ticket, status lifecycle         |
| 4     | Comments + Mentions + AuditLog| Comment, Mention, @mention sync, audit wiring       |
| 5     | Deps + Attachments + CSV      | Dependencies, file uploads, export/import           |
| 6     | Scheduler                     | Auto-escalation cron job                            |
| 7     | Tests                         | Unit + e2e test suites                              |
| 8     | Documentation + Dockerize     | Docs pass, Dockerfile, compose                      |

## Risks & Edge Cases
- **Circular dependency between modules** — MentionsController needs Comment data but route starts with `/users/`. Solution: put it in CommentsModule.
- **Route ordering in NestJS** — static routes like `/deleted` and `/export` must be declared before `/:ticketId` or they'll be swallowed by the param matcher.
- **Optimistic locking edge case** — TypeORM's `@VersionColumn` throws its own error on save; must catch and re-throw as 409, not let it bubble as 500.
- **Auto-assignment with no developers** — query must handle empty result gracefully (return undefined, not crash).
