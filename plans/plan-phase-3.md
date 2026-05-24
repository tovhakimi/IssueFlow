# Phase 3: Projects + Tickets Core

## Goal
Implement the AuditLog (needed by everything else), Projects with soft-delete and workload, and Tickets with the core business rules — status lifecycle, auto-assignment, optimistic locking, and the DONE guard.

## Entities

### AuditLog
| Field       | Type         | Constraints                          |
|-------------|--------------|--------------------------------------|
| id          | int (AI)     | `@PrimaryGeneratedColumn()`          |
| actor       | enum         | `USER` | `SYSTEM`                    |
| action      | varchar      |                                      |
| entityType  | varchar      |                                      |
| entityId    | int          |                                      |
| performedBy | int          | nullable (null for SYSTEM actions)   |
| changes     | jsonb        | nullable                             |
| timestamp   | timestamp    | `@CreateDateColumn()`                |

### Project
| Field       | Type         | Constraints                          |
|-------------|--------------|--------------------------------------|
| id          | int (AI)     | `@PrimaryGeneratedColumn()`          |
| name        | varchar      |                                      |
| description | text         | nullable                             |
| ownerId     | int          | FK -> User, nullable                 |
| createdAt   | timestamp    | `@CreateDateColumn()`                |
| deletedAt   | timestamp    | `@DeleteDateColumn()` (soft-delete)  |

### Ticket
| Field       | Type         | Constraints                          |
|-------------|--------------|--------------------------------------|
| id          | int (AI)     | `@PrimaryGeneratedColumn()`          |
| title       | varchar      |                                      |
| description | text         | nullable                             |
| status      | enum         | TODO, IN_PROGRESS, IN_REVIEW, DONE   |
| priority    | enum         | LOW, MEDIUM, HIGH, CRITICAL          |
| type        | enum         | BUG, FEATURE, TECHNICAL              |
| projectId   | int          | FK -> Project                        |
| assigneeId  | int          | FK -> User, nullable                 |
| dueDate     | timestamp    | nullable                             |
| isOverdue   | boolean      | default false                        |
| version     | int          | `@VersionColumn()` (optimistic lock) |
| createdAt   | timestamp    | `@CreateDateColumn()`                |
| deletedAt   | timestamp    | `@DeleteDateColumn()` (soft-delete)  |

## API Routes

| Method | Route                          | Description              | Auth  | Notes                               |
|--------|--------------------------------|--------------------------|-------|--------------------------------------|
| GET    | /audit-logs                    | Query audit logs         | JWT   | Filters: entityType, entityId, action|
| POST   | /projects                      | Create project           | JWT   | 200                                  |
| GET    | /projects                      | List projects            | JWT   |                                      |
| GET    | /projects/deleted              | List soft-deleted         | ADMIN | Route before /:projectId             |
| GET    | /projects/:projectId           | Get one project          | JWT   |                                      |
| PATCH  | /projects/:projectId           | Update project           | JWT   |                                      |
| DELETE | /projects/:projectId           | Soft-delete project      | JWT   |                                      |
| POST   | /projects/:projectId/restore   | Restore project          | ADMIN |                                      |
| GET    | /projects/:projectId/workload  | Developer workload       | JWT   | Raw SQL query                        |
| POST   | /tickets                       | Create ticket            | JWT   | Triggers auto-assignment             |
| GET    | /tickets                       | List tickets             | JWT   | `?projectId=` filter                 |
| GET    | /tickets/deleted               | List soft-deleted tickets| ADMIN | Route before /:ticketId              |
| GET    | /tickets/:ticketId             | Get one ticket           | JWT   |                                      |
| PATCH  | /tickets/:ticketId             | Update ticket            | JWT   | Status lifecycle + optimistic lock   |
| DELETE | /tickets/:ticketId             | Soft-delete ticket       | JWT   |                                      |
| POST   | /tickets/:ticketId/restore     | Restore ticket           | ADMIN |                                      |

## Key Design Decisions
- **AuditLog built first** — other modules depend on it; AuditLogModule exports AuditLogService so any module can inject it without circular deps
- **Status lifecycle: forward-only in service layer** — `STATUS_ORDER` array, compare indices. Reject backward transitions with `BadRequestException`
- **DONE guard** — any update to a DONE ticket throws `ForbiddenException`, checked before all other update logic
- **Auto-assignment via raw SQL** — TypeORM's ORM can't cleanly express `COUNT FILTER WHERE` with tie-breaking. Query selects developer with fewest non-DONE tickets in the project, tie-broken by `createdAt ASC`
- **Two audit entries for auto-assign** — `actor=USER/action=CREATE` then `actor=SYSTEM/action=AUTO_ASSIGN` keeps the audit trail honest
- **Workload endpoint uses raw SQL** — same reasoning as auto-assign; needs LEFT JOIN + FILTER aggregate
- **Route ordering** — `/deleted` and `/export` declared before `/:ticketId` in the controller to prevent NestJS from matching them as params

## Dependencies on Other Phases
- Phase 2: User entity and UsersModule must exist (Ticket references User via assigneeId)

## Risks & Edge Cases
- Auto-assignment with no developers in the project must return `undefined` gracefully, not crash
- Workload query must use LEFT JOIN so developers with zero tickets still appear
- Optimistic lock version must be required on updates (not optional) or clients can bypass conflict detection
- `findDeleted()` must use `createQueryBuilder().withDeleted().where('deletedAt IS NOT NULL')` — TypeORM's default scoping hides soft-deleted records
