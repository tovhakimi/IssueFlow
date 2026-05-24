# Phase 7: Testing

## Goal
Write comprehensive unit and end-to-end tests covering all critical business rules, ensuring correctness without requiring a running PostgreSQL instance for unit tests.

## Test Strategy

| Layer      | Framework | DB Required | What It Tests                               |
|------------|-----------|-------------|---------------------------------------------|
| Unit       | Jest      | No          | Service logic with mocked repositories      |
| E2E        | Jest + supertest | No   | HTTP layer with in-memory mocked providers  |

## Unit Test Plan

### tickets.service.spec.ts
| Test Case                          | Asserts                                           |
|------------------------------------|---------------------------------------------------|
| Forward status transition          | TODO -> IN_PROGRESS succeeds                      |
| Backward status transition         | IN_PROGRESS -> TODO throws BadRequestException    |
| DONE ticket update guard           | Any update to DONE ticket throws ForbiddenException|
| Optimistic lock: version match     | Save succeeds when versions match                 |
| Optimistic lock: version mismatch  | ConflictException when versions differ            |
| Auto-assignment fires              | No assigneeId -> autoAssign called -> SYSTEM log  |
| Auto-assignment audit log          | Two log entries: USER/CREATE + SYSTEM/AUTO_ASSIGN |
| Priority reset clears isOverdue    | PATCH with priority -> isOverdue = false          |
| Blocker check on DONE transition   | Non-DONE blocker -> BadRequestException           |

### comments.service.spec.ts
| Test Case                     | Asserts                                         |
|-------------------------------|--------------------------------------------------|
| @mention parsing              | @alice and @bob both resolved                   |
| Case-insensitive matching     | @ALICE matches user 'alice'                     |
| Stale mention removal         | Removed username no longer in mentions           |
| New mention on update         | New @username creates new Mention row            |
| Optimistic lock on comment    | Version mismatch -> ConflictException            |

### escalation.service.spec.ts
| Test Case               | Asserts                                           |
|--------------------------|---------------------------------------------------|
| handleEscalation wiring | Calls ticketsService.escalateOverdueTickets()      |

## E2E Test Plan

### test/app.e2e-spec.ts (in-memory mocks, no DB)
| Test Case                    | Asserts                                          |
|------------------------------|--------------------------------------------------|
| Create user -> login         | Returns accessToken                              |
| GET /auth/me                 | Returns user from JWT                            |
| Logout -> reuse token        | Returns 401                                      |
| Re-login -> new token works  | Fresh token accepted                             |
| GET /users -> no passwordHash| Response shape excludes sensitive field           |
| All responses return 200     | Not 201 for creates                              |

## Key Design Decisions
- **Mocked repositories in unit tests** — allows testing business logic without a database; faster and more reliable in CI
- **No DB-dependent e2e tests** — would require running PostgreSQL in CI pipeline; out of scope for this assignment
- **Test isolation** — each test case resets mocks to avoid state leaking between tests
- **Coverage targets** — focus on business rules (status lifecycle, optimistic lock, auto-assign) rather than CRUD boilerplate

## Dependencies on Other Phases
- All implementation phases (2-6) must be complete before comprehensive testing

## Risks & Edge Cases
- Mock setup must accurately reflect real TypeORM behavior (e.g., `save()` returns the entity with updated version)
- E2e tests must set `JWT_SECRET` env var before module compilation or JwtStrategy will use a different secret
- Tests that check audit log must verify the exact number and shape of log entries
